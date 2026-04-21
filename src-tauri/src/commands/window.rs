use tauri::{AppHandle, Manager, Window};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

/// After first-screen bootstrap, close the splash webview and reveal the main window (Tauri splashscreen pattern).
#[tauri::command]
pub fn complete_startup_splash(app: AppHandle) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
    let Some(main) = app.get_webview_window("main") else {
        return Err("main window not found".to_string());
    };
    main.show().map_err(|e| e.to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_cursor_position(window: Window) -> Result<CursorPosition, String> {
    let pos = window.cursor_position().map_err(|e| e.to_string())?;
    Ok(CursorPosition { x: pos.x, y: pos.y })
}
