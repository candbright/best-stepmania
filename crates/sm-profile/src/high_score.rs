use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighScore {
    pub id: Uuid,
    pub profile_id: Uuid,
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
    pub played_at: DateTime<Utc>,
}

impl HighScore {
    pub fn total_notes(&self) -> u32 {
        self.w1 + self.w2 + self.w3 + self.w4 + self.w5 + self.miss
    }

    pub fn full_combo(&self) -> bool {
        self.w5 == 0 && self.miss == 0
    }
}
