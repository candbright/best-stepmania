use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayEventRequest {
    pub delta_ms: u32,
    pub track: u8,
    pub action: u8,
    pub key_mask: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayPayloadRequest {
    pub replay_version: u16,
    pub engine_version: String,
    pub chart_fingerprint: String,
    pub started_at_chart_second: f64,
    pub playback_rate: f32,
    pub modifiers: String,
    pub seed: Option<u64>,
    pub events: Vec<ReplayEventRequest>,
    pub duration_ms: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScoreWithReplayRequest {
    pub score: SaveScoreRequest,
    pub replay: ReplayPayloadRequest,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighScoreInfo {
    pub score_id: String,
    pub has_replay: bool,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayEventInfo {
    pub delta_ms: u32,
    pub track: u8,
    pub action: u8,
    pub key_mask: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayPayload {
    pub replay_id: String,
    pub score_id: String,
    pub replay_version: u16,
    pub engine_version: String,
    pub chart_fingerprint: String,
    pub started_at_chart_second: f64,
    pub playback_rate: f32,
    pub modifiers: String,
    pub seed: Option<u64>,
    pub events: Vec<ReplayEventInfo>,
    pub event_count: u32,
    pub duration_ms: u32,
    pub checksum: String,
    pub created_at: String,
}

fn high_score_to_info(h: sm_profile::HighScore, has_replay: bool) -> HighScoreInfo {
    let fc = h.full_combo();
    let normalized_grade = normalize_grade_to_sss_f(&h.grade, h.dp_percent);
    HighScoreInfo {
        score_id: h.id.to_string(),
        has_replay,
        grade: normalized_grade,
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

fn grade_from_dp_percent(dp_percent: f64) -> String {
    let pct = dp_percent.clamp(0.0, 1.0);
    if pct >= 1.0 {
        "SSS".to_string()
    } else if pct >= 0.93 {
        "SS".to_string()
    } else if pct >= 0.8 {
        "S".to_string()
    } else if pct >= 0.65 {
        "A".to_string()
    } else if pct >= 0.45 {
        "B".to_string()
    } else if pct >= 0.2 {
        "C".to_string()
    } else if pct >= 0.0001 {
        "D".to_string()
    } else {
        "F".to_string()
    }
}

fn normalize_grade_to_sss_f(raw: &str, dp_percent: f64) -> String {
    match raw.trim().to_ascii_uppercase().as_str() {
        "SSS" | "SS" | "S" | "A" | "B" | "C" | "D" | "F" => raw.trim().to_ascii_uppercase(),
        _ => grade_from_dp_percent(dp_percent),
    }
}

fn encode_replay_events(events: &[ReplayEventRequest]) -> Result<Vec<u8>, String> {
    serde_json::to_vec(events).map_err(|e| e.to_string())
}

fn decode_replay_events(payload: &[u8]) -> Result<Vec<ReplayEventRequest>, String> {
    serde_json::from_slice(payload).map_err(|e| e.to_string())
}

fn checksum_hex(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
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
    let profile_id: uuid::Uuid = req
        .profile_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;

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
        w1: req.w1,
        w2: req.w2,
        w3: req.w3,
        w4: req.w4,
        w5: req.w5,
        miss: req.miss,
        held: req.held,
        let_go: req.let_go,
        mines_hit: req.mines_hit,
        modifiers: req.modifiers,
        played_at: chrono::Utc::now(),
    };
    db.save_high_score(&hs).map_err(|e| e.to_string())?;
    db.update_profile_stats(&profile_id, req.score, 0.0)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_score_with_replay(
    state: State<AppState>,
    req: SaveScoreWithReplayRequest,
) -> Result<(), String> {
    let mut db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let profile_id: uuid::Uuid = req
        .score
        .profile_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    let score_id = uuid::Uuid::new_v4();
    let hs = sm_profile::HighScore {
        id: score_id,
        profile_id,
        song_path: req.score.song_path,
        steps_type: req.score.steps_type,
        difficulty: req.score.difficulty,
        meter: req.score.meter,
        grade: req.score.grade,
        dp_percent: req.score.dp_percent,
        score: req.score.score,
        max_combo: req.score.max_combo,
        w1: req.score.w1,
        w2: req.score.w2,
        w3: req.score.w3,
        w4: req.score.w4,
        w5: req.score.w5,
        miss: req.score.miss,
        held: req.score.held,
        let_go: req.score.let_go,
        mines_hit: req.score.mines_hit,
        modifiers: req.score.modifiers,
        played_at: chrono::Utc::now(),
    };

    let events_blob = encode_replay_events(&req.replay.events)?;
    let replay = sm_profile::ReplayRecord {
        id: uuid::Uuid::new_v4(),
        score_id,
        replay_version: req.replay.replay_version,
        engine_version: req.replay.engine_version,
        chart_fingerprint: req.replay.chart_fingerprint,
        started_at_chart_second: req.replay.started_at_chart_second,
        playback_rate: req.replay.playback_rate,
        modifiers: req.replay.modifiers,
        seed: req.replay.seed,
        events_blob: events_blob.clone(),
        event_count: req.replay.events.len() as u32,
        duration_ms: req.replay.duration_ms,
        checksum: checksum_hex(&events_blob),
        created_at: chrono::Utc::now(),
    };
    db.save_high_score_with_replay(&hs, Some(&replay))
        .map_err(|e| e.to_string())?;
    db.update_profile_stats(&profile_id, hs.score, 0.0)
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
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let has_replay = db
            .has_replay_for_score(&row.id)
            .map_err(|e| e.to_string())?;
        out.push(high_score_to_info(row, has_replay));
    }
    Ok(out)
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
    let mut out = Vec::with_capacity(scores.len());
    for score in scores {
        let has_replay = db
            .has_replay_for_score(&score.id)
            .map_err(|e| e.to_string())?;
        out.push(high_score_to_info(score, has_replay));
    }
    Ok(out)
}

#[tauri::command]
pub fn get_replay_by_score_id(
    state: State<AppState>,
    score_id: String,
) -> Result<Option<ReplayPayload>, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let sid: uuid::Uuid = score_id.parse().map_err(|e: uuid::Error| e.to_string())?;
    let Some(replay) = db.get_replay_by_score_id(&sid).map_err(|e| e.to_string())? else {
        return Ok(None);
    };

    let events = decode_replay_events(&replay.events_blob)?
        .into_iter()
        .map(|evt| ReplayEventInfo {
            delta_ms: evt.delta_ms,
            track: evt.track,
            action: evt.action,
            key_mask: evt.key_mask,
        })
        .collect::<Vec<_>>();

    Ok(Some(ReplayPayload {
        replay_id: replay.id.to_string(),
        score_id: replay.score_id.to_string(),
        replay_version: replay.replay_version,
        engine_version: replay.engine_version,
        chart_fingerprint: replay.chart_fingerprint,
        started_at_chart_second: replay.started_at_chart_second,
        playback_rate: replay.playback_rate,
        modifiers: replay.modifiers,
        seed: replay.seed,
        event_count: replay.event_count,
        duration_ms: replay.duration_ms,
        checksum: replay.checksum,
        created_at: replay.created_at.to_rfc3339(),
        events,
    }))
}

#[tauri::command]
pub fn toggle_favorite(state: State<AppState>, song_path: String) -> Result<bool, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    db.toggle_favorite(&song_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_favorite(state: State<AppState>, song_path: String) -> Result<bool, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    db.is_favorite(&song_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favorites(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    db.get_favorites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cleanup_orphaned_favorites(state: State<AppState>) -> Result<usize, String> {
    let db = state.profile_db.lock().map_err(|e| e.to_string())?;
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    let valid_paths: Vec<String> = mgr
        .songs
        .iter()
        .map(|s| s.path.to_string_lossy().to_string())
        .collect();
    db.cleanup_orphaned_favorites(&valid_paths)
        .map_err(|e| e.to_string())
}
