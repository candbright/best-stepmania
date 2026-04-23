use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReplayAction {
    Down = 1,
    Up = 2,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayEvent {
    pub delta_ms: u32,
    pub track: u8,
    pub action: ReplayAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayRecord {
    pub id: Uuid,
    pub score_id: Uuid,
    pub replay_version: u16,
    pub engine_version: String,
    pub chart_fingerprint: String,
    pub started_at_chart_second: f64,
    pub playback_rate: f32,
    pub modifiers: String,
    pub seed: Option<u64>,
    pub events_blob: Vec<u8>,
    pub event_count: u32,
    pub duration_ms: u32,
    pub checksum: String,
    pub created_at: DateTime<Utc>,
}
