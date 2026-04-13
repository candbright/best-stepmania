use serde::Serialize;
use sm_score::TimingWindows;

/// Scoring configuration exposed to the frontend.
/// This is the single source of truth — the frontend should NOT hardcode these values.
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

#[derive(Debug, Serialize)]
pub struct LifeDeltaSet {
    pub w1: f64,
    pub w2: f64,
    pub w3: f64,
    pub w4: f64,
    pub w5: f64,
    pub miss: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeThresholdsDto {
    /// Min DP ratio (0–1) for SSS grade.
    #[serde(rename = "minSss")]
    pub sss: f64,
    pub ss: f64,
    pub s: f64,
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
}

#[tauri::command]
pub fn get_scoring_config() -> ScoringConfig {
    let tw = TimingWindows::default();
    let weights = sm_score::ScoreWeights::default();
    let thresholds = sm_score::GradeThresholds::default();

    // Build life deltas from actual Rust ScoreState behavior
    // These mirror the update_life() method in sm_score::ScoreState
    let bar_deltas = LifeDeltaSet {
        w1: 0.008, w2: 0.008, w3: 0.004, w4: 0.0, w5: -0.04, miss: -0.08,
    };
    let survival_deltas = LifeDeltaSet {
        w1: 0.004, w2: 0.004, w3: 0.002, w4: 0.0, w5: -0.06, miss: -0.12,
    };
    let battery_deltas = LifeDeltaSet {
        w1: 0.0, w2: 0.0, w3: 0.0, w4: 0.0, w5: 0.0, miss: 0.0,
    };

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
        miss_window: tw.w5, // miss window = W5 window
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
            bar: bar_deltas,
            survival: survival_deltas,
            battery: battery_deltas,
        },
        grade_thresholds: GradeThresholdsDto {
            sss: thresholds.sss,
            ss: thresholds.ss,
            s: thresholds.s,
            a: thresholds.a,
            b: thresholds.b,
            c: thresholds.c,
            d: thresholds.d,
        },
    }
}
