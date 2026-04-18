use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Difficulty {
    Beginner,
    Easy,
    Medium,
    Hard,
    Challenge,
    Edit,
}

impl Difficulty {
    pub fn from_str_tag(s: &str) -> Option<Self> {
        let low = s.to_lowercase();
        match low.as_str() {
            "beginner" => Some(Self::Beginner),
            "easy" | "basic" => Some(Self::Easy),
            "medium" | "another" | "trick" => Some(Self::Medium),
            "hard" | "maniac" | "ssr" => Some(Self::Hard),
            "challenge" | "expert" | "smaniac" => Some(Self::Challenge),
            "edit" => Some(Self::Edit),
            _ => {
                // Community `.sm`: `level19` in #NOTES metadata (SSC export roundtrip).
                if let Some(tail) = low.strip_prefix("level") {
                    if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
                        return Some(Self::Edit);
                    }
                }
                None
            }
        }
    }
}

impl fmt::Display for Difficulty {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Beginner => "Beginner",
            Self::Easy => "Easy",
            Self::Medium => "Medium",
            Self::Hard => "Hard",
            Self::Challenge => "Challenge",
            Self::Edit => "Edit",
        };
        write!(f, "{}", s)
    }
}
