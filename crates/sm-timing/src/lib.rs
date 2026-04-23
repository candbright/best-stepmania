use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingData {
    pub bpms: Vec<BpmSegment>,
    pub stops: Vec<StopSegment>,
    pub delays: Vec<DelaySegment>,
    pub warps: Vec<WarpSegment>,
    pub time_signatures: Vec<TimeSignatureSegment>,
    pub tickcounts: Vec<TickcountSegment>,
    pub combos: Vec<ComboSegment>,
    pub speeds: Vec<SpeedSegment>,
    pub scrolls: Vec<ScrollSegment>,
    pub fakes: Vec<FakeSegment>,
    pub labels: Vec<LabelSegment>,
    pub offset: f64,
}

impl Default for TimingData {
    fn default() -> Self {
        Self {
            bpms: vec![BpmSegment {
                beat: 0.0,
                bpm: 120.0,
            }],
            stops: Vec::new(),
            delays: Vec::new(),
            warps: Vec::new(),
            time_signatures: vec![TimeSignatureSegment {
                beat: 0.0,
                numerator: 4,
                denominator: 4,
            }],
            tickcounts: vec![TickcountSegment {
                beat: 0.0,
                ticks_per_beat: 4,
            }],
            combos: vec![ComboSegment {
                beat: 0.0,
                hit_mult: 1,
                miss_mult: 1,
            }],
            speeds: vec![SpeedSegment {
                beat: 0.0,
                ratio: 1.0,
                duration: 0.0,
                unit: SpeedUnit::Beats,
            }],
            scrolls: vec![ScrollSegment {
                beat: 0.0,
                factor: 1.0,
            }],
            fakes: Vec::new(),
            labels: Vec::new(),
            offset: 0.0,
        }
    }
}

impl TimingData {
    pub fn new() -> Self {
        Self::default()
    }

    /// Convert a beat position to a time in seconds.
    pub fn beat_to_second(&self, target_beat: f64) -> f64 {
        if self.bpms.is_empty() {
            return 0.0;
        }

        let mut time = -self.offset;
        let mut current_beat = 0.0;
        let mut current_bpm = self.bpms[0].bpm;

        for i in 0..self.bpms.len() {
            let seg_beat = self.bpms[i].beat;
            let next_beat = if i + 1 < self.bpms.len() {
                self.bpms[i + 1].beat.min(target_beat)
            } else {
                target_beat
            };

            if current_beat >= target_beat {
                break;
            }

            let start = current_beat.max(seg_beat);
            let end = next_beat.min(target_beat);

            if end > start {
                time += (end - start) * 60.0 / current_bpm;
            }

            if i + 1 < self.bpms.len() && next_beat >= self.bpms[i + 1].beat {
                current_bpm = self.bpms[i + 1].bpm;
            }
            current_beat = next_beat;
        }

        // Handle remaining beats after last BPM change
        if current_beat < target_beat {
            time += (target_beat - current_beat) * 60.0 / current_bpm;
        }

        // Add stops
        for stop in &self.stops {
            if stop.beat < target_beat {
                time += stop.duration;
            }
        }

        // Add delays
        for delay in &self.delays {
            if delay.beat <= target_beat {
                time += delay.duration;
            }
        }

        time
    }

    /// Convert a time in seconds to a beat position.
    pub fn second_to_beat(&self, target_second: f64) -> f64 {
        if self.bpms.is_empty() {
            return 0.0;
        }

        let mut time = -self.offset;
        let mut beat = 0.0;
        let mut bpm_idx = 0;
        let mut current_bpm = self.bpms[0].bpm;

        // Collect all events sorted by beat
        let mut stop_idx = 0;
        let mut delay_idx = 0;

        loop {
            if time >= target_second {
                break;
            }

            // Find next event beat
            let next_bpm_beat = if bpm_idx + 1 < self.bpms.len() {
                Some(self.bpms[bpm_idx + 1].beat)
            } else {
                None
            };
            let next_stop_beat = if stop_idx < self.stops.len() {
                Some(self.stops[stop_idx].beat)
            } else {
                None
            };
            let next_delay_beat = if delay_idx < self.delays.len() {
                Some(self.delays[delay_idx].beat)
            } else {
                None
            };

            let next_event_beat = [next_bpm_beat, next_stop_beat, next_delay_beat]
                .iter()
                .filter_map(|b| *b)
                .fold(f64::MAX, f64::min);

            if next_event_beat == f64::MAX {
                // No more events — advance to target
                let remaining = target_second - time;
                beat += remaining * current_bpm / 60.0;
                break;
            }

            // Advance to next event
            let beat_delta = next_event_beat - beat;
            let time_delta = beat_delta * 60.0 / current_bpm;

            if time + time_delta >= target_second {
                let remaining = target_second - time;
                beat += remaining * current_bpm / 60.0;
                break;
            }

            time += time_delta;
            beat = next_event_beat;

            // Process events at this beat
            if next_bpm_beat == Some(next_event_beat) {
                bpm_idx += 1;
                current_bpm = self.bpms[bpm_idx].bpm;
            }
            if next_stop_beat == Some(next_event_beat) {
                let stop_dur = self.stops[stop_idx].duration;
                if time + stop_dur >= target_second {
                    break;
                }
                time += stop_dur;
                stop_idx += 1;
            }
            if next_delay_beat == Some(next_event_beat) {
                let delay_dur = self.delays[delay_idx].duration;
                if time + delay_dur >= target_second {
                    break;
                }
                time += delay_dur;
                delay_idx += 1;
            }
        }

        beat
    }

    pub fn get_bpm_at_beat(&self, beat: f64) -> f64 {
        let mut bpm = if self.bpms.is_empty() {
            120.0
        } else {
            self.bpms[0].bpm
        };
        for seg in &self.bpms {
            if seg.beat > beat {
                break;
            }
            bpm = seg.bpm;
        }
        bpm
    }

    pub fn get_scroll_at_beat(&self, beat: f64) -> f64 {
        let mut factor = 1.0;
        for seg in &self.scrolls {
            if seg.beat > beat {
                break;
            }
            factor = seg.factor;
        }
        factor
    }

    pub fn is_warp_at_beat(&self, beat: f64) -> bool {
        self.warps
            .iter()
            .any(|w| beat >= w.beat && beat < w.beat + w.skip_beats)
    }

    pub fn is_fake_at_beat(&self, beat: f64) -> bool {
        self.fakes
            .iter()
            .any(|f| beat >= f.beat && beat < f.beat + f.length_beats)
    }

    pub fn min_bpm(&self) -> f64 {
        self.bpms.iter().map(|b| b.bpm).fold(f64::MAX, f64::min)
    }

    pub fn max_bpm(&self) -> f64 {
        self.bpms.iter().map(|b| b.bpm).fold(0.0_f64, f64::max)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpmSegment {
    pub beat: f64,
    pub bpm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopSegment {
    pub beat: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelaySegment {
    pub beat: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarpSegment {
    pub beat: f64,
    pub skip_beats: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSignatureSegment {
    pub beat: f64,
    pub numerator: i32,
    pub denominator: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickcountSegment {
    pub beat: f64,
    pub ticks_per_beat: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComboSegment {
    pub beat: f64,
    pub hit_mult: i32,
    pub miss_mult: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedSegment {
    pub beat: f64,
    pub ratio: f64,
    pub duration: f64,
    pub unit: SpeedUnit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpeedUnit {
    Beats,
    Seconds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollSegment {
    pub beat: f64,
    pub factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FakeSegment {
    pub beat: f64,
    pub length_beats: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelSegment {
    pub beat: f64,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_bpm() {
        let td = TimingData {
            bpms: vec![BpmSegment {
                beat: 0.0,
                bpm: 120.0,
            }],
            offset: 0.0,
            ..Default::default()
        };
        let sec = td.beat_to_second(4.0);
        assert!(
            (sec - 2.0).abs() < 0.001,
            "4 beats at 120 BPM = 2 seconds, got {}",
            sec
        );
    }

    #[test]
    fn test_bpm_change() {
        let td = TimingData {
            bpms: vec![
                BpmSegment {
                    beat: 0.0,
                    bpm: 120.0,
                },
                BpmSegment {
                    beat: 4.0,
                    bpm: 240.0,
                },
            ],
            offset: 0.0,
            ..Default::default()
        };
        // First 4 beats at 120 BPM = 2 seconds
        // Next 4 beats at 240 BPM = 1 second
        let sec = td.beat_to_second(8.0);
        assert!((sec - 3.0).abs() < 0.001, "Expected 3.0, got {}", sec);
    }

    #[test]
    fn test_stop() {
        let td = TimingData {
            bpms: vec![BpmSegment {
                beat: 0.0,
                bpm: 120.0,
            }],
            stops: vec![StopSegment {
                beat: 2.0,
                duration: 0.5,
            }],
            offset: 0.0,
            ..Default::default()
        };
        let sec = td.beat_to_second(4.0);
        // 4 beats at 120 BPM = 2 seconds + 0.5 stop
        assert!((sec - 2.5).abs() < 0.001, "Expected 2.5, got {}", sec);
    }

    #[test]
    fn test_second_to_beat_constant() {
        let td = TimingData {
            bpms: vec![BpmSegment {
                beat: 0.0,
                bpm: 120.0,
            }],
            offset: 0.0,
            ..Default::default()
        };
        let beat = td.second_to_beat(2.0);
        assert!(
            (beat - 4.0).abs() < 0.001,
            "2 seconds at 120 BPM = 4 beats, got {}",
            beat
        );
    }

    #[test]
    fn test_warp_detection() {
        let td = TimingData {
            warps: vec![WarpSegment {
                beat: 4.0,
                skip_beats: 2.0,
            }],
            ..Default::default()
        };
        assert!(!td.is_warp_at_beat(3.9));
        assert!(td.is_warp_at_beat(4.0));
        assert!(td.is_warp_at_beat(5.0));
        assert!(!td.is_warp_at_beat(6.0));
    }
}
