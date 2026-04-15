use tauri::Window;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

#[tauri::command]
pub fn get_cursor_position(window: Window) -> Result<CursorPosition, String> {
    let pos = window.cursor_position().map_err(|e| e.to_string())?;
    Ok(CursorPosition { x: pos.x, y: pos.y })
}
