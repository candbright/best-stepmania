use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, LogicalSize, Manager, State, WebviewWindow};

/// Returns the primary monitor's resolution in pixels.
/// Returns the OS-specific factory default language.
#[tauri::command]
pub fn get_factory_default_language() -> String {
    #[cfg(target_os = "windows")]
    {
        "zh-CN".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        "en".to_string()
    }
}

#[tauri::command]
pub fn get_primary_monitor_resolution(app: AppHandle) -> Result<MonitorResolution, String> {
    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No primary monitor found".to_string())?;
    let size = monitor.size();
    let scale_factor = monitor.scale_factor();
    Ok(MonitorResolution {
        width: size.width,
        height: size.height,
        scale_factor,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorResolution {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Returns the best-fit `window_display_preset` ID for a given resolution.
/// Uses aspect-ratio heuristics to pick the closest matching preset.
pub fn preset_for_resolution(width: u32, height: u32) -> String {
    let aspect = width as f64 / height as f64;
    // 16:9 ≈ 1.778, 16:10 ≈ 1.6, 4:3 ≈ 1.333, 21:9 ≈ 2.333
    if (aspect - 1.78).abs() < 0.05 {
        // 16:9 — pick closest standard 16:9 resolution
        if width >= 1920 {
            "fixed16x9_1920x1080".to_string()
        } else if width >= 1600 {
            "fixed16x9_1600x900".to_string()
        } else {
            "fixed16x9_1280x720".to_string()
        }
    } else if (aspect - 1.6).abs() < 0.05 {
        // 16:10
        if width >= 1920 {
            "fixed16x10_1920x1200".to_string()
        } else {
            "fixed16x10_1680x1050".to_string()
        }
    } else if (aspect - 1.33).abs() < 0.05 {
        // 4:3
        if width >= 1600 {
            "fixed4x3_1600x1200".to_string()
        } else {
            "fixed4x3_1024x768".to_string()
        }
    } else if aspect > 2.0 {
        // 21:9 or ultra-wide
        "fixed21x9_2560x1080".to_string()
    } else {
        // Fallback: use borderless fullscreen for any other aspect
        "borderless".to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyChord {
    pub code: String,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub alt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KeyBindingsConfig {
    #[serde(default)]
    pub gameplay_pump_double_lanes: Option<Vec<String>>,
    #[serde(default)]
    pub shortcuts: Option<HashMap<String, Vec<KeyChord>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerPlayerConfig {
    #[serde(default = "default_speed_mod")]
    pub speed_mod: String,
    #[serde(default)]
    pub reverse: bool,
    #[serde(default)]
    pub mirror: bool,
    #[serde(default)]
    pub sudden: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub rotate: bool,
    #[serde(default = "default_noteskin")]
    pub noteskin: String,
    #[serde(default = "default_note_style")]
    pub note_style: String,
    #[serde(default)]
    pub audio_offset: i32,
    #[serde(default = "default_note_scale")]
    pub note_scale: f64,
}

impl Default for PerPlayerConfig {
    fn default() -> Self {
        Self {
            speed_mod: default_speed_mod(),
            reverse: false,
            mirror: false,
            sudden: false,
            hidden: false,
            rotate: false,
            noteskin: default_noteskin(),
            note_style: default_note_style(),
            audio_offset: 0,
            note_scale: default_note_scale(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_profile")]
    pub default_profile: String,
    #[serde(default = "default_master_volume")]
    pub master_volume: f32,
    #[serde(default = "default_music_volume")]
    pub music_volume: f32,
    #[serde(default = "default_effect_volume")]
    pub effect_volume: f32,
    #[serde(
        default = "default_false",
        alias = "gameplay_sfx_enabled",
        alias = "gameplaySfxEnabled"
    )]
    pub metronome_sfx_enabled: bool,
    #[serde(
        default = "default_effect_volume",
        alias = "gameplay_sfx_volume",
        alias = "gameplaySfxVolume"
    )]
    pub metronome_sfx_volume: f32,
    #[serde(default = "default_rhythm_sfx_style")]
    pub metronome_sfx_style: String,
    #[serde(default = "default_true")]
    pub rhythm_sfx_enabled: bool,
    #[serde(default = "default_effect_volume")]
    pub rhythm_sfx_volume: f32,
    #[serde(default = "default_true")]
    pub ui_sfx_enabled: bool,
    #[serde(default = "default_ui_sfx_volume")]
    pub ui_sfx_volume: f32,
    #[serde(default = "default_ui_sfx_style")]
    pub ui_sfx_style: String,
    #[serde(default = "default_rhythm_sfx_style")]
    pub rhythm_sfx_style: String,
    #[serde(default)]
    pub audio_offset_ms: i32,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default = "default_window_display_preset")]
    pub window_display_preset: String,
    #[serde(default = "default_true")]
    pub vsync: bool,
    #[serde(default = "default_fps")]
    pub target_fps: u32,
    #[serde(default = "default_judgment_style")]
    pub judgment_style: String,
    #[serde(default = "default_true")]
    pub show_offset: bool,
    #[serde(default = "default_life_type")]
    pub life_type: String,
    #[serde(default)]
    pub auto_play: bool,
    #[serde(default = "default_player_configs")]
    pub player_configs: [PerPlayerConfig; 2],
    #[serde(default = "default_playback_rate")]
    pub playback_rate: f64,
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f64,
    #[serde(default = "default_double_panel_gap_px")]
    pub double_panel_gap_px: u32,
    #[serde(default = "default_battery_lives")]
    pub battery_lives: u32,
    #[serde(default = "default_chart_cache_size")]
    pub chart_cache_size: usize,
    #[serde(default = "default_true")]
    pub cursor_enabled: bool,
    #[serde(default = "default_cursor_style_preset")]
    pub cursor_style_preset: String,
    #[serde(default = "default_cursor_scale")]
    pub cursor_scale: f64,
    #[serde(default = "default_cursor_opacity")]
    pub cursor_opacity: f64,
    #[serde(default = "default_cursor_glow")]
    pub cursor_glow: f64,
    #[serde(default = "default_true")]
    pub cursor_trails_enabled: bool,
    #[serde(default = "default_true")]
    pub cursor_ripple_enabled: bool,
    #[serde(default = "default_cursor_ripple_duration_ms")]
    pub cursor_ripple_duration_ms: u32,
    #[serde(default = "default_cursor_ripple_min_scale")]
    pub cursor_ripple_min_scale: f64,
    #[serde(default = "default_cursor_ripple_max_scale")]
    pub cursor_ripple_max_scale: f64,
    #[serde(default = "default_cursor_ripple_opacity")]
    pub cursor_ripple_opacity: f64,
    #[serde(default = "default_cursor_ripple_line_width")]
    pub cursor_ripple_line_width: f64,
    #[serde(default = "default_cursor_ripple_glow")]
    pub cursor_ripple_glow: f64,
    #[serde(default = "default_song_dirs")]
    pub song_directories: Vec<String>,
    #[serde(default)]
    pub key_bindings: Option<KeyBindingsConfig>,
}

fn default_language() -> String {
    "en".to_string()
}
fn default_theme() -> String {
    "default".to_string()
}
fn default_profile() -> String {
    "Player".to_string()
}
fn default_master_volume() -> f32 {
    0.8
}
fn default_music_volume() -> f32 {
    0.7
}
fn default_effect_volume() -> f32 {
    0.9
}
fn default_ui_sfx_volume() -> f32 {
    0.7
}
fn default_ui_sfx_style() -> String {
    "classic".to_string()
}
fn default_rhythm_sfx_style() -> String {
    "bright".to_string()
}
fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}
fn default_fps() -> u32 {
    144
}
fn default_window_display_preset() -> String {
    "normal".to_string()
}
fn default_judgment_style() -> String {
    "ddr".to_string()
}
fn default_life_type() -> String {
    "bar".to_string()
}
fn default_player_configs() -> [PerPlayerConfig; 2] {
    [PerPlayerConfig::default(), PerPlayerConfig::default()]
}
fn default_speed_mod() -> String {
    "C500".to_string()
}
fn default_noteskin() -> String {
    "default".to_string()
}
fn default_note_style() -> String {
    "default".to_string()
}
fn default_playback_rate() -> f64 {
    1.0
}
fn default_note_scale() -> f64 {
    1.0
}
fn default_ui_scale() -> f64 {
    1.0
}
fn default_double_panel_gap_px() -> u32 {
    56
}
fn default_battery_lives() -> u32 {
    3
}
fn default_chart_cache_size() -> usize {
    8
}
fn default_cursor_style_preset() -> String {
    "a".to_string()
}
fn default_cursor_scale() -> f64 {
    1.0
}
fn default_cursor_opacity() -> f64 {
    0.9
}
fn default_cursor_glow() -> f64 {
    0.35
}
fn default_cursor_ripple_duration_ms() -> u32 {
    480
}
fn default_cursor_ripple_min_scale() -> f64 {
    0.65
}
fn default_cursor_ripple_max_scale() -> f64 {
    6.2
}
fn default_cursor_ripple_opacity() -> f64 {
    0.7
}
fn default_cursor_ripple_line_width() -> f64 {
    1.0
}
fn default_cursor_ripple_glow() -> f64 {
    0.26
}
fn default_song_dirs() -> Vec<String> {
    vec!["songs".to_string()]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: default_language(),
            theme: default_theme(),
            default_profile: default_profile(),
            master_volume: default_master_volume(),
            music_volume: default_music_volume(),
            effect_volume: default_effect_volume(),
            metronome_sfx_enabled: false,
            metronome_sfx_volume: default_effect_volume(),
            metronome_sfx_style: default_rhythm_sfx_style(),
            rhythm_sfx_enabled: true,
            rhythm_sfx_volume: default_effect_volume(),
            ui_sfx_enabled: true,
            ui_sfx_volume: default_ui_sfx_volume(),
            ui_sfx_style: default_ui_sfx_style(),
            rhythm_sfx_style: default_rhythm_sfx_style(),
            audio_offset_ms: 0,
            fullscreen: false,
            window_width: Some(1280),
            window_height: Some(720),
            window_display_preset: default_window_display_preset(),
            vsync: true,
            target_fps: default_fps(),
            judgment_style: default_judgment_style(),
            show_offset: true,
            life_type: default_life_type(),
            auto_play: false,
            player_configs: default_player_configs(),
            playback_rate: default_playback_rate(),
            ui_scale: default_ui_scale(),
            double_panel_gap_px: default_double_panel_gap_px(),
            battery_lives: default_battery_lives(),
            chart_cache_size: default_chart_cache_size(),
            cursor_enabled: true,
            cursor_style_preset: default_cursor_style_preset(),
            cursor_scale: default_cursor_scale(),
            cursor_opacity: default_cursor_opacity(),
            cursor_glow: default_cursor_glow(),
            cursor_trails_enabled: true,
            cursor_ripple_enabled: true,
            cursor_ripple_duration_ms: default_cursor_ripple_duration_ms(),
            cursor_ripple_min_scale: default_cursor_ripple_min_scale(),
            cursor_ripple_max_scale: default_cursor_ripple_max_scale(),
            cursor_ripple_opacity: default_cursor_ripple_opacity(),
            cursor_ripple_line_width: default_cursor_ripple_line_width(),
            cursor_ripple_glow: default_cursor_ripple_glow(),
            song_directories: default_song_dirs(),
            key_bindings: None,
        }
    }
}

fn config_path(state: &State<AppState>) -> std::path::PathBuf {
    state.data_dir.join("config.toml")
}

/// Parses an on-disk `config.toml` with the same migrations as [`load_config`] for existing files.
fn parse_existing_config_file(path: &Path) -> Result<AppConfig, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut config: AppConfig = toml::from_str(&content).unwrap_or_default();
    if config.window_display_preset == "normal" && config.fullscreen {
        config.window_display_preset = "exclusiveFullscreen".to_string();
    }
    if config.window_display_preset == "normal"
        && (config.window_width.is_none() || config.window_height.is_none())
    {
        config.window_width = Some(1280);
        config.window_height = Some(720);
    }
    Ok(config)
}

fn fixed_logical_size_for_preset(preset: &str) -> Option<(u32, u32)> {
    match preset {
        "fixed16x9_1280x720" => Some((1280, 720)),
        "fixed16x9_1600x900" => Some((1600, 900)),
        "fixed16x9_1920x1080" => Some((1920, 1080)),
        "fixed16x10_1680x1050" => Some((1680, 1050)),
        "fixed16x10_1920x1200" => Some((1920, 1200)),
        "fixed4x3_1024x768" => Some((1024, 768)),
        "fixed4x3_1600x1200" => Some((1600, 1200)),
        "fixed21x9_2560x1080" => Some((2560, 1080)),
        _ => None,
    }
}

/// Applies persisted window mode/size before the webview loads (matches frontend `applyWindowDisplayPreset`).
fn apply_window_geometry_for_config(window: &WebviewWindow, config: &AppConfig) -> Result<(), String> {
    let preset = config.window_display_preset.as_str();

    if preset == "normal" {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_resizable(true).map_err(|e| e.to_string())?;
        window.set_maximizable(true).map_err(|e| e.to_string())?;
        if let (Some(w), Some(h)) = (config.window_width, config.window_height) {
            if w > 0 && h > 0 {
                window
                    .set_size(LogicalSize::new(w as f64, h as f64))
                    .map_err(|e| e.to_string())?;
            }
        }
        return Ok(());
    }

    if preset == "exclusiveFullscreen" {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        window.set_maximizable(false).map_err(|e| e.to_string())?;
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        return Ok(());
    }

    window.set_fullscreen(false).map_err(|e| e.to_string())?;

    if preset == "borderless" {
        let monitor = window.current_monitor().map_err(|e| e.to_string())?;
        let Some(mon) = monitor else {
            window.set_decorations(false).map_err(|e| e.to_string())?;
            window.set_resizable(false).map_err(|e| e.to_string())?;
            window.set_maximizable(false).map_err(|e| e.to_string())?;
            return Ok(());
        };
        let wa = mon.work_area();
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        window.set_maximizable(false).map_err(|e| e.to_string())?;
        window.set_position(wa.position).map_err(|e| e.to_string())?;
        window.set_size(wa.size).map_err(|e| e.to_string())?;
        return Ok(());
    }

    window.set_decorations(true).map_err(|e| e.to_string())?;

    if let Some((w, h)) = fixed_logical_size_for_preset(preset) {
        window.set_maximizable(false).map_err(|e| e.to_string())?;
        if window.is_maximized().map_err(|e| e.to_string())? {
            window.unmaximize().map_err(|e| e.to_string())?;
        }
        window.set_resizable(false).map_err(|e| e.to_string())?;
        window
            .set_size(LogicalSize::new(w as f64, h as f64))
            .map_err(|e| e.to_string())?;
        window.center().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Called from `setup` so the native window matches `config.toml` before the first web paint.
pub fn apply_startup_window_from_config(app: &AppHandle, data_dir: &Path) {
    let path = data_dir.join("config.toml");
    if !path.exists() {
        return;
    }
    let config = match parse_existing_config_file(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("apply_startup_window_from_config: read config: {e}");
            return;
        }
    };
    let windows = app.webview_windows();
    let Some(window) = windows.values().next() else {
        return;
    };
    if let Err(e) = apply_window_geometry_for_config(window, &config) {
        eprintln!("apply_startup_window_from_config: {e}");
    }
}

#[tauri::command]
pub fn load_config(app: AppHandle, state: State<AppState>) -> Result<AppConfig, String> {
    let path = config_path(&state);
    if path.exists() {
        parse_existing_config_file(&path)
    } else {
        // First launch: detect primary monitor resolution and auto-select a preset
        let preset = app
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| preset_for_resolution(m.size().width, m.size().height))
            .unwrap_or_else(|| "fixed16x9_1280x720".to_string());

        let mut config = AppConfig::default();
        config.window_display_preset = preset;
        // OS-specific default language: Windows → Chinese, Linux → English
        #[cfg(target_os = "windows")]
        {
            config.language = "zh-CN".to_string();
        }
        #[cfg(not(target_os = "windows"))]
        {
            config.language = "en".to_string();
        }
        let toml_str = toml::to_string_pretty(&config).map_err(|e| e.to_string())?;
        std::fs::write(&path, toml_str).ok();
        Ok(config)
    }
}

#[tauri::command]
pub fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    let path = config_path(&state);
    let toml_str = toml::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, toml_str).map_err(|e| e.to_string())?;
    Ok(())
}
