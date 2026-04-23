use serde::Serialize;
use sm_score::life::LifeConfig;
use sm_score::{GradeThresholds, ScoreWeights, TimingWindows};

/// Scoring configuration exposed to the frontend.
/// This is the single source of truth — the frontend should NOT hardcode these values.
/// All numeric constants originate from sm-score crate types; this struct is the
/// serialisation adapter (IPC anti-corruption layer) between Rust internals and TypeScript.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringConfig {
    pub timing_windows: TimingWindowsDto,
    pub miss_window: f64,
    pub dp_weights: DpWeightsDto,
    pub life_deltas: LifeDeltasDto,
    pub grade_thresholds: GradeThresholdsDto,
}

#[derive(Debug, Serialize)]
pub struct TimingWindowsDto {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub w5: f64,
    pub mine: f64,
    pub hold: f64,
    pub roll: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DpWeightsDto {
    pub w1: i32,
    pub w2: i32,
    pub w3: i32,
    pub w4: i32,
    pub w5: i32,
    pub miss: i32,
    pub held: i32,
    pub let_go: i32,
    pub hit_mine: i32,
}

#[derive(Debug, Serialize)]
pub struct LifeDeltasDto {
    pub bar: LifeDeltaSet,
    pub survival: LifeDeltaSet,
    pub battery: LifeDeltaSet,
}

/// Per-judgment life deltas for a single life-bar mode.
/// `mine` is the life drain when hitting a mine in this mode (negative or zero).
#[derive(Debug, Serialize)]
pub struct LifeDeltaSet {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub w5: f64,
    pub miss: f64,
    pub mine: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeThresholdsDto {
    /// Min DP ratio (0–1) for SSS grade.
    #[serde(rename = "minSss")]
    pub min_sss: f64,
    pub ss: f64,
    pub s: f64,
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
}

/// Build a `LifeDeltaSet` from a `LifeConfig`.
/// Battery mode has special life handling (lives depletion on Miss) so its judgment
/// deltas are all zero — the frontend applies the lives logic separately.
fn life_delta_set(cfg: &LifeConfig) -> LifeDeltaSet {
    if cfg.life_type == sm_score::LifeType::Battery {
        return LifeDeltaSet {
            w1: 0.0,
            w2: 0.0,
            w3: 0.0,
            w4: 0.0,
            w5: 0.0,
            miss: 0.0,
            mine: 0.0,
        };
    }
    LifeDeltaSet {
        w1: cfg.deltas.w1,
        w2: cfg.deltas.w2,
        w3: cfg.deltas.w3,
        w4: cfg.deltas.w4,
        w5: cfg.deltas.w5,
        miss: cfg.deltas.miss,
        mine: cfg.deltas.hit_mine,
    }
}

#[tauri::command]
pub fn get_scoring_config() -> ScoringConfig {
    let tw = TimingWindows::default();
    let weights = ScoreWeights::default();
    let thresholds = GradeThresholds::default();
    let bar = LifeConfig::default();
    let survival = LifeConfig::survival();
    let battery = LifeConfig::battery(3);

    ScoringConfig {
        timing_windows: TimingWindowsDto {
            w1: tw.w1,
            w2: tw.w2,
            w3: tw.w3,
            w4: tw.w4,
            w5: tw.w5,
            mine: tw.mine,
            hold: tw.hold,
            roll: tw.roll,
        },
        // The miss window equals the outermost tap timing window (W5).
        miss_window: tw.w5,
        dp_weights: DpWeightsDto {
            w1: weights.dp[0],
            w2: weights.dp[1],
            w3: weights.dp[2],
            w4: weights.dp[3],
            w5: weights.dp[4],
            miss: weights.dp[5],
            held: weights.held,
            let_go: weights.let_go,
            hit_mine: weights.hit_mine,
        },
        life_deltas: LifeDeltasDto {
            bar: life_delta_set(&bar),
            survival: life_delta_set(&survival),
            battery: life_delta_set(&battery),
        },
        grade_thresholds: GradeThresholdsDto {
            min_sss: thresholds.min_sss,
            ss: thresholds.ss,
            s: thresholds.s,
            a: thresholds.a,
            b: thresholds.b,
            c: thresholds.c,
            d: thresholds.d,
        },
    }
}
