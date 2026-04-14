use crate::AppState;
use serde::{Deserialize, Serialize};
use sm_song::SongManager;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

/// Reserved directory name for the root song pack (always exists, cannot be deleted).
const ROOT_PACK_ID: &str = ".root";

/// One directory segment under `songs_dir` for a user pack (or [`ROOT_PACK_ID`]).
/// Rejects traversal (`..`), separators, and characters outside the allowlist used by `create_empty_pack`.
fn validate_user_pack_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Pack name cannot be empty".to_string());
    }
    if name == ROOT_PACK_ID {
        return Ok(name);
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Invalid pack name".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_') {
        return Err("Pack name contains invalid characters".to_string());
    }
    Ok(name)
}

/// Target directory for songs in a pack: root (`.root`) or a validated subfolder of `songs_dir`.
fn pack_content_dir(songs_dir: &Path, pack_name: &str) -> Result<std::path::PathBuf, String> {
    let p = pack_name.trim();
    if p.is_empty() || p == ROOT_PACK_ID {
        return Ok(songs_dir.join(ROOT_PACK_ID));
    }
    let name = validate_user_pack_name(p)?;
    Ok(songs_dir.join(name))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<String>,
    pub warnings: Vec<ImportWarning>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarning {
    pub song_name: String,
    pub missing_audio: bool,
    pub missing_cover: bool,
    pub missing_chart: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSongRequest {
    pub pack_name: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub subtitle: Option<String>,
    pub genre: Option<String>,
    pub music_source_path: Option<String>,
    pub cover_source_path: Option<String>,
    /// Optional background image (defaults to same file as banner when omitted)
    pub background_source_path: Option<String>,
    /// Global offset in seconds (SM #OFFSET); default 0
    pub offset: Option<f64>,
    /// Initial BPM at beat 0 (SM #BPMS); default 120
    pub bpm: Option<f64>,
    /// Preview start in seconds (#SAMPLESTART); default 0
    pub sample_start: Option<f64>,
    /// Preview length in seconds (#SAMPLELENGTH); default 12
    pub sample_length: Option<f64>,
    /// Whether to add an empty chart to the created .sm file
    pub create_chart: Option<bool>,
    /// Steps type for the initial chart (e.g. "dance-single")
    pub steps_type: Option<String>,
    /// Difficulty label for the initial chart (e.g. "Easy")
    pub difficulty: Option<String>,
    /// Numeric meter/level for the initial chart
    pub meter: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSongResult {
    pub song_path: String,
    pub chart_path: String,
    pub used_default_music: bool,
    pub used_default_cover: bool,
}

/// 导入歌曲前的准备：复制文件夹到目标位置，返回需要填写的信息。
/// 如果歌曲有图表文件，直接导入并返回 missingChart=false。
/// 如果没有图表文件，返回 missingChart=true，歌曲目录已复制但尚未创建图表文件。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareImportResult {
    /// 歌曲目录路径（已复制到目标位置）
    pub song_dir: String,
    /// 原始文件夹名称
    pub folder_name: String,
    /// 是否有音频文件
    pub has_audio: bool,
    /// 是否有封面文件
    pub has_cover: bool,
    /// 是否有图表文件
    pub has_chart: bool,
    /// 目标 pack 名称（空字符串表示根目录）
    pub pack_name: String,
}

/// 导入单首歌曲：将源目录复制到指定的 pack 目录（或根目录），然后触发后台重新扫描。
/// pack_name 为空字符串时表示导入到根目录。
#[tauri::command]
pub async fn import_single_song(
    state: State<'_, AppState>,
    source_path: String,
    pack_name: String,
) -> Result<ImportResult, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }
    if !source.is_dir() {
        return Err("Source must be a directory".to_string());
    }

    // 获取目标目录
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    std::fs::create_dir_all(&songs_dir).map_err(|e| e.to_string())?;

    let target_dir = pack_content_dir(&songs_dir, &pack_name)?;

    // 在阻塞线程中执行文件复制
    let source_path_clone = source_path.clone();
    let target_dir_clone = target_dir.clone();
    let (imported, skipped, errors, warnings) = tauri::async_runtime::spawn_blocking(move || {
        let source = Path::new(&source_path_clone);
        let mut imported = 0usize;
        let mut skipped = 0usize;
        let mut errors: Vec<String> = Vec::new();
        let mut warnings: Vec<ImportWarning> = Vec::new();

        match copy_song_folder_with_defaults(source, &target_dir_clone, &mut warnings) {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => errors.push(e),
        }

        (imported, skipped, errors, warnings)
    })
    .await
    .map_err(|e| format!("Import task failed: {e}"))?;

    // 导入完成后，触发后台重新扫描
    if imported > 0 {
        rescan_songs(&state).await?;
    }

    Ok(ImportResult {
        imported_count: imported,
        skipped_count: skipped,
        errors,
        warnings,
    })
}

/// 导入歌曲前的准备：复制文件夹到目标位置，返回需要填写的信息。
/// 调用此命令后，需要调用 create_chart_for_imported 来创建图表文件。
#[tauri::command]
pub async fn prepare_song_import(
    state: State<'_, AppState>,
    source_path: String,
    pack_name: String,
) -> Result<PrepareImportResult, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }
    if !source.is_dir() {
        return Err("Source must be a directory".to_string());
    }

    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    std::fs::create_dir_all(&songs_dir).map_err(|e| e.to_string())?;

    let target_dir = pack_content_dir(&songs_dir, &pack_name)?;

    let source_clone = source_path.clone();
    let target_clone = target_dir.clone();
    let folder_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("imported-song")
        .to_string();
    let folder_name_clone = folder_name.clone();

    // 在阻塞线程中复制文件夹
    let (song_dir, has_audio, has_cover, has_chart) = tauri::async_runtime::spawn_blocking(move || -> Result<(std::path::PathBuf, bool, bool, bool), String> {
        let source = Path::new(&source_clone);
        // 如果目标目录已存在（同名曲包的情况），自动生成不冲突的目录名
        let target = unique_dir_under(&target_clone, folder_name_clone.as_str());

        std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        copy_dir_recursive(source, &target).map_err(|e| e.to_string())?;

        let has_audio = find_audio_file(&target).is_some();
        let has_cover = find_cover_file(&target).is_some();
        let has_chart = has_chart_file(&target);

        Ok((target, has_audio, has_cover, has_chart))
    })
    .await
    .map_err(|e| format!("Prepare import failed: {e}"))??;

    Ok(PrepareImportResult {
        song_dir: song_dir.to_string_lossy().to_string(),
        folder_name,
        has_audio,
        has_cover,
        has_chart,
        pack_name,
    })
}

/// 为已导入的歌曲创建图表文件。在调用 prepare_song_import 后，如果没有图表文件，需要调用此命令创建图表。
#[tauri::command]
pub async fn create_chart_for_imported(
    state: State<'_, AppState>,
    song_dir: String,
    title: String,
    artist: String,
    subtitle: String,
    genre: String,
    bpm: f64,
    offset: f64,
    steps_type: String,
    difficulty: String,
    meter: i32,
    create_chart: bool,
    music_source_path: String,
    cover_source_path: String,
    background_source_path: String,
) -> Result<String, String> {
    let dir = Path::new(&song_dir);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("歌曲目录不存在: {}", song_dir));
    }

    // 确定音频文件路径：优先使用用户指定的文件
    let mut audio_file_path = dir.join("music.wav");
    if !music_source_path.trim().is_empty() {
        let src_path = Path::new(&music_source_path);
        if src_path.exists() && src_path.is_file() {
            let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("wav");
            let dest = dir.join(format!("music.{}", ext));
            std::fs::copy(src_path, &dest).map_err(|e| e.to_string())?;
            audio_file_path = dest;
        }
    } else if find_audio_file(dir).is_none() {
        write_default_wav(&audio_file_path).map_err(|e| e.to_string())?;
    } else {
        if let Some(found) = find_audio_file(dir) {
            audio_file_path = found;
        }
    }
    let audio_file_name = audio_file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("music.wav")
        .to_string();

    // 确定封面文件路径：优先使用用户指定的文件
    let mut banner_file_path = dir.join("banner.bmp");
    if !cover_source_path.trim().is_empty() {
        let src_path = Path::new(&cover_source_path);
        if src_path.exists() && src_path.is_file() {
            let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("bmp");
            let dest = dir.join(format!("banner.{}", ext));
            std::fs::copy(src_path, &dest).map_err(|e| e.to_string())?;
            banner_file_path = dest;
        }
    } else if find_cover_file(dir).is_none() {
        write_default_banner_bmp(&banner_file_path, 512, 384).map_err(|e| e.to_string())?;
    } else {
        if let Some(found) = find_cover_file(dir) {
            banner_file_path = found;
        }
    }
    let banner_file_name = banner_file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("banner.bmp")
        .to_string();

    // 确定背景文件路径：优先使用用户指定的文件，否则使用封面
    let background_file_name = if !background_source_path.trim().is_empty() {
        let src_path = Path::new(&background_source_path);
        if src_path.exists() && src_path.is_file() {
            let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("bmp");
            let dest = dir.join(format!("background.{}", ext));
            std::fs::copy(src_path, &dest).map_err(|e| e.to_string())?;
            dest.file_name().and_then(|n| n.to_str()).unwrap_or("background.bmp").to_string()
        } else {
            banner_file_name.clone()
        }
    } else {
        banner_file_name.clone()
    };

    // 如果不创建图表，只更新歌曲信息并重新扫描
    if !create_chart {
        let chart_path = dir.join("song.ssc");

        let escaped_title = escape_sm_value(&title);
        let escaped_artist = escape_sm_value(&artist);
        let escaped_subtitle = escape_sm_value(&subtitle);
        let escaped_genre = escape_sm_value(&genre);

        let sm_content = format!(
            "#TITLE:{};\n#SUBTITLE:{};\n#ARTIST:{};\n#GENRE:{};\n#MUSIC:{};\n#BANNER:{};\n#BACKGROUND:{};\n#SAMPLESTART:0.000;\n#SAMPLELENGTH:12.000;\n#OFFSET:{:.3};\n#BPMS:0.000={:.3};\n",
            escaped_title,
            escaped_subtitle,
            escaped_artist,
            escaped_genre,
            escape_sm_value(&audio_file_name),
            escape_sm_value(&banner_file_name),
            escape_sm_value(&background_file_name),
            offset,
            bpm,
        );

        std::fs::write(&chart_path, sm_content).map_err(|e| e.to_string())?;

        rescan_songs(&state).await?;
        return Ok(chart_path.to_string_lossy().to_string());
    }

    let chart_path = dir.join("song.ssc");

    let escaped_title = escape_sm_value(&title);
    let escaped_artist = escape_sm_value(&artist);
    let escaped_subtitle = escape_sm_value(&subtitle);
    let escaped_genre = escape_sm_value(&genre);

    let sm_content = format!(
        "#TITLE:{};\n#SUBTITLE:{};\n#ARTIST:{};\n#GENRE:{};\n#MUSIC:{};\n#BANNER:{};\n#BACKGROUND:{};\n#SAMPLESTART:0.000;\n#SAMPLELENGTH:12.000;\n#OFFSET:{:.3};\n#BPMS:0.000={:.3};\n\n#NOTES:\n     {}:\n     :\n     {}:\n     {}:\n     0,0,0,0:\n;\n",
        escaped_title,
        escaped_subtitle,
        escaped_artist,
        escaped_genre,
        escape_sm_value(&audio_file_name),
        escape_sm_value(&banner_file_name),
        escape_sm_value(&background_file_name),
        offset,
        bpm,
        escape_sm_value(&steps_type),
        escape_sm_value(&difficulty),
        meter,
    );

    std::fs::write(&chart_path, sm_content).map_err(|e| e.to_string())?;

    // 重新扫描歌曲
    rescan_songs(&state).await?;

    Ok(chart_path.to_string_lossy().to_string())
}

/// 导入歌曲包：将源目录复制到 app songs 目录，然后触发后台重新扫描。
/// target_base 参数保留但忽略，始终写入 app 内置 songs 目录。
#[tauri::command]
pub async fn import_song_pack(
    state: State<'_, AppState>,
    source_path: String,
    _target_base: String,
) -> Result<ImportResult, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }
    if !source.is_dir() {
        return Err("Source must be a directory".to_string());
    }

    // 目标始终是 app songs 目录
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    std::fs::create_dir_all(&songs_dir).map_err(|e| e.to_string())?;

    // 在阻塞线程中执行文件复制
    let source_path_clone = source_path.clone();
    let songs_dir_clone = songs_dir.clone();
    let (imported, skipped, errors, warnings) = tauri::async_runtime::spawn_blocking(move || {
        let source = Path::new(&source_path_clone);
        let mut imported = 0usize;
        let mut skipped = 0usize;
        let mut errors: Vec<String> = Vec::new();
        let mut warnings: Vec<ImportWarning> = Vec::new();

        let has_chart = has_chart_file(source);
        let has_audio = find_audio_file(source).is_some();
        
        // If source has chart OR audio, treat it as a single song
        if has_chart || has_audio {
            // 源目录本身就是一首歌，复制到根目录
            match copy_song_folder_with_defaults(source, &songs_dir_clone, &mut warnings) {
                Ok(true) => imported += 1,
                Ok(false) => skipped += 1,
                Err(e) => errors.push(e),
            }
        } else {
            // 源目录是曲包目录，获取曲包名称并在 songs 目录下创建对应曲包子目录
            let pack_name_os = source.file_name().and_then(|n| n.to_str()).unwrap_or("imported-pack");
            match validate_user_pack_name(pack_name_os).map_err(|e| {
                format!("{e} (folder name: {:?})", pack_name_os)
            }) {
                Err(e) => errors.push(e),
                Ok(pack_name) => {
                    let pack_target = songs_dir_clone.join(pack_name);

                    // 遍历源目录下的子目录（歌曲目录）
                    match std::fs::read_dir(source) {
                        Ok(entries) => {
                            for entry in entries.flatten() {
                                let p = entry.path();
                                if !p.is_dir() { continue; }

                                // Check if this directory has chart or audio (treat as song folder)
                                let has_chart = has_chart_file(&p);
                                let has_audio = find_audio_file(&p).is_some();

                                if has_chart || has_audio {
                                    match copy_song_folder_with_defaults(&p, &pack_target, &mut warnings) {
                                        Ok(true) => imported += 1,
                                        Ok(false) => skipped += 1,
                                        Err(e) => errors.push(e),
                                    }
                                } else {
                                    // 子目录不是歌曲目录，递归查找其中的歌曲
                                    match std::fs::read_dir(&p) {
                                        Ok(sub_entries) => {
                                            for sub in sub_entries.flatten() {
                                                let sp = sub.path();
                                                if sp.is_dir() {
                                                    let sub_has_chart = has_chart_file(&sp);
                                                    let sub_has_audio = find_audio_file(&sp).is_some();
                                                    if sub_has_chart || sub_has_audio {
                                                        match copy_song_folder_with_defaults(&sp, &pack_target, &mut warnings) {
                                                            Ok(true) => imported += 1,
                                                            Ok(false) => skipped += 1,
                                                            Err(e) => errors.push(e),
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Err(e) => errors.push(format!("{}: {}", p.display(), e)),
                                    }
                                }
                            }
                        }
                        Err(e) => errors.push(e.to_string()),
                    }
                }
            }
        }
        (imported, skipped, errors, warnings)
    })
    .await
    .map_err(|e| format!("Import task failed: {e}"))?;

    // 导入完成后，触发后台重新扫描
    if imported > 0 {
        rescan_songs(&state).await?;
    }

    Ok(ImportResult { imported_count: imported, skipped_count: skipped, errors, warnings })
}

/// 列出 songs 目录下的所有曲包（一级子目录），并始终包含 root 曲包。
#[tauri::command]
pub fn list_song_packs(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    if !songs_dir.exists() {
        std::fs::create_dir_all(&songs_dir).map_err(|e| e.to_string())?;
    }

    // 确保 root 曲包目录存在
    let root_dir = songs_dir.join(ROOT_PACK_ID);
    if !root_dir.exists() {
        std::fs::create_dir_all(&root_dir).map_err(|e| e.to_string())?;
    }

    let mut mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    // 重新扫描以获取最新状态
    mgr.scan_directory(&songs_dir.to_string_lossy()).map_err(|e| e.to_string())?;

    // Root 曲包：来自 .root 目录的歌曲（pack_name == ROOT_PACK_ID）
    let root_song_count = mgr.songs.iter()
        .filter(|s| s.pack_name == ROOT_PACK_ID)
        .count();
    let root_size_bytes = dir_size(&root_dir).unwrap_or(0);
    let root_size_mb = root_size_bytes as f64 / 1024.0 / 1024.0;

    let mut packs = Vec::new();
    // Root 曲包始终在列表最前面
    packs.push(serde_json::json!({
        "name": ROOT_PACK_ID,
        "path": root_dir.to_string_lossy(),
        "songCount": root_song_count,
        "sizeMb": (root_size_mb * 10.0).round() / 10.0,
        "isRoot": true,
    }));

    if let Ok(entries) = std::fs::read_dir(&songs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            let name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            // 跳过 root 曲包目录本身
            if name == ROOT_PACK_ID { continue; }
            // 统计该曲包下的歌曲数
            let song_count = mgr.songs.iter()
                .filter(|s| s.pack_name == name)
                .count();
            // 计算目录大小（MB）
            let size_bytes = dir_size(&path).unwrap_or(0);
            let size_mb = size_bytes as f64 / 1024.0 / 1024.0;
            packs.push(serde_json::json!({
                "name": name,
                "path": path.to_string_lossy(),
                "songCount": song_count,
                "sizeMb": (size_mb * 10.0).round() / 10.0,
                "isRoot": false,
            }));
        }
    }
    use std::cmp::Ordering;
    packs.sort_by(|a, b| {
        let a_root = a["isRoot"].as_bool().unwrap_or(false);
        let b_root = b["isRoot"].as_bool().unwrap_or(false);
        match (a_root, b_root) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")),
        }
    });
    Ok(packs)
}

/// 创建空曲包（在 songs 目录下创建一个新的空文件夹作为曲包）
#[tauri::command]
pub async fn create_empty_pack(
    state: State<'_, AppState>,
    pack_name: String,
) -> Result<(), String> {
    let pack_name = validate_user_pack_name(&pack_name)?;
    if pack_name == ROOT_PACK_ID {
        return Err("Cannot create the reserved root pack folder".to_string());
    }

    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };

    // 创建曲包目录
    let pack_path = songs_dir.join(pack_name);

    // 安全检查：确保是 songs_dir 的直接子目录
    if !pack_path.starts_with(&songs_dir) || pack_path == songs_dir {
        return Err("Invalid pack path".to_string());
    }

    // 检查是否已存在
    if pack_path.exists() {
        return Err(format!("Pack '{}' already exists", pack_name));
    }

    // 创建空目录
    std::fs::create_dir_all(&pack_path).map_err(|e| e.to_string())?;

    // 重新扫描以更新曲包列表
    rescan_songs(&state).await?;

    Ok(())
}

/// 删除指定曲包（songs 目录下的一级子目录）。root 曲包不可删除。
#[tauri::command]
pub async fn delete_song_pack(
    state: State<'_, AppState>,
    pack_name: String,
) -> Result<(), String> {
    // 禁止删除 root 曲包
    if pack_name.trim() == ROOT_PACK_ID {
        return Err("Cannot delete the root song pack".to_string());
    }
    let pack_name = validate_user_pack_name(&pack_name)?;
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    let pack_path = songs_dir.join(pack_name);
    // 安全检查：必须是 songs_dir 的直接子目录
    if !pack_path.starts_with(&songs_dir) || pack_path == songs_dir {
        return Err("Invalid pack path".to_string());
    }
    if !pack_path.exists() {
        return Err(format!("Pack not found: {}", pack_name));
    }
    std::fs::remove_dir_all(&pack_path).map_err(|e| e.to_string())?;

    // 重新扫描
    rescan_songs(&state).await?;
    Ok(())
}

/// 创建新歌曲目录（可放在根目录或指定曲包），并生成基础 .sm 文件。
/// 若未提供封面/音源，自动生成默认资源（封面 512x384，音源 wav）。
#[tauri::command]
pub async fn create_song(state: State<'_, AppState>, req: CreateSongRequest) -> Result<CreateSongResult, String> {
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    std::fs::create_dir_all(&songs_dir).map_err(|e| e.to_string())?;

    let title = req.title.unwrap_or_default().trim().to_string();
    let artist = req.artist.unwrap_or_default().trim().to_string();
    let subtitle = req.subtitle.unwrap_or_default().trim().to_string();
    let genre = req.genre.unwrap_or_default().trim().to_string();
    let pack_name_raw = req.pack_name.unwrap_or_default().trim().to_string();

    let song_title = if title.is_empty() { "New Song".to_string() } else { title };
    let song_artist = if artist.is_empty() { "Unknown Artist".to_string() } else { artist };
    let song_subtitle = subtitle;
    let song_genre = if genre.is_empty() { "Unknown".to_string() } else { genre };

    // 空包名或根目录均落在 `Songs/.root/`（与导入、曲包列表一致）
    let base_dir = pack_content_dir(&songs_dir, &pack_name_raw)?;
    std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;

    let mut song_dir_name = sanitize_for_path(&song_title);
    if song_dir_name.is_empty() {
        song_dir_name = "new-song".to_string();
    }
    let song_dir = unique_dir_under(&base_dir, &song_dir_name);
    std::fs::create_dir_all(&song_dir).map_err(|e| e.to_string())?;

    let (music_file_name, used_default_music) = if let Some(src) = req.music_source_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let src_path = std::path::PathBuf::from(src);
        if !src_path.exists() || !src_path.is_file() {
            return Err(format!("Music source does not exist: {}", src));
        }
        let ext = src_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_else(|| "bin".to_string());
        let file_name = format!("music.{}", ext);
        let dest = song_dir.join(&file_name);
        std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
        (file_name, false)
    } else {
        let file_name = "music.wav".to_string();
        write_default_wav(&song_dir.join(&file_name))?;
        (file_name, true)
    };

    let (banner_file_name, used_default_cover) = if let Some(src) = req.cover_source_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let src_path = std::path::PathBuf::from(src);
        if !src_path.exists() || !src_path.is_file() {
            return Err(format!("Cover source does not exist: {}", src));
        }
        let ext = src_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_else(|| "img".to_string());
        let file_name = format!("banner.{}", ext);
        let dest = song_dir.join(&file_name);
        std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
        (file_name, false)
    } else {
        let file_name = "banner.bmp".to_string();
        write_default_banner_bmp(&song_dir.join(&file_name), 512, 384)?;
        (file_name, true)
    };

    let background_file_name = if let Some(src) = req
        .background_source_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let src_path = std::path::PathBuf::from(src);
        if !src_path.exists() || !src_path.is_file() {
            return Err(format!("Background source does not exist: {}", src));
        }
        let ext = src_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_else(|| "img".to_string());
        let file_name = format!("bg.{}", ext);
        let dest = song_dir.join(&file_name);
        std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
        file_name
    } else {
        banner_file_name.clone()
    };

    let offset_sec = req.offset.unwrap_or(0.0);
    let offset_sec = if offset_sec.is_finite() {
        offset_sec.clamp(-600.0, 600.0)
    } else {
        0.0
    };
    let bpm_val = req.bpm.unwrap_or(120.0);
    let bpm_val = if bpm_val.is_finite() {
        bpm_val.clamp(20.0, 999.0)
    } else {
        120.0
    };
    let sample_start_sec = req.sample_start.unwrap_or(0.0);
    let sample_start_sec = if sample_start_sec.is_finite() {
        sample_start_sec.max(0.0)
    } else {
        0.0
    };
    let sample_len_sec = req.sample_length.unwrap_or(12.0);
    let sample_len_sec = if sample_len_sec.is_finite() {
        sample_len_sec.clamp(0.01, 600.0)
    } else {
        12.0
    };

    let chart_file_name = "song.sm";
    let chart_path = song_dir.join(chart_file_name);
    let escaped_title = escape_sm_value(&song_title);
    let escaped_subtitle = escape_sm_value(&song_subtitle);
    let escaped_artist = escape_sm_value(&song_artist);
    let escaped_genre = escape_sm_value(&song_genre);
    let escaped_music = escape_sm_value(&music_file_name);
    let escaped_banner = escape_sm_value(&banner_file_name);
    let escaped_background = escape_sm_value(&background_file_name);

    let sm_content = format!(
        "#TITLE:{};\n#SUBTITLE:{};\n#ARTIST:{};\n#GENRE:{};\n#MUSIC:{};\n#BANNER:{};\n#BACKGROUND:{};\n#SAMPLESTART:{:.3};\n#SAMPLELENGTH:{:.3};\n#OFFSET:{:.3};\n#BPMS:0.000={:.3};\n",
        escaped_title,
        escaped_subtitle,
        escaped_artist,
        escaped_genre,
        escaped_music,
        escaped_banner,
        escaped_background,
        sample_start_sec,
        sample_len_sec,
        offset_sec,
        bpm_val,
    );

    // Optionally append an empty chart (#NOTES section) to the .sm file
    let create_chart_flag = req.create_chart.unwrap_or(false);
    let full_sm_content = if create_chart_flag {
        let st = req.steps_type.as_deref().unwrap_or("dance-single");
        let diff = req.difficulty.as_deref().unwrap_or("Easy");
        let meter_val = req.meter.unwrap_or(5);
        format!(
            "{}\n#NOTES:\n     {}:\n     :\n     {}:\n     {}:\n     0,0,0,0:\n;\n",
            sm_content,
            escape_sm_value(st),
            escape_sm_value(diff),
            meter_val,
        )
    } else {
        sm_content
    };
    std::fs::write(&chart_path, full_sm_content).map_err(|e| e.to_string())?;

    rescan_songs(&state).await?;

    Ok(CreateSongResult {
        song_path: song_dir.to_string_lossy().to_string(),
        chart_path: chart_path.to_string_lossy().to_string(),
        used_default_music,
        used_default_cover,
    })
}

/// 删除指定歌曲目录（必须在 songs_dir 下，不能是 songs_dir 本身）
#[tauri::command]
pub async fn delete_song(state: State<'_, AppState>, song_path: String) -> Result<(), String> {
    let songs_dir = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        std::path::PathBuf::from(base.clone())
    };
    let path = std::path::PathBuf::from(&song_path);
    if !path.is_dir() {
        return Err(format!("Song directory not found: {}", song_path));
    }
    // Safety: path must reside inside songs_dir and not be songs_dir itself
    let canonical_path = path.canonicalize().map_err(|e| format!("Cannot resolve path: {e}"))?;
    let canonical_songs = songs_dir.canonicalize().unwrap_or(songs_dir.clone());
    if !canonical_path.starts_with(&canonical_songs) || canonical_path == canonical_songs {
        return Err("Invalid song path: not under songs directory".to_string());
    }
    std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    rescan_songs(&state).await?;
    Ok(())
}

fn dir_size(path: &Path) -> std::io::Result<u64> {
    let mut size = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        if meta.is_dir() {
            size += dir_size(&entry.path()).unwrap_or(0);
        } else {
            size += meta.len();
        }
    }
    Ok(size)
}

#[tauri::command]
pub fn get_song_asset_path(
    state: State<AppState>,
    song_path: String,
    asset_type: String,
) -> Result<String, String> {
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    let song = mgr
        .songs
        .iter()
        .find(|s| s.path.to_string_lossy() == song_path)
        .ok_or_else(|| format!("Song not found: {}", song_path))?;

    let path = match asset_type.as_str() {
        "banner" => song.banner_path.as_ref(),
        "background" => song.background_path.as_ref(),
        "jacket" => song.jacket_path.as_ref(),
        _ => return Err(format!("Unknown asset type: {}", asset_type)),
    };

    path.map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| format!("No {} found for this song", asset_type))
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;

    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };

    use base64::{Engine as _, engine::general_purpose};
    let b64 = general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn has_chart_file(dir: &Path) -> bool {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                match ext.to_lowercase().as_str() {
                    "sm" | "ssc" | "dwi" => return true,
                    _ => {}
                }
            }
        }
    }
    false
}

fn find_audio_file(dir: &Path) -> Option<std::path::PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                match ext.to_lowercase().as_str() {
                    "mp3" | "ogg" | "wav" | "flac" => return Some(p),
                    _ => {}
                }
            }
        }
    }
    None
}

fn find_cover_file(dir: &Path) -> Option<std::path::PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "png" || ext_lower == "jpg" || ext_lower == "jpeg" || ext_lower == "bmp" || ext_lower == "gif" || ext_lower == "webp" {
                    // Check for common banner/cover file names
                    if let Some(file_name) = p.file_stem().and_then(|s| s.to_str()) {
                        let name_lower = file_name.to_lowercase();
                        if name_lower.contains("bn") || name_lower.contains("banner") || name_lower.contains("jacket") || name_lower.contains("bg") || name_lower.contains("background") || name_lower.contains("cover") {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }
    None
}

fn write_empty_chart_sm(path: &std::path::Path, title: &str) -> Result<(), String> {
    // Derive song name from folder if title is empty
    let song_name = if title.is_empty() {
        path.parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string()
    } else {
        title.to_string()
    };
    
    let escaped_title = escape_sm_value(&song_name);
    let escaped_artist = escape_sm_value("Unknown Artist");
    let escaped_genre = escape_sm_value("Unknown");
    
    // Look for existing audio file to reference
    let audio_file_path = path.parent().and_then(find_audio_file);
    let audio_ref = audio_file_path.as_ref()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "music.wav".to_string());
    
    // Look for existing banner
    let banner_file_path = path.parent().and_then(find_cover_file);
    let banner_ref = banner_file_path.as_ref()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "banner.bmp".to_string());
    
    let sm_content = format!(
        "#TITLE:{};\n#SUBTITLE:;\n#ARTIST:{};\n#GENRE:{};\n#MUSIC:{};\n#BANNER:{};\n#BACKGROUND:{};\n#SAMPLESTART:0.000;\n#SAMPLELENGTH:12.000;\n#OFFSET:0.000;\n#BPMS:0.000=120.000;\n\n#NOTES:\n     dance-single:\n     :\n     Edit:\n     1:\n     0,0,0,0:\n;\n",
        escaped_title,
        escaped_artist,
        escaped_genre,
        escape_sm_value(&audio_ref),
        escape_sm_value(&banner_ref),
        escape_sm_value(&banner_ref),
    );
    
    std::fs::write(path, sm_content).map_err(|e| e.to_string())
}

async fn rescan_songs(state: &State<'_, AppState>) -> Result<(), String> {
    let songs_dir_str = {
        let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        base.clone()
    };
    let scan_state = Arc::clone(&state.scan_state);
    if let Ok(mut s) = scan_state.lock() {
        s.scanning = true;
        s.done = false;
        s.error = None;
    }
    let songs_dir_bg = songs_dir_str.clone();
    let scan_state_bg = Arc::clone(&scan_state);
    let new_mgr = tauri::async_runtime::spawn_blocking(move || {
        let mut mgr = SongManager::new();
        let _ = mgr.scan_directory(&songs_dir_bg);
        mgr.songs.sort_by(|a, b| {
            a.pack_name
                .cmp(&b.pack_name)
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        });
        let count = mgr.songs.len();
        if let Ok(mut s) = scan_state_bg.lock() {
            s.scanning = false;
            s.done = true;
            s.total_found = count;
        }
        mgr
    }).await.map_err(|e| format!("Rescan failed: {e}"))?;

    let mut mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    *mgr = new_mgr;
    Ok(())
}

fn sanitize_for_path(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == ' ';
        if ok {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    out.trim().replace("  ", " ").replace(' ', "_")
}

fn unique_dir_under(base: &std::path::Path, preferred: &str) -> std::path::PathBuf {
    let mut idx = 1usize;
    let mut candidate = base.join(preferred);
    while candidate.exists() {
        idx += 1;
        candidate = base.join(format!("{}-{}", preferred, idx));
    }
    candidate
}

fn escape_sm_value(v: &str) -> String {
    v.replace(';', "_").replace('\n', " ").replace('\r', " ")
}

fn write_default_wav(path: &std::path::Path) -> Result<(), String> {
    let sample_rate: u32 = 44_100;
    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let seconds: f32 = 2.0;
    let total_samples = (sample_rate as f32 * seconds) as u32;
    let block_align = channels * (bits_per_sample / 8);
    let byte_rate = sample_rate * block_align as u32;
    let data_size = total_samples * block_align as u32;
    let chunk_size = 36 + data_size;

    let mut out: Vec<u8> = Vec::with_capacity((44 + data_size) as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&chunk_size.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&bits_per_sample.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());

    let two_pi_f = 2.0f32 * std::f32::consts::PI;
    for i in 0..total_samples {
        let t = i as f32 / sample_rate as f32;
        let env = (1.0 - (t / seconds)).max(0.0);
        let s = (two_pi_f * 440.0 * t).sin() * 0.18 * env;
        let v = (s * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }

    std::fs::write(path, out).map_err(|e| e.to_string())
}

fn write_default_banner_bmp(path: &std::path::Path, width: u32, height: u32) -> Result<(), String> {
    let row_stride = (width * 3).div_ceil(4) * 4;
    let pixel_size = row_stride * height;
    let file_size = 54 + pixel_size;

    let mut out: Vec<u8> = Vec::with_capacity(file_size as usize);
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&file_size.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&54u32.to_le_bytes());

    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(width as i32).to_le_bytes());
    out.extend_from_slice(&(height as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&24u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&pixel_size.to_le_bytes());
    out.extend_from_slice(&2835u32.to_le_bytes());
    out.extend_from_slice(&2835u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());

    let pad_len = (row_stride - width * 3) as usize;
    let pad = vec![0u8; pad_len];

    for y in 0..height {
        for x in 0..width {
            let fx = x as f32 / (width.max(1) - 1) as f32;
            let fy = y as f32 / (height.max(1) - 1) as f32;
            let r = (80.0 + fx * 140.0) as u8;
            let g = (25.0 + fy * 80.0) as u8;
            let b = (120.0 + (1.0 - fx) * 110.0) as u8;
            out.push(b);
            out.push(g);
            out.push(r);
        }
        out.extend_from_slice(&pad);
    }

    std::fs::write(path, out).map_err(|e| e.to_string())
}

fn copy_song_folder_with_defaults(
    src: &Path,
    dest_base: &Path,
    warnings: &mut Vec<ImportWarning>,
) -> Result<bool, String> {
    let folder_name = src
        .file_name()
        .ok_or_else(|| "Invalid source folder".to_string())?;
    let song_name = folder_name.to_string_lossy().to_string();
    // 如果目标目录已存在，自动生成不冲突的目录名
    let dest = unique_dir_under(dest_base, song_name.as_str());

    // First copy all existing files
    copy_dir_recursive(src, &dest).map_err(|e| format!("{}: {}", src.display(), e))?;

    // Check what files are missing and generate defaults
    let mut missing_audio = false;
    let mut missing_cover = false;
    let mut missing_chart = false;

    // Check for audio file
    let audio_file = find_audio_file(&dest);
    if audio_file.is_none() {
        let default_audio_path = dest.join("music.wav");
        write_default_wav(&default_audio_path)?;
        missing_audio = true;
    }

    // Check for cover/banner file
    let cover_file = find_cover_file(&dest);
    if cover_file.is_none() {
        let default_banner_path = dest.join("banner.bmp");
        write_default_banner_bmp(&default_banner_path, 512, 384)?;
        missing_cover = true;
    }

    // Check for chart file
    if !has_chart_file(&dest) {
        let chart_path = dest.join("song.sm");
        write_empty_chart_sm(&chart_path, &song_name)?;
        missing_chart = true;
    }

    // Record warning if anything was missing
    if missing_audio || missing_cover || missing_chart {
        warnings.push(ImportWarning {
            song_name,
            missing_audio,
            missing_cover,
            missing_chart,
        });
    }

    Ok(true)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }
    Ok(())
}
