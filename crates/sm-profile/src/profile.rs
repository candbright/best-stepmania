use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: Uuid,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
    pub last_played_at: DateTime<Utc>,
    pub total_play_count: u32,
    pub total_dance_points: i64,
    pub total_play_time_secs: f64,
    pub default_speed_mod: String,
    pub default_noteskin: String,
}

impl Profile {
    pub fn new(name: &str) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            display_name: name.to_string(),
            created_at: now,
            last_played_at: now,
            total_play_count: 0,
            total_dance_points: 0,
            total_play_time_secs: 0.0,
            default_speed_mod: "C500".to_string(),
            default_noteskin: "default".to_string(),
        }
    }
}
