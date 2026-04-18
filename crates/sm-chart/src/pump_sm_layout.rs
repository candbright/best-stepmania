//! Community Pump `.sm` row layout: each SSC lane maps to SM columns 2,3,5,7,8 (1-based),
//! i.e. 0-based indices `1,2,4,6,7` per player half. Double uses the same five on the right
//! half with a +10 column offset.

pub const PUMP_SM_LANE_COL0: [usize; 5] = [1, 2, 4, 6, 7];

#[inline]
pub fn sm_col0_to_lane_single(col0: usize) -> Option<usize> {
    PUMP_SM_LANE_COL0.iter().position(|&c| c == col0)
}

#[inline]
pub fn lane_to_sm_col0_single(lane: usize) -> Option<usize> {
    PUMP_SM_LANE_COL0.get(lane).copied()
}

#[inline]
pub fn lane_to_sm_col0_double(lane: usize) -> Option<usize> {
    if lane >= 10 {
        return None;
    }
    let base = if lane < 5 { 0 } else { 10 };
    let local = if lane < 5 { lane } else { lane - 5 };
    PUMP_SM_LANE_COL0.get(local).map(|c| c + base)
}

#[inline]
pub fn sm_col0_to_lane_double(col0: usize) -> Option<usize> {
    if col0 < 10 {
        sm_col0_to_lane_single(col0)
    } else if col0 < 20 {
        sm_col0_to_lane_single(col0 - 10).map(|l| l + 5)
    } else {
        None
    }
}

/// 10-wide SM row is consistent with community sparse lanes and/or legacy pair hold tails (`3` on odd columns).
pub fn row_fits_sm_community_single_10(chars: &[char]) -> bool {
    let take = chars.len().min(10);
    for i in 0..take {
        let c = chars[i];
        if c == '0' {
            continue;
        }
        if sm_col0_to_lane_single(i).is_some() {
            continue;
        }
        if i % 2 == 1 && c == '3' {
            continue;
        }
        return false;
    }
    true
}

/// 20-wide SM row: left / right halves each use [`row_fits_sm_community_single_10`] semantics.
pub fn row_fits_sm_community_double_20(chars: &[char]) -> bool {
    if chars.len() < 20 {
        return false;
    }
    for i in 0..20 {
        let c = chars[i];
        if c == '0' {
            continue;
        }
        if sm_col0_to_lane_double(i).is_some() {
            continue;
        }
        if i % 2 == 1 && c == '3' {
            continue;
        }
        return false;
    }
    true
}
