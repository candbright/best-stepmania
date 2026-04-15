use tauri::Window;

#[tauri::command]
pub fn get_cursor_position(window: Window) -> Result<(i32, i32), String> {
    let pos = window.cursor_position().map_err(|e| e.to_string())?;
    Ok((pos.x as i32, pos.y as i32))
}
