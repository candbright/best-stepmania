//! Build a one-chart [`SongFile`] suitable for `.sm` export from a multi-chart SSC/SM source.

use crate::{Chart, SongFile};

/// Clone `song` metadata and emit a [`SongFile`] with a single chart, using that chart's
/// per-chart timing when present, otherwise the song-level timing. The emitted chart has
/// `chart_timing: None` (SM stores timing only in the global header).
pub fn build_single_chart_sm_song(song: &SongFile, chart_index: usize) -> Result<SongFile, String> {
    let chart = song.charts.get(chart_index).ok_or_else(|| {
        format!(
            "Chart index {} out of range (total charts: {})",
            chart_index,
            song.charts.len()
        )
    })?;

    let mut out = song.clone();
    let mut timing = chart
        .chart_timing
        .clone()
        .unwrap_or_else(|| song.timing.clone());
    timing.offset = song.offset;
    out.timing = timing;

    let mut export_chart: Chart = chart.clone();
    export_chart.chart_timing = None;
    out.charts = vec![export_chart];

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sm_core::note::{NoteData, TapNote};
    use sm_core::{Difficulty, StepsType};
    use sm_timing::{BpmSegment, TimingData};

    #[test]
    fn build_single_uses_song_timing_when_chart_timing_none() {
        let mut nd = NoteData::new(4);
        nd.set_note(0, 0, TapNote::tap());

        let song = SongFile {
            title: "T".into(),
            offset: 1.25,
            timing: TimingData {
                bpms: vec![BpmSegment { beat: 0.0, bpm: 100.0 }],
                ..Default::default()
            },
            charts: vec![Chart {
                steps_type: StepsType::DanceSingle,
                description: "d".into(),
                chart_name: String::new(),
                difficulty: Difficulty::Hard,
                meter: 9,
                radar_values: vec![],
                credit: String::new(),
                note_data: nd,
                chart_timing: None,
                sm_notes_primary_tag: None,
                sm_misplaced_notes_header: false,
                sm_banner_right: None,
            }],
            ..Default::default()
        };

        let out = build_single_chart_sm_song(&song, 0).unwrap();
        assert_eq!(out.charts.len(), 1);
        assert!(out.charts[0].chart_timing.is_none());
        assert_eq!(out.timing.bpms.len(), 1);
        assert_eq!(out.timing.bpms[0].bpm, 100.0);
        assert_eq!(out.timing.offset, 1.25);
        assert_eq!(out.charts[0].note_data.total_tap_notes(), 1);
    }

    #[test]
    fn build_single_prefers_chart_timing_and_sets_offset_from_song() {
        let mut nd = NoteData::new(4);
        nd.set_note(0, 0, TapNote::tap());

        let song = SongFile {
            title: "T".into(),
            offset: 0.5,
            timing: TimingData {
                bpms: vec![BpmSegment { beat: 0.0, bpm: 60.0 }],
                ..Default::default()
            },
            charts: vec![Chart {
                steps_type: StepsType::DanceSingle,
                description: "d".into(),
                chart_name: String::new(),
                difficulty: Difficulty::Easy,
                meter: 3,
                radar_values: vec![],
                credit: String::new(),
                note_data: nd,
                chart_timing: Some(TimingData {
                    bpms: vec![BpmSegment { beat: 0.0, bpm: 180.0 }],
                    ..Default::default()
                }),
                sm_notes_primary_tag: None,
                sm_misplaced_notes_header: false,
                sm_banner_right: None,
            }],
            ..Default::default()
        };

        let out = build_single_chart_sm_song(&song, 0).unwrap();
        assert_eq!(out.timing.bpms[0].bpm, 180.0);
        assert_eq!(out.timing.offset, 0.5);
    }

    #[test]
    fn build_single_index_out_of_range() {
        let song = SongFile::default();
        assert!(build_single_chart_sm_song(&song, 0).is_err());
    }

    #[test]
    fn build_single_picks_second_chart_from_multi() {
        let mut nd0 = NoteData::new(4);
        nd0.set_note(0, 0, TapNote::tap());
        let mut nd1 = NoteData::new(4);
        nd1.set_note(3, 96, TapNote::tap());

        let song = SongFile {
            title: "Multi".into(),
            offset: 0.25,
            timing: TimingData {
                bpms: vec![BpmSegment { beat: 0.0, bpm: 100.0 }],
                ..Default::default()
            },
            charts: vec![
                Chart {
                    steps_type: StepsType::DanceSingle,
                    description: "a".into(),
                    chart_name: String::new(),
                    difficulty: Difficulty::Beginner,
                    meter: 1,
                    radar_values: vec![],
                    credit: String::new(),
                    note_data: nd0,
                    chart_timing: None,
                    sm_notes_primary_tag: None,
                    sm_misplaced_notes_header: false,
                    sm_banner_right: None,
                },
                Chart {
                    steps_type: StepsType::DanceSingle,
                    description: "b".into(),
                    chart_name: String::new(),
                    difficulty: Difficulty::Hard,
                    meter: 10,
                    radar_values: vec![],
                    credit: String::new(),
                    note_data: nd1,
                    chart_timing: Some(TimingData {
                        bpms: vec![BpmSegment { beat: 0.0, bpm: 200.0 }],
                        ..Default::default()
                    }),
                    sm_notes_primary_tag: None,
                    sm_misplaced_notes_header: false,
                    sm_banner_right: None,
                },
            ],
            ..Default::default()
        };

        let out = build_single_chart_sm_song(&song, 1).unwrap();
        assert_eq!(out.charts.len(), 1);
        assert_eq!(out.charts[0].meter, 10);
        assert_eq!(out.timing.bpms[0].bpm, 200.0);
        assert_eq!(out.charts[0].note_data.total_tap_notes(), 1);
        let sm = crate::sm_writer::write_sm(&out);
        let again = crate::sm_parser::parse(&sm).unwrap();
        assert_eq!(again.charts.len(), 1);
        assert_eq!(again.charts[0].note_data.total_tap_notes(), 1);
    }
}
