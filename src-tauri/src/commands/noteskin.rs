use crate::AppState;
use sm_noteskin::NoteSkinConfig;
use std::path::PathBuf;
use tauri::State;

/// A serializable snapshot of a skin's color config.
/// Only `name` and `colors` are consumed by the frontend renderer; the
/// dimension fields are reserved for future image-based skin support.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSkinSnapshot {
    pub name: String,
    pub note_width: f64,
    pub note_height: f64,
    pub receptor_width: f64,
    pub receptor_height: f64,
    pub hold_body_width: f64,
    pub supports_rotation: bool,
    pub colors: sm_noteskin::NoteSkinColors,
}

fn to_snapshot(skin: &NoteSkinConfig) -> NoteSkinSnapshot {
    NoteSkinSnapshot {
        name: skin.name.clone(),
        note_width: skin.note_width,
        note_height: skin.note_height,
        receptor_width: skin.receptor_width,
        receptor_height: skin.receptor_height,
        hold_body_width: skin.hold_body_width,
        supports_rotation: skin.supports_rotation,
        colors: skin.colors.clone(),
    }
}

/// Returns all available skin names.
#[tauri::command]
pub fn list_noteskins(state: State<AppState>) -> Result<Vec<String>, String> {
    let mgr = state.noteskin_manager.lock().map_err(|e| e.to_string())?;
    Ok(mgr.list_skins())
}

/// Returns the color config for a named skin, or an error if it doesn't exist.
#[tauri::command]
pub fn get_noteskin(state: State<AppState>, name: String) -> Result<NoteSkinSnapshot, String> {
    let mgr = state.noteskin_manager.lock().map_err(|e| e.to_string())?;
    let skin = mgr
        .get_by_name(&name)
        .ok_or_else(|| format!("Skin '{name}' not found"))?;
    Ok(to_snapshot(skin))
}

/// Scans a directory for additional skin packages and registers them.
#[tauri::command]
pub fn load_noteskins_from_dir(state: State<AppState>, dir: String) -> Result<usize, String> {
    let mut mgr = state.noteskin_manager.lock().map_err(|e| e.to_string())?;
    mgr.load_from_directory(&PathBuf::from(dir))
}
