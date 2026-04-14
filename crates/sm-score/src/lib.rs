//! # sm-score — Scoring Constants & Validation (Single Source of Truth)
//!
//! This crate defines all scoring-related constants and types:
//! - Timing windows (W1–W5, mine, hold, roll)
//! - Dance point weights
//! - Life bar deltas (bar, battery, survival)
//! - Grade thresholds
//!
//! ## Architecture Note
//!
//! Real-time judgment processing during gameplay is handled by the frontend
//! `JudgmentSystem.ts` for latency reasons (IPC round-trip would be too slow
//! for frame-level timing). The frontend fetches all constants from this crate
//! at startup via the `get_scoring_config` Tauri command.
//!
//! This crate also provides a full `ScoreState` implementation for:
//! - Server-side score validation
//! - Replay verification
//! - Offline batch score computation

pub mod life;
pub mod radar;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Judgment {
    W1,
    W2,
    W3,
    W4,
    W5,
    Miss,
}

impl Judgment {
    pub fn display_name(&self, style: JudgmentStyle) -> &'static str {
        match style {
            JudgmentStyle::Ddr => match self {
                Self::W1 => "Marvelous",
                Self::W2 => "Perfect",
                Self::W3 => "Great",
                Self::W4 => "Good",
                Self::W5 => "Boo",
                Self::Miss => "Miss",
            },
            JudgmentStyle::Itg => match self {
                Self::W1 => "Fantastic",
                Self::W2 => "Excellent",
                Self::W3 => "Great",
                Self::W4 => "Decent",
                Self::W5 => "Way Off",
                Self::Miss => "Miss",
            },
        }
    }

    pub fn is_combo_breaking(&self) -> bool {
        matches!(self, Self::Miss)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum JudgmentStyle {
    Ddr,
    Itg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingWindows {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub w5: f64,
    pub mine: f64,
    pub hold: f64,
    pub roll: f64,
}

impl Default for TimingWindows {
    fn default() -> Self {
        Self {
            w1: 0.0225,
            w2: 0.045,
            w3: 0.090,
            w4: 0.135,
            w5: 0.180,
            mine: 0.090,
            hold: 0.250,
            roll: 0.500,
        }
    }
}

impl TimingWindows {
    pub fn judge(&self, offset_seconds: f64) -> Judgment {
        let abs_offset = offset_seconds.abs();
        if abs_offset <= self.w1 {
            Judgment::W1
        } else if abs_offset <= self.w2 {
            Judgment::W2
        } else if abs_offset <= self.w3 {
            Judgment::W3
        } else if abs_offset <= self.w4 {
            Judgment::W4
        } else if abs_offset <= self.w5 {
            Judgment::W5
        } else {
            Judgment::Miss
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreWeights {
    /// DP deltas for W1–W5 and Miss (index 0–5).
    pub dp: [i32; 6],
    /// DP bonus for a completed hold/roll tail.
    pub held: i32,
    /// DP delta when a hold is let go early (typically 0 — no penalty).
    pub let_go: i32,
    /// DP penalty for hitting a mine.
    pub hit_mine: i32,
    /// Life drain when a mine is hit (positive value, subtracted from life).
    /// Only applied in Bar and Survival modes; Battery mode ignores this.
    pub mine_life_drain: f64,
}

impl Default for ScoreWeights {
    fn default() -> Self {
        Self {
            dp: [2, 2, 1, 0, 0, 0],
            held: 6,
            let_go: 0,
            hit_mine: -8,
            mine_life_drain: 0.04,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JudgmentCounts {
    pub w1: u32,
    pub w2: u32,
    pub w3: u32,
    pub w4: u32,
    pub w5: u32,
    pub miss: u32,
    pub held: u32,
    pub let_go: u32,
    pub mines_hit: u32,
}

impl Default for JudgmentCounts {
    fn default() -> Self {
        Self {
            w1: 0, w2: 0, w3: 0, w4: 0, w5: 0,
            miss: 0, held: 0, let_go: 0, mines_hit: 0,
        }
    }
}

impl JudgmentCounts {
    pub fn add_judgment(&mut self, j: Judgment) {
        match j {
            Judgment::W1 => self.w1 += 1,
            Judgment::W2 => self.w2 += 1,
            Judgment::W3 => self.w3 += 1,
            Judgment::W4 => self.w4 += 1,
            Judgment::W5 => self.w5 += 1,
            Judgment::Miss => self.miss += 1,
        }
    }

    pub fn total_notes(&self) -> u32 {
        self.w1 + self.w2 + self.w3 + self.w4 + self.w5 + self.miss
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Grade {
    F,
    D,
    C,
    B,
    A,
    S,
    SS,
    SSS,
}

impl Grade {
    pub fn display(&self) -> &'static str {
        match self {
            Self::F => "F",
            Self::D => "D",
            Self::C => "C",
            Self::B => "B",
            Self::A => "A",
            Self::S => "S",
            Self::SS => "SS",
            Self::SSS => "SSS",
        }
    }
}

/// Minimum `dp_percent()` (0.0–1.0) to earn each grade; compare from SSS down to D.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeThresholds {
    /// Renamed `min_sss` (serialises as `minSss`) so it is unambiguous at the IPC boundary.
    pub min_sss: f64,
    pub ss: f64,
    pub s: f64,
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
}

impl Default for GradeThresholds {
    fn default() -> Self {
        Self {
            min_sss: 1.0,
            ss: 0.93,
            s: 0.80,
            a: 0.65,
            b: 0.45,
            c: 0.20,
            d: 0.0001,
        }
    }
}

// --- Life Bar Types ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LifeType {
    Bar,
    Battery,
    Survival,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreState {
    pub judgments: JudgmentCounts,
    pub combo: u32,
    pub max_combo: u32,
    pub dance_points: i32,
    pub max_possible_dp: i32,
    pub weights: ScoreWeights,
    pub thresholds: GradeThresholds,
    pub failed: bool,
    /// 0.0–1.0; for Battery this is `battery_lives / battery_max_lives`.
    pub life: f64,
    pub life_type: LifeType,
    /// Remaining battery lives (Battery mode only).
    pub battery_lives: u32,
    /// Initial battery lives — used as the denominator for the `life` percentage.
    pub battery_max_lives: u32,
    pub timing_offsets: Vec<f64>,
}

impl ScoreState {
    pub fn new(total_scoreable_notes: u32, total_holds: u32) -> Self {
        let weights = ScoreWeights::default();
        let max_dp_per_note = weights.dp[0];
        let max_possible_dp =
            total_scoreable_notes as i32 * max_dp_per_note + total_holds as i32 * weights.held;

        Self {
            judgments: JudgmentCounts::default(),
            combo: 0,
            max_combo: 0,
            dance_points: 0,
            max_possible_dp,
            weights,
            thresholds: GradeThresholds::default(),
            failed: false,
            life: 1.0,
            life_type: LifeType::Bar,
            battery_lives: 3,
            battery_max_lives: 3,
            timing_offsets: Vec::new(),
        }
    }

    pub fn with_life_type(mut self, lt: LifeType) -> Self {
        self.life_type = lt;
        // All modes start at 1.0: Bar/Survival represent a 0–1 health ratio,
        // Battery represents remaining_lives / total_lives (also 1.0 at start).
        self.life = 1.0;
        self
    }

    pub fn with_battery_lives(mut self, lives: u32) -> Self {
        self.battery_lives = lives;
        self.battery_max_lives = lives;
        self
    }

    pub fn record_judgment_with_offset(&mut self, judgment: Judgment, offset: f64) {
        self.timing_offsets.push(offset);
        self.record_judgment(judgment);
    }

    pub fn record_judgment(&mut self, judgment: Judgment) {
        self.judgments.add_judgment(judgment);

        let dp_idx = match judgment {
            Judgment::W1 => 0,
            Judgment::W2 => 1,
            Judgment::W3 => 2,
            Judgment::W4 => 3,
            Judgment::W5 => 4,
            Judgment::Miss => 5,
        };
        self.dance_points += self.weights.dp[dp_idx];

        if judgment.is_combo_breaking() {
            self.combo = 0;
        } else {
            self.combo += 1;
            self.max_combo = self.max_combo.max(self.combo);
        }

        self.update_life(judgment);
    }

    /// Update the life bar after a tap judgment, delegating deltas to `LifeConfig`
    /// so that `sm-score/src/life.rs` remains the single source of truth for all
    /// life-change constants.
    fn update_life(&mut self, judgment: Judgment) {
        use crate::life::LifeConfig;
        match self.life_type {
            LifeType::Bar => {
                let delta = LifeConfig::default().delta_for(judgment);
                self.life = (self.life + delta).clamp(0.0, 1.0);
                if self.life <= 0.0 { self.failed = true; }
            }
            LifeType::Battery => {
                // Only a Miss (is_combo_breaking) consumes a battery life.
                // is_combo_breaking() is already Miss-only after the refactor.
                if judgment.is_combo_breaking() {
                    if self.battery_lives > 0 {
                        self.battery_lives -= 1;
                    }
                    let max = self.battery_max_lives.max(1);
                    self.life = self.battery_lives as f64 / max as f64;
                    if self.battery_lives == 0 { self.failed = true; }
                }
            }
            LifeType::Survival => {
                let delta = LifeConfig::survival().delta_for(judgment);
                self.life = (self.life + delta).clamp(0.0, 1.0);
                if self.life <= 0.0 { self.failed = true; }
            }
        }
    }

    pub fn record_hold_result(&mut self, held: bool) {
        if held {
            self.judgments.held += 1;
            self.dance_points += self.weights.held;
        } else {
            self.judgments.let_go += 1;
            self.dance_points += self.weights.let_go;
        }
    }

    pub fn record_mine_hit(&mut self) {
        self.judgments.mines_hit += 1;
        self.dance_points += self.weights.hit_mine;
        // Battery mode does not drain life directly on mine hits.
        if self.life_type != LifeType::Battery {
            self.life = (self.life - self.weights.mine_life_drain).max(0.0);
            if self.life <= 0.0 {
                self.failed = true;
            }
        }
    }

    pub fn dp_percent(&self) -> f64 {
        if self.max_possible_dp == 0 {
            return 1.0;
        }
        (self.dance_points as f64 / self.max_possible_dp as f64).clamp(0.0, 1.0)
    }

    pub fn grade(&self) -> Grade {
        if self.failed {
            return Grade::F;
        }
        let pct = self.dp_percent();
        let t = &self.thresholds;
        if pct >= t.min_sss {
            Grade::SSS
        } else if pct >= t.ss {
            Grade::SS
        } else if pct >= t.s {
            Grade::S
        } else if pct >= t.a {
            Grade::A
        } else if pct >= t.b {
            Grade::B
        } else if pct >= t.c {
            Grade::C
        } else if pct >= t.d {
            Grade::D
        } else {
            Grade::F
        }
    }

    pub fn is_full_combo(&self) -> bool {
        self.judgments.miss == 0
    }

    pub fn mean_offset(&self) -> f64 {
        if self.timing_offsets.is_empty() { return 0.0; }
        self.timing_offsets.iter().sum::<f64>() / self.timing_offsets.len() as f64
    }

    pub fn offset_histogram(&self, bins: usize, range: f64) -> Vec<u32> {
        let mut hist = vec![0u32; bins];
        let half = range / 2.0;
        for &offset in &self.timing_offsets {
            let normalized = (offset + half) / range;
            let idx = (normalized * bins as f64) as usize;
            let idx = idx.min(bins - 1);
            hist[idx] += 1;
        }
        hist
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_judgment_windows() {
        let tw = TimingWindows::default();
        assert_eq!(tw.judge(0.010), Judgment::W1);
        assert_eq!(tw.judge(0.030), Judgment::W2);
        assert_eq!(tw.judge(0.060), Judgment::W3);
        assert_eq!(tw.judge(0.100), Judgment::W4);
        assert_eq!(tw.judge(0.150), Judgment::W5);
        assert_eq!(tw.judge(0.200), Judgment::Miss);
    }

    #[test]
    fn test_score_state() {
        let mut state = ScoreState::new(100, 10);
        for _ in 0..50 { state.record_judgment(Judgment::W1); }
        for _ in 0..30 { state.record_judgment(Judgment::W2); }
        for _ in 0..20 { state.record_judgment(Judgment::W3); }
        assert_eq!(state.combo, 100);
        assert!(state.is_full_combo());
    }

    #[test]
    fn test_combo_break() {
        let mut state = ScoreState::new(10, 0);
        state.record_judgment(Judgment::W1);
        state.record_judgment(Judgment::W2);
        assert_eq!(state.combo, 2);
        state.record_judgment(Judgment::Miss);
        assert_eq!(state.combo, 0);
        assert_eq!(state.max_combo, 2);
    }

    #[test]
    fn test_grade() {
        let mut state = ScoreState::new(10, 0);
        for _ in 0..10 { state.record_judgment(Judgment::W1); }
        assert_eq!(state.grade(), Grade::SSS);
    }

    #[test]
    fn test_battery_life() {
        // Default battery lives = 3.
        let mut state = ScoreState::new(10, 0).with_life_type(LifeType::Battery).with_battery_lives(3);
        state.record_judgment(Judgment::Miss);
        assert_eq!(state.battery_lives, 2);
        assert!(!state.failed);
        state.record_judgment(Judgment::Miss);
        state.record_judgment(Judgment::Miss);
        assert!(state.failed);
    }

    #[test]
    fn test_battery_w5_no_drain() {
        // W5 must NOT drain a battery life (only Miss does).
        let mut state = ScoreState::new(10, 0).with_life_type(LifeType::Battery).with_battery_lives(3);
        for _ in 0..5 { state.record_judgment(Judgment::W5); }
        assert_eq!(state.battery_lives, 3);
        assert!(!state.failed);
    }

    #[test]
    fn test_w5_keeps_combo() {
        // W5 no longer resets the combo.
        let mut state = ScoreState::new(10, 0);
        state.record_judgment(Judgment::W1);
        state.record_judgment(Judgment::W5);
        assert_eq!(state.combo, 2);
    }

    #[test]
    fn test_fc_miss_only() {
        // FC requires zero misses; W5 alone does not break FC.
        let mut state = ScoreState::new(5, 0);
        for _ in 0..4 { state.record_judgment(Judgment::W5); }
        assert!(state.is_full_combo());
        state.record_judgment(Judgment::Miss);
        assert!(!state.is_full_combo());
    }

    #[test]
    fn test_offset_histogram() {
        let mut state = ScoreState::new(5, 0);
        for offset in &[-0.03, -0.01, 0.0, 0.01, 0.03] {
            state.record_judgment_with_offset(Judgment::W2, *offset);
        }
        let hist = state.offset_histogram(10, 0.18);
        assert_eq!(hist.iter().sum::<u32>(), 5);
    }
}
