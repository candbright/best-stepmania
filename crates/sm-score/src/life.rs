use crate::{Judgment, LifeType};
use serde::{Deserialize, Serialize};

/// Life bar configuration with customizable deltas per judgment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeConfig {
    pub life_type: LifeType,
    pub initial_life: f64,
    pub battery_lives: u32,
    pub deltas: LifeDeltas,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifeDeltas {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub w5: f64,
    pub miss: f64,
    pub held: f64,
    pub let_go: f64,
    pub hit_mine: f64,
}

impl Default for LifeDeltas {
    fn default() -> Self {
        Self {
            w1: 0.008,
            w2: 0.008,
            w3: 0.004,
            w4: 0.0,
            w5: -0.04,
            miss: -0.08,
            held: 0.008,
            let_go: -0.04,
            hit_mine: -0.04,
        }
    }
}

impl Default for LifeConfig {
    fn default() -> Self {
        // Bar: full life at start (1.0), matching frontend behavior.
        Self {
            life_type: LifeType::Bar,
            initial_life: 1.0,
            battery_lives: 3,
            deltas: LifeDeltas::default(),
        }
    }
}

impl LifeConfig {
    pub fn survival() -> Self {
        Self {
            life_type: LifeType::Survival,
            initial_life: 1.0,
            battery_lives: 0,
            deltas: LifeDeltas {
                w1: 0.004,
                w2: 0.004,
                w3: 0.002,
                w4: 0.0,
                w5: -0.06,
                miss: -0.12,
                held: 0.004,
                let_go: -0.06,
                hit_mine: -0.06,
            },
        }
    }

    pub fn battery(lives: u32) -> Self {
        Self {
            life_type: LifeType::Battery,
            initial_life: 1.0,
            battery_lives: lives,
            deltas: LifeDeltas::default(),
        }
    }

    pub fn delta_for(&self, judgment: Judgment) -> f64 {
        match judgment {
            Judgment::W1 => self.deltas.w1,
            Judgment::W2 => self.deltas.w2,
            Judgment::W3 => self.deltas.w3,
            Judgment::W4 => self.deltas.w4,
            Judgment::W5 => self.deltas.w5,
            Judgment::Miss => self.deltas.miss,
        }
    }
}
