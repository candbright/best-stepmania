use crate::AppState;
use std::io::Write;
use tauri::State;

/// Append UTF-8 lines to `data_dir/logs/frontend.log` (created if missing).
/// Batched from the frontend file log sink to limit IPC churn.
#[tauri::command]
pub fn append_frontend_log_lines(state: State<AppState>, lines: Vec<String>) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    let dir = state.data_dir.join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("frontend.log");
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    for line in lines {
        writeln!(f, "{line}").map_err(|e| e.to_string())?;
    }
    f.flush().map_err(|e| e.to_string())?;
    Ok(())
}
