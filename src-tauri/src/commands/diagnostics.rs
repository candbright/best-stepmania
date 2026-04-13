use crate::AppState;
use std::fmt::Write as _;
use std::io::Write;
use std::path::{Path, PathBuf};
#[cfg(target_os = "linux")]
use std::path::Path as LinuxPath;
use tauri::State;

/// 避免把异常大的日志整包打进 zip（仍可在 manifest 里看到路径与原因）。
const MAX_LOG_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDiagnosticsResult {
    pub path: String,
}

/// Collects diagnostic data and exports it to a zip file.
/// Returns the path to the exported zip file.
#[tauri::command]
pub fn export_diagnostics(state: State<AppState>) -> Result<ExportDiagnosticsResult, String> {
    let data_dir = &state.data_dir;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let export_filename = format!("best-stepmania-diagnostics-{}.zip", timestamp);
    let export_path = data_dir.join(&export_filename);

    let songs_dir = data_dir.join("songs");

    let file = std::fs::File::create(&export_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let mut manifest = String::from("Best-StepMania diagnostics export manifest\n\n");

    // System + runtime snapshot
    let system_info = collect_system_info(&state);
    zip.start_file("system-info.txt", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(system_info.as_bytes())
        .map_err(|e| e.to_string())?;
    writeln!(manifest, "- system-info.txt").unwrap();

    // config.toml
    let config_path = data_dir.join("config.toml");
    if config_path.exists() {
        zip_write_file_from_disk(&mut zip, options, "config.toml", &config_path, &mut manifest)?;
    } else {
        writeln!(manifest, "- config.toml: (missing)").unwrap();
    }

    // Profile DB and SQLite sidecar files (WAL / SHM)
    for (label, name) in [
        ("profiles.db", "profiles.db"),
        ("profiles.db-wal", "profiles.db-wal"),
        ("profiles.db-shm", "profiles.db-shm"),
    ] {
        let p = data_dir.join(name);
        zip_write_optional_binary(
            &mut zip,
            options,
            &format!("database/{name}"),
            &p,
            label,
            &mut manifest,
        )?;
    }

    // Corrupt DB backups from recovery flow
    if let Ok(entries) = std::fs::read_dir(data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(fname) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !(fname.starts_with("profiles.db.corrupt") && path.is_file()) {
                continue;
            }
            let dest = format!("profile-backups/{fname}");
            zip_write_file_from_disk(&mut zip, options, &dest, &path, &mut manifest)?;
        }
    }

    // Recursive logs under data_dir (excluding songs/ tree)
    append_logs_under(
        data_dir,
        data_dir,
        &songs_dir,
        &export_path,
        &mut zip,
        options,
        &mut manifest,
    )?;

    // Song library snapshot (no audio — metadata + paths only)
    {
        let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&mgr.songs).map_err(|e| e.to_string())?;
        zip.start_file("song-library.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        writeln!(
            manifest,
            "- song-library.json ({} songs)",
            mgr.songs.len()
        )
        .unwrap();
    }

    // Last scan / background scan status
    {
        let scan = state.scan_state.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*scan).map_err(|e| e.to_string())?;
        zip.start_file("scan-state.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        writeln!(manifest, "- scan-state.json").unwrap();
    }

    // Registered noteskin names
    {
        let mgr = state.noteskin_manager.lock().map_err(|e| e.to_string())?;
        let mut skins = mgr.list_skins();
        skins.sort();
        let body = format!(
            "current: {}\nall ({}):\n{}\n",
            mgr.get_current().name,
            skins.len(),
            skins.join("\n")
        );
        zip.start_file("noteskins.txt", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
        writeln!(manifest, "- noteskins.txt").unwrap();
    }

    // Chart parse cache keys (paths only)
    {
        let cache = state.chart_cache.lock().map_err(|e| e.to_string())?;
        let mut lines = format!("entries: {}\n\n", cache.chart_cache_len());
        for p in cache.diagnostic_cached_paths() {
            let _ = writeln!(lines, "{}", p.display());
        }
        zip.start_file("chart-cache-paths.txt", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(lines.as_bytes()).map_err(|e| e.to_string())?;
        writeln!(manifest, "- chart-cache-paths.txt").unwrap();
    }

    zip.start_file("export-manifest.txt", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;

    Ok(ExportDiagnosticsResult {
        path: export_path.to_string_lossy().to_string(),
    })
}

fn zip_write_file_from_disk(
    zip: &mut zip::ZipWriter<std::fs::File>,
    options: zip::write::FileOptions,
    zip_path: &str,
    disk_path: &Path,
    manifest: &mut String,
) -> Result<(), String> {
    match std::fs::read(disk_path) {
        Ok(bytes) => {
            zip.start_file(zip_path, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
            writeln!(
                manifest,
                "- {zip_path} ({} bytes from {})",
                bytes.len(),
                disk_path.display()
            )
            .unwrap();
        }
        Err(e) => {
            writeln!(
                manifest,
                "- {zip_path}: SKIP read {} — {e}",
                disk_path.display()
            )
            .unwrap();
        }
    }
    Ok(())
}

fn zip_write_optional_binary(
    zip: &mut zip::ZipWriter<std::fs::File>,
    options: zip::write::FileOptions,
    zip_path: &str,
    disk_path: &Path,
    label: &str,
    manifest: &mut String,
) -> Result<(), String> {
    if !disk_path.exists() {
        writeln!(manifest, "- {label}: (missing)").unwrap();
        return Ok(());
    }
    zip_write_file_from_disk(zip, options, zip_path, disk_path, manifest)
}

fn append_logs_under(
    dir: &Path,
    data_dir: &Path,
    songs_dir: &Path,
    skip_file: &Path,
    zip: &mut zip::ZipWriter<std::fs::File>,
    options: zip::write::FileOptions,
    manifest: &mut String,
) -> Result<(), String> {
    // 曲库体量可能极大，不在 songs/ 下搜寻 .log，避免全盘遍历。
    if dir.starts_with(songs_dir) {
        return Ok(());
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            writeln!(
                manifest,
                "- logs: cannot read dir {} — {e}",
                dir.display()
            )
            .unwrap();
            return Ok(());
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if &path == skip_file {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                writeln!(manifest, "- logs: skip {:?} — metadata {e}", path).unwrap();
                continue;
            }
        };

        if meta.is_dir() {
            append_logs_under(
                &path,
                data_dir,
                songs_dir,
                skip_file,
                zip,
                options,
                manifest,
            )?;
            continue;
        }

        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with("best-stepmania-diagnostics-") && name.ends_with(".zip") {
            continue;
        }

        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("log") {
            continue;
        }

        if meta.len() > MAX_LOG_FILE_BYTES {
            writeln!(
                manifest,
                "- skip log {} ({} bytes > cap {})",
                path.display(),
                meta.len(),
                MAX_LOG_FILE_BYTES
            )
            .unwrap();
            continue;
        }

        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                writeln!(manifest, "- skip log {} — read {e}", path.display()).unwrap();
                continue;
            }
        };

        let rel = path.strip_prefix(data_dir).unwrap_or(&path);
        let zip_name = format!("logs/{}", rel.to_string_lossy().replace('\\', "/"));
        zip.start_file(&zip_name, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
        writeln!(
            manifest,
            "- added log {zip_name} ({} bytes)",
            bytes.len()
        )
        .unwrap();
    }

    Ok(())
}

/// Opens the given path in the system's file explorer (only under app data dir).
#[tauri::command]
pub async fn open_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Path is empty".to_string());
    }
    let requested = PathBuf::from(path);
    let data_canon = std::fs::canonicalize(&state.data_dir).map_err(|e| e.to_string())?;
    let req_canon = std::fs::canonicalize(&requested).map_err(|e| e.to_string())?;
    if !req_canon.starts_with(&data_canon) {
        return Err("Path must be under the application data directory".to_string());
    }
    let open_arg = req_canon.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&open_arg)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&open_arg)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, open the directory since we can't easily select the file
        let path_buf = PathBuf::from(&open_arg);
        let dir_path = if path_buf.is_file() {
            path_buf
                .parent()
                .map(LinuxPath::to_path_buf)
                .unwrap_or(path_buf)
        } else {
            path_buf
        };
        std::process::Command::new("xdg-open")
            .arg(&dir_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn collect_system_info(state: &AppState) -> String {
    let mut info = String::new();

    info.push_str("Best-StepMania Diagnostics Report\n");
    info.push_str("==================================\n\n");

    info.push_str(&format!("App Version: {}\n", env!("CARGO_PKG_VERSION")));

    info.push_str(&format!(
        "Generated: {}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    ));

    info.push_str(&format!("OS: {}\n", std::env::consts::OS));
    info.push_str(&format!("OS Family: {}\n", std::env::consts::FAMILY));
    info.push_str(&format!("Architecture: {}\n", std::env::consts::ARCH));

    if let Ok(n) = std::thread::available_parallelism() {
        info.push_str(&format!("Available parallelism: {}\n", n.get()));
    }

    info.push_str(&format!("Data Directory: {}\n", state.data_dir.display()));

    if let Ok(base) = state.songs_base_dir.lock() {
        info.push_str(&format!("Songs Directory (configured): {}\n", base.as_str()));
    }

    info.push_str("\n--- Relevant environment variables ---\n");
    for key in [
        "RUST_LOG",
        "RUST_BACKTRACE",
        "TAURI_ENV_DEBUG",
        "PATH",
    ] {
        match std::env::var(key) {
            Ok(val) => {
                if key == "PATH" {
                    let len = val.len();
                    let preview: String = val.chars().take(500).collect();
                    let truncated = if len > 500 { " …(truncated)" } else { "" };
                    info.push_str(&format!("{key} (len={len}): {preview}{truncated}\n"));
                } else {
                    info.push_str(&format!("{key}={val}\n"));
                }
            }
            Err(_) => info.push_str(&format!("{key}: <not set>\n")),
        }
    }

    info
}
