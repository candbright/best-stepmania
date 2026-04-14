use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInfo {
    pub id: String,
    pub display_name: String,
    pub total_play_count: u32,
    pub total_dance_points: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScoreRequest {
    pub profile_id: String,
    pub song_path: String,
    pub steps_type: String,
    pub difficulty: String,
    pub meter: i32,
    pub grade: String,
    pub dp_percent: f64,
    pub score: i64,
    pub max_combo: u32,
    pub w1: u32,
    pub w2: u32,
    pub w3: u32,
    pub w4: u32,
    pub w5: u32,
    pub miss: u32,
    pub held: u32,
    pub let_go: u32,
    pub mines_hit: u32,
    pub modifiers: String,
}

fn high_score_to_info(h: sm_profile::HighScore) -> HighScoreInfo {
    let fc = h.full_combo();
    HighScoreInfo {
        grade: h.grade,
        dp_percent: h.dp_percent,
        score: h.score,
        max_combo: h.max_combo,
        w1: h.w1,
        w2: h.w2,
        w3: h.w3,
        w4: h.w4,
        w5: h.w5,
        miss: h.miss,
        held: h.held,
        let_go: h.let_go,
        mines_hit: h.mines_hit,
        played_at: h.played_at.to_rfc3339(),
        full_combo: fc,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighScoreInfo {
    pub grade: String,
    pub dp_percent: f64,
    pub score: i64,
    pub max_combo: u32,
    pub w1: u32,
    pub w2: u32,
    pub w3: u32,
    pub w4: u32,
    pub w5: u32,
    pub miss: u32,
    pub held: u32,
    pub let_go: u32,
    pub mines_hit: u32,
    pub played_at: String,
    pub full_combo: bool,
}

#[tauri::command]
pub fn get_profiles(state: State<AppState>) -> Result<Vec<ProfileInfo>, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let profiles = db.get_profiles().map_err(|e| e.to_string())?;
    Ok(profiles
        .iter()
        .map(|p| ProfileInfo {
            id: p.id.to_string(),
            display_name: p.display_name.clone(),
            total_play_count: p.total_play_count,
            total_dance_points: p.total_dance_points,
        })
        .collect())
}

#[tauri::command]
pub fn create_profile(state: State<AppState>, name: String) -> Result<ProfileInfo, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let p = sm_profile::Profile::new(&name);
    db.create_profile(&p).map_err(|e| e.to_string())?;
    Ok(ProfileInfo {
        id: p.id.to_string(),
        display_name: p.display_name,
        total_play_count: 0,
        total_dance_points: 0,
    })
}

#[tauri::command]
pub fn save_score(state: State<AppState>, req: SaveScoreRequest) -> Result<(), String> {
    let mut db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let profile_id: uuid::Uuid = req.profile_id.parse().map_err(|e: uuid::Error| e.to_string())?;

    let hs = sm_profile::HighScore {
        id: uuid::Uuid::new_v4(),
        profile_id,
        song_path: req.song_path,
        steps_type: req.steps_type,
        difficulty: req.difficulty,
        meter: req.meter,
        grade: req.grade,
        dp_percent: req.dp_percent,
        score: req.score,
        max_combo: req.max_combo,
        w1: req.w1, w2: req.w2, w3: req.w3, w4: req.w4, w5: req.w5,
        miss: req.miss, held: req.held, let_go: req.let_go, mines_hit: req.mines_hit,
        modifiers: req.modifiers,
        played_at: chrono::Utc::now(),
    };
    db.save_high_score(&hs).map_err(|e| e.to_string())?;
    db.update_profile_stats(&profile_id, req.score, 0.0)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_top_scores(
    state: State<AppState>,
    profile_id: String,
    song_path: String,
    steps_type: String,
    difficulty: String,
    limit: Option<usize>,
) -> Result<Vec<HighScoreInfo>, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let pid: uuid::Uuid = profile_id.parse().map_err(|e: uuid::Error| e.to_string())?;
    let lim = limit.unwrap_or(sm_profile::db::TOP_SCORES_CAP);
    let rows = db
        .get_top_scores(&pid, &song_path, &steps_type, &difficulty, lim)
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(high_score_to_info).collect())
}

#[tauri::command]
pub fn clear_chart_top_scores(
    state: State<AppState>,
    profile_id: String,
    song_path: String,
    steps_type: String,
    difficulty: String,
) -> Result<(), String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let pid: uuid::Uuid = profile_id.parse().map_err(|e: uuid::Error| e.to_string())?;
    db.clear_top_scores_for_chart(&pid, &song_path, &steps_type, &difficulty)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_recent_scores(
    state: State<AppState>,
    profile_id: String,
    limit: Option<usize>,
) -> Result<Vec<HighScoreInfo>, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let pid: uuid::Uuid = profile_id.parse().map_err(|e: uuid::Error| e.to_string())?;
    let scores = db
        .get_recent_scores(&pid, limit.unwrap_or(20))
        .map_err(|e| e.to_string())?;
    Ok(scores.into_iter().map(high_score_to_info).collect())
}
