use serde::{Deserialize, Serialize};

/// Groove Radar values (0.0 - 1.0+), calculated from chart data.
/// StepMania style: Stream, Voltage, Air, Freeze, Chaos
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GrooveRadar {
    pub stream: f64,
    pub voltage: f64,
    pub air: f64,
    pub freeze: f64,
    pub chaos: f64,
}

impl GrooveRadar {
    pub fn calculate(
        total_taps: u32,
        total_holds: u32,
        total_jumps: u32,
        max_nps: f64,
        song_length_secs: f64,
        measure_density_variance: f64,
    ) -> Self {
        let song_len = song_length_secs.max(1.0);

        // Stream: density of notes across the song (notes per second, normalized)
        let stream = (total_taps as f64 / song_len / 8.0).min(1.0);

        // Voltage: peak NPS relative to expected max
        let voltage = (max_nps / 16.0).min(1.0);

        // Air: proportion of jumps relative to total notes
        let total = total_taps.max(1) as f64;
        let air = (total_jumps as f64 / total * 4.0).min(1.0);

        // Freeze: proportion of holds relative to total notes
        let freeze = (total_holds as f64 / total * 6.0).min(1.0);

        // Chaos: variance-based measure of irregular note distribution
        let chaos = (measure_density_variance / 4.0).min(1.0);

        Self {
            stream,
            voltage,
            air,
            freeze,
            chaos,
        }
    }

    pub fn values(&self) -> [f64; 5] {
        [self.stream, self.voltage, self.air, self.freeze, self.chaos]
    }

    pub fn labels() -> [&'static str; 5] {
        ["Stream", "Voltage", "Air", "Freeze", "Chaos"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_groove_radar_basic() {
        let radar = GrooveRadar::calculate(400, 20, 40, 12.0, 120.0, 1.5);
        assert!(radar.stream > 0.0 && radar.stream <= 1.0);
        assert!(radar.voltage > 0.0 && radar.voltage <= 1.0);
        assert!(radar.air > 0.0 && radar.air <= 1.0);
        assert!(radar.freeze > 0.0 && radar.freeze <= 1.0);
        assert!(radar.chaos > 0.0 && radar.chaos <= 1.0);
    }

    #[test]
    fn test_groove_radar_empty() {
        let radar = GrooveRadar::calculate(0, 0, 0, 0.0, 60.0, 0.0);
        assert_eq!(radar.stream, 0.0);
        assert_eq!(radar.voltage, 0.0);
        assert_eq!(radar.chaos, 0.0);
    }
}
