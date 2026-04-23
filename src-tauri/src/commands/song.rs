use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartInfoItem {
    pub steps_type: String,
    pub difficulty: String,
    pub meter: i32,
    pub chart_name: String,
    pub note_count: usize,
    pub num_tracks: usize,
    pub chart_index: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongListItem {
    pub path: String,
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub display_bpm: String,
    pub banner_path: Option<String>,
    pub background_path: Option<String>,
    pub pack: String,
    pub genre: String,
    pub sample_start: f64,
    pub sample_length: f64,
    pub charts: Vec<ChartInfoItem>,
}

fn entry_to_item(e: &sm_song::SongEntry) -> SongListItem {
    SongListItem {
        path: e.path.to_string_lossy().to_string(),
        title: e.title.clone(),
        subtitle: e.subtitle.clone(),
        artist: e.artist.clone(),
        display_bpm: e.display_bpm.clone(),
        banner_path: e
            .banner_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string()),
        background_path: e
            .background_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string()),
        pack: e.pack_name.clone(),
        genre: e.genre.clone(),
        sample_start: e.sample_start,
        sample_length: e.sample_length,
        charts: e
            .charts
            .iter()
            .map(|c| ChartInfoItem {
                steps_type: c.steps_type.clone(),
                difficulty: c.difficulty.clone(),
                meter: c.meter,
                chart_name: c.chart_name.clone(),
                note_count: c.note_count,
                num_tracks: c.num_tracks,
                chart_index: c.chart_index,
            })
            .collect(),
    }
}

#[tauri::command]
pub fn scan_songs(state: State<AppState>, paths: Vec<String>) -> Result<usize, String> {
    let mut mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    mgr.songs.clear();
    for path in &paths {
        mgr.scan_directory(path).map_err(|e| e.to_string())?;
    }
    mgr.songs.sort_by(|a, b| {
        a.pack_name
            .cmp(&b.pack_name)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });

    if let Some(first_path) = paths.first() {
        let mut base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
        *base = first_path.clone();
    }

    Ok(mgr.song_count())
}

#[tauri::command]
pub fn get_song_list(
    state: State<AppState>,
    sort_by: Option<String>,
    group_by: Option<String>,
) -> Result<Vec<SongListItem>, String> {
    let mut mgr = state.song_manager.lock().map_err(|e| e.to_string())?;

    if let Some(sort) = sort_by.as_deref() {
        match sort {
            "title" => mgr
                .songs
                .sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
            "artist" => mgr
                .songs
                .sort_by(|a, b| a.artist.to_lowercase().cmp(&b.artist.to_lowercase())),
            "bpm" => mgr.songs.sort_by(|a, b| a.display_bpm.cmp(&b.display_bpm)),
            "pack" => mgr.songs.sort_by(|a, b| {
                a.pack_name
                    .cmp(&b.pack_name)
                    .then_with(|| a.title.cmp(&b.title))
            }),
            _ => {}
        }
    }

    let _ = group_by;

    Ok(mgr.songs.iter().map(entry_to_item).collect())
}

#[tauri::command]
pub fn get_song_music_path(state: State<AppState>, song_path: String) -> Result<String, String> {
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    let song = mgr
        .songs
        .iter()
        .find(|s| s.path.to_string_lossy() == song_path)
        .ok_or_else(|| format!("Song not found: {}", song_path))?;

    song.music_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "No music file found for this song".to_string())
}

#[tauri::command]
pub fn search_songs(state: State<AppState>, query: String) -> Result<Vec<SongListItem>, String> {
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    let q = query.to_lowercase();
    let results: Vec<SongListItem> = mgr
        .songs
        .iter()
        .filter(|s| {
            s.title.to_lowercase().contains(&q)
                || s.artist.to_lowercase().contains(&q)
                || s.title_translit.to_lowercase().contains(&q)
                || s.artist_translit.to_lowercase().contains(&q)
                || s.pack_name.to_lowercase().contains(&q)
        })
        .map(entry_to_item)
        .collect();
    Ok(results)
}

/// 获取后台扫描进度状态
#[tauri::command]
pub fn get_scan_status(state: State<AppState>) -> Result<crate::ScanState, String> {
    let s = state.scan_state.lock().map_err(|e| e.to_string())?;
    Ok(s.clone())
}

/// 获取 songs 目录路径
#[tauri::command]
pub fn get_songs_dir(state: State<AppState>) -> Result<String, String> {
    let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
    Ok(base.clone())
}
