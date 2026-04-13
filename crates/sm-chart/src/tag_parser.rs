use sm_timing::*;

/// Parse a "#TAG:VALUE;" pair from SM/SSC content
pub fn parse_tag_value(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if !line.starts_with('#') {
        return None;
    }
    let line = &line[1..];
    let colon_pos = line.find(':')?;
    let tag = &line[..colon_pos];
    let mut value = &line[colon_pos + 1..];
    if value.ends_with(';') {
        value = &value[..value.len() - 1];
    }
    Some((tag, value))
}

/// Parse "beat=value,beat=value,..." into Vec<(f64, f64)>
pub fn parse_beat_value_pairs(s: &str) -> Vec<(f64, f64)> {
    s.split(',')
        .filter_map(|pair| {
            let pair = pair.trim();
            if pair.is_empty() {
                return None;
            }
            let mut parts = pair.splitn(2, '=');
            let beat: f64 = parts.next()?.trim().parse().ok()?;
            let val: f64 = parts.next()?.trim().parse().ok()?;
            Some((beat, val))
        })
        .collect()
}

pub fn parse_bpms(s: &str) -> Vec<BpmSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, bpm)| BpmSegment { beat, bpm })
        .collect()
}

pub fn parse_stops(s: &str) -> Vec<StopSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, dur)| StopSegment {
            beat,
            duration: dur,
        })
        .collect()
}

pub fn parse_delays(s: &str) -> Vec<DelaySegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, dur)| DelaySegment {
            beat,
            duration: dur,
        })
        .collect()
}

pub fn parse_warps(s: &str) -> Vec<WarpSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, skip)| WarpSegment {
            beat,
            skip_beats: skip,
        })
        .collect()
}

pub fn parse_scrolls(s: &str) -> Vec<ScrollSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, factor)| ScrollSegment { beat, factor })
        .collect()
}

pub fn parse_fakes(s: &str) -> Vec<FakeSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, len)| FakeSegment {
            beat,
            length_beats: len,
        })
        .collect()
}

pub fn parse_time_signatures(s: &str) -> Vec<TimeSignatureSegment> {
    s.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let parts: Vec<&str> = entry.splitn(3, '=').collect();
            if parts.len() < 3 {
                return None;
            }
            Some(TimeSignatureSegment {
                beat: parts[0].trim().parse().ok()?,
                numerator: parts[1].trim().parse().ok()?,
                denominator: parts[2].trim().parse().ok()?,
            })
        })
        .collect()
}

pub fn parse_tickcounts(s: &str) -> Vec<TickcountSegment> {
    parse_beat_value_pairs(s)
        .into_iter()
        .map(|(beat, ticks)| TickcountSegment {
            beat,
            ticks_per_beat: ticks as i32,
        })
        .collect()
}

pub fn parse_speeds(s: &str) -> Vec<SpeedSegment> {
    s.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let parts: Vec<&str> = entry.splitn(4, '=').collect();
            if parts.len() < 3 {
                return None;
            }
            let unit = if parts.len() >= 4 {
                match parts[3].trim() {
                    "0" => SpeedUnit::Beats,
                    "1" => SpeedUnit::Seconds,
                    _ => SpeedUnit::Beats,
                }
            } else {
                SpeedUnit::Beats
            };
            Some(SpeedSegment {
                beat: parts[0].trim().parse().ok()?,
                ratio: parts[1].trim().parse().ok()?,
                duration: parts[2].trim().parse().ok()?,
                unit,
            })
        })
        .collect()
}

pub fn parse_combos(s: &str) -> Vec<ComboSegment> {
    s.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let parts: Vec<&str> = entry.splitn(3, '=').collect();
            if parts.len() < 2 {
                return None;
            }
            let miss_mult = if parts.len() >= 3 {
                parts[2].trim().parse().unwrap_or(1)
            } else {
                parts[1].trim().parse().unwrap_or(1)
            };
            Some(ComboSegment {
                beat: parts[0].trim().parse().ok()?,
                hit_mult: parts[1].trim().parse().ok()?,
                miss_mult,
            })
        })
        .collect()
}

pub fn parse_labels(s: &str) -> Vec<LabelSegment> {
    s.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let mut parts = entry.splitn(2, '=');
            let beat: f64 = parts.next()?.trim().parse().ok()?;
            let text = parts.next()?.trim().to_string();
            Some(LabelSegment { beat, text })
        })
        .collect()
}
