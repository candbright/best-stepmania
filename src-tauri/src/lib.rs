mod commands;
pub mod error;

use commands::{audio, chart, config, diagnostics, import, noteskin, profile, scoring, song, window};
use sm_audio::AudioEngine;
use sm_chart::SongFile;
use sm_noteskin::NoteSkinManager;
use sm_profile::ProfileDb;
use sm_song::SongManager;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WebviewWindow, WindowEvent};

/// 后台扫描进度状态
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanState {
    pub scanning: bool,
    pub total_found: usize,
    pub done: bool,
    pub error: Option<String>,
}

impl Default for ScanState {
    fn default() -> Self {
        Self { scanning: false, total_found: 0, done: false, error: None }
    }
}

pub struct AppState {
    pub song_manager: Mutex<SongManager>,
    pub profile_db: Mutex<ProfileDb>,
    pub audio_engine: Mutex<AudioEngine>,
    pub noteskin_manager: Mutex<NoteSkinManager>,
    pub songs_base_dir: Mutex<String>,
    pub latest_audio_request_token: Mutex<u64>,
    pub data_dir: PathBuf,
    pub scan_state: Arc<Mutex<ScanState>>,
    /// LRU-style cache for parsed chart files to avoid re-parsing on repeated access.
    /// Key: canonical chart file path, Value: parsed SongFile.
    /// Limited to MAX_CHART_CACHE_SIZE entries.
    pub chart_cache: Mutex<ChartCache>,
}

/// Simple LRU cache for parsed chart files.
pub struct ChartCache {
    entries: HashMap<PathBuf, (SongFile, u64)>,
    access_counter: u64,
    max_size: usize,
}

pub const DEFAULT_CHART_CACHE_SIZE: usize = 8;

impl ChartCache {
    pub fn new(max_size: usize) -> Self {
        Self { entries: HashMap::new(), access_counter: 0, max_size }
    }

    pub fn get(&mut self, path: &PathBuf) -> Option<&SongFile> {
        self.access_counter += 1;
        if let Some(entry) = self.entries.get_mut(path) {
            entry.1 = self.access_counter;
            Some(&entry.0)
        } else {
            None
        }
    }

    pub fn insert(&mut self, path: PathBuf, song: SongFile) {
        self.access_counter += 1;
        if self.entries.len() >= self.max_size && !self.entries.contains_key(&path) {
            if let Some(lru_key) = self.entries.iter()
                .min_by_key(|(_, (_, ts))| *ts)
                .map(|(k, _)| k.clone())
            {
                self.entries.remove(&lru_key);
            }
        }
        self.entries.insert(path, (song, self.access_counter));
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Sorted cache keys for diagnostics export (chart file paths only).
    pub fn diagnostic_cached_paths(&self) -> Vec<PathBuf> {
        let mut keys: Vec<PathBuf> = self.entries.keys().cloned().collect();
        keys.sort_by_key(|p| p.to_string_lossy().to_string());
        keys
    }

    pub fn chart_cache_len(&self) -> usize {
        self.entries.len()
    }
}

fn corrupt_profile_backup_path(db_path: &std::path::Path, ts: u64) -> PathBuf {
    let name = db_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("profiles.db");
    db_path.with_file_name(format!("{name}.corrupt.{ts}"))
}

fn backup_corrupt_profile_db(db_path: &std::path::Path) {
    if !db_path.exists() {
        return;
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = corrupt_profile_backup_path(db_path, ts);
    if std::fs::rename(db_path, &backup).is_err() {
        let _ = std::fs::remove_file(db_path);
    }
}

/// Opens the profile database; on failure backs up the corrupt file and recreates, then falls back to in-memory.
fn open_profile_db_or_recover(db_path: &std::path::Path) -> ProfileDb {
    match ProfileDb::open(db_path) {
        Ok(db) => db,
        Err(e) => {
            eprintln!(
                "Failed to open profile database at {}: {}",
                db_path.display(),
                e
            );
            backup_corrupt_profile_db(db_path);
            match ProfileDb::open(db_path) {
                Ok(db) => db,
                Err(e2) => {
                    eprintln!("Failed to recreate profile database on disk: {e2}");
                    ProfileDb::open_in_memory()
                        .expect("SQLite in-memory profile database must open")
                }
            }
        }
    }
}

fn restore_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn restore_any_window(app: &tauri::AppHandle) {
    if let Some(window) = app.webview_windows().values().next() {
        restore_window(window);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&data_dir).ok();

            // 在 WebView 首帧之前按 config.toml 调整窗口，避免先闪 tauri.conf 默认尺寸
            let app_handle = app.handle();
            config::apply_startup_window_from_config(&app_handle, &data_dir);

            // Songs 目录固定在 app_data_dir/songs
            let songs_dir = data_dir.join("songs");
            std::fs::create_dir_all(&songs_dir).ok();

            // 同时把 src-tauri/songs 目录中的 demo 歌曲复制过去（仅首次）
            // 方便开发时有默认歌曲
            #[cfg(debug_assertions)]
            {
                let dev_songs = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../songs");
                if dev_songs.exists() && dev_songs.is_dir() {
                    if let Ok(entries) = std::fs::read_dir(&dev_songs) {
                        for entry in entries.flatten() {
                            let src = entry.path();
                            let dst = songs_dir.join(entry.file_name());
                            if src.is_dir() && !dst.exists() {
                                let _ = copy_dir_all(&src, &dst);
                            }
                        }
                    }
                }
            }

            // 隐藏系统原生鼠标，使用前端自绘光标
            // 不依赖窗口 label，避免 label 不是 "main" 时失效
            for window in app.webview_windows().values() {
                let _ = window.set_cursor_visible(false);
            }

            let db_path = data_dir.join("profiles.db");
            let profile_db = open_profile_db_or_recover(&db_path);

            let scan_state = Arc::new(Mutex::new(ScanState::default()));
            let songs_dir_str = songs_dir.to_string_lossy().to_string();

            let state = AppState {
                song_manager: Mutex::new(SongManager::new()),
                profile_db: Mutex::new(profile_db),
                audio_engine: Mutex::new(AudioEngine::new()),
                noteskin_manager: Mutex::new(NoteSkinManager::new()),
                songs_base_dir: Mutex::new(songs_dir_str.clone()),
                latest_audio_request_token: Mutex::new(0),
                data_dir,
                scan_state: Arc::clone(&scan_state),
                chart_cache: Mutex::new(ChartCache::new(DEFAULT_CHART_CACHE_SIZE)),
            };
            app.manage(state);

            // 启动时确保至少有一个窗口可见且可聚焦，避免“进程在但窗口丢失”。
            if let Some(window) = app.webview_windows().values().next() {
                restore_window(window);
            }

            // 系统托盘：提供恢复窗口与退出入口。
            let show_item = MenuItemBuilder::with_id("show_window", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit_app", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let app_handle_for_menu = app.handle().clone();
            let app_handle_for_click = app.handle().clone();
            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder
                .tooltip("BestStepMania")
                .menu(&tray_menu)
                .on_menu_event(move |_tray, event| match event.id().as_ref() {
                    "show_window" => restore_any_window(&app_handle_for_menu),
                    "quit_app" => app_handle_for_menu.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_any_window(&app_handle_for_click);
                    }
                })
                .build(app)?;

            // 启动后台异步扫描任务
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 标记开始扫描
                if let Ok(mut s) = scan_state.lock() {
                    s.scanning = true;
                    s.done = false;
                    s.error = None;
                    s.total_found = 0;
                }

                let songs_dir_clone = songs_dir_str.clone();
                let result = tauri::async_runtime::spawn_blocking(move || {
                    let mut mgr = SongManager::new();
                    mgr.scan_directory(&songs_dir_clone)?;
                    mgr.songs.sort_by(|a, b| {
                        a.pack_name
                            .cmp(&b.pack_name)
                            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
                    });
                    Ok::<SongManager, String>(mgr)
                })
                .await;

                let app_state = app_handle.state::<AppState>();
                match result {
                    Ok(Ok(mgr)) => {
                        let count = mgr.songs.len();
                        if let Ok(mut song_mgr) = app_state.song_manager.lock() {
                            *song_mgr = mgr;
                        }
                        if let Ok(mut base) = app_state.songs_base_dir.lock() {
                            *base = songs_dir_str;
                        }
                        if let Ok(mut s) = app_state.scan_state.lock() {
                            s.scanning = false;
                            s.done = true;
                            s.total_found = count;
                        }
                    }
                    Ok(Err(e)) => {
                        if let Ok(mut s) = app_state.scan_state.lock() {
                            s.scanning = false;
                            s.done = true;
                            s.error = Some(e);
                        }
                    }
                    Err(e) => {
                        if let Ok(mut s) = app_state.scan_state.lock() {
                            s.scanning = false;
                            s.done = true;
                            s.error = Some(e.to_string());
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(false) = event {
                let label = window.label().to_string();
                eprintln!("window-lifecycle: focused=false label={label}");
            }
        })
        .invoke_handler(tauri::generate_handler![
            song::scan_songs,
            song::get_song_list,
            song::search_songs,
            song::get_song_music_path,
            song::get_scan_status,
            song::get_songs_dir,
            chart::load_chart,
            chart::get_chart_notes,
            chart::get_chart_play_payload,
            chart::create_new_chart,
            chart::duplicate_chart,
            chart::delete_chart,
            chart::update_chart_properties,
            chart::get_song_metadata,
            chart::update_song_metadata,
            profile::get_profiles,
            profile::create_profile,
            profile::save_score,
            profile::get_top_scores,
            profile::clear_chart_top_scores,
            profile::get_recent_scores,
            profile::toggle_favorite,
            profile::is_favorite,
            profile::get_favorites,
            profile::cleanup_orphaned_favorites,
            audio::audio_load,
            audio::audio_play,
            audio::audio_pause,
            audio::audio_pause_force,
            audio::audio_seek,
            audio::audio_get_time,
            audio::audio_get_duration,
            audio::audio_get_playback_state,
            audio::audio_is_playing,
            audio::audio_set_volume,
            audio::audio_set_rate,
            audio::audio_stop,
            audio::audio_preview,
            audio::audio_preload,
            audio::audio_preload_batch,
            audio::audio_clear_cache,
            audio::audio_list_devices,
            audio::audio_rebuild_stream,
            config::load_config,
            config::save_config,
            config::get_primary_monitor_resolution,
            config::get_factory_default_language,
            chart::save_chart,
            chart::get_bpm_changes,
            chart::save_bpm_changes,
            import::import_song_pack,
            import::import_single_song,
            import::prepare_song_import,
            import::create_chart_for_imported,
            import::create_song,
            import::get_song_asset_path,
            import::read_file_base64,
            import::list_song_packs,
            import::create_empty_pack,
            import::delete_song_pack,
            import::delete_song,
            scoring::get_scoring_config,
            noteskin::list_noteskins,
            noteskin::get_noteskin,
            noteskin::load_noteskins_from_dir,
            diagnostics::export_diagnostics,
            diagnostics::open_path,
            window::get_cursor_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 递归复制目录（用于 dev 模式初始化 demo 歌曲）
#[cfg(debug_assertions)]
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}
