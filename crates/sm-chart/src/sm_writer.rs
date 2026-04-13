use crate::{Chart, DisplayBpm, SongFile};
use sm_core::note::{NoteData, TapNoteSubType, TapNoteType};
use sm_core::ROWS_PER_BEAT;
use sm_timing::*;

pub fn write_sm(song: &SongFile) -> String {
    let mut out = String::new();

    write_tag(&mut out, "TITLE", &song.title);
    write_tag(&mut out, "SUBTITLE", &song.subtitle);
    write_tag(&mut out, "ARTIST", &song.artist);
    if !song.title_translit.is_empty() {
        write_tag(&mut out, "TITLETRANSLIT", &song.title_translit);
    }
    if !song.artist_translit.is_empty() {
        write_tag(&mut out, "ARTISTTRANSLIT", &song.artist_translit);
    }
    if !song.genre.is_empty() {
        write_tag(&mut out, "GENRE", &song.genre);
    }
    if !song.credit.is_empty() {
        write_tag(&mut out, "CREDIT", &song.credit);
    }
    if !song.music.is_empty() {
        write_tag(&mut out, "MUSIC", &song.music);
    }
    if !song.banner.is_empty() {
        write_tag(&mut out, "BANNER", &song.banner);
    }
    if !song.background.is_empty() {
        write_tag(&mut out, "BACKGROUND", &song.background);
    }
    if !song.cd_title.is_empty() {
        write_tag(&mut out, "CDTITLE", &song.cd_title);
    }
    if song.sample_start >= 0.0 {
        write_tag(&mut out, "SAMPLESTART", &format!("{:.3}", song.sample_start));
    }
    write_tag(&mut out, "SAMPLELENGTH", &format!("{:.3}", song.sample_length));
    write_tag(&mut out, "OFFSET", &format!("{:.3}", song.offset));

    match &song.display_bpm {
        DisplayBpm::Specified(v) => write_tag(&mut out, "DISPLAYBPM", &format!("{:.3}", v)),
        DisplayBpm::Range(lo, hi) => {
            write_tag(&mut out, "DISPLAYBPM", &format!("{:.3}:{:.3}", lo, hi))
        }
        DisplayBpm::Random => write_tag(&mut out, "DISPLAYBPM", "*"),
        DisplayBpm::Actual => {}
    }

    if !song.selectable {
        write_tag(&mut out, "SELECTABLE", "NO");
    }

    write_tag(&mut out, "BPMS", &format_bpms(&song.timing.bpms));
    if !song.timing.stops.is_empty() {
        write_tag(&mut out, "STOPS", &format_stops(&song.timing.stops));
    }

    for bg in &song.bg_changes {
        write_tag(&mut out, "BGCHANGES", bg);
    }
    for fg in &song.fg_changes {
        write_tag(&mut out, "FGCHANGES", fg);
    }

    for chart in &song.charts {
        out.push_str(&write_sm_chart(chart));
    }

    out
}

fn write_sm_chart(chart: &Chart) -> String {
    let mut out = String::from("\n//---------------");
    out.push_str(&format!(" {} - ", chart.steps_type));
    out.push_str(&format!("{} ---------------", chart.description));
    out.push_str("\n#NOTES:\n");
    out.push_str(&format!("     {}:\n", chart.steps_type));
    out.push_str(&format!("     {}:\n", chart.description));
    out.push_str(&format!("     {}:\n", chart.difficulty));
    out.push_str(&format!("     {}:\n", chart.meter));
    let rv_str = chart
        .radar_values
        .iter()
        .map(|v| format!("{:.6}", v))
        .collect::<Vec<_>>()
        .join(",");
    out.push_str(&format!("     {}:\n", if rv_str.is_empty() { "0,0,0,0,0".to_string() } else { rv_str }));
    out.push_str(&write_note_data(&chart.note_data));
    out.push_str(";\n");
    out
}

pub fn write_ssc(song: &SongFile) -> String {
    let mut out = String::new();

    write_tag(&mut out, "VERSION", "0.83");
    write_tag(&mut out, "TITLE", &song.title);
    write_tag(&mut out, "SUBTITLE", &song.subtitle);
    write_tag(&mut out, "ARTIST", &song.artist);
    if !song.title_translit.is_empty() {
        write_tag(&mut out, "TITLETRANSLIT", &song.title_translit);
    }
    if !song.artist_translit.is_empty() {
        write_tag(&mut out, "ARTISTTRANSLIT", &song.artist_translit);
    }
    if !song.genre.is_empty() {
        write_tag(&mut out, "GENRE", &song.genre);
    }
    if !song.credit.is_empty() {
        write_tag(&mut out, "CREDIT", &song.credit);
    }
    if !song.music.is_empty() {
        write_tag(&mut out, "MUSIC", &song.music);
    }
    if !song.banner.is_empty() {
        write_tag(&mut out, "BANNER", &song.banner);
    }
    if !song.background.is_empty() {
        write_tag(&mut out, "BACKGROUND", &song.background);
    }
    if !song.jacket.is_empty() {
        write_tag(&mut out, "JACKET", &song.jacket);
    }
    if !song.cd_title.is_empty() {
        write_tag(&mut out, "CDTITLE", &song.cd_title);
    }
    if song.sample_start >= 0.0 {
        write_tag(&mut out, "SAMPLESTART", &format!("{:.3}", song.sample_start));
    }
    write_tag(&mut out, "SAMPLELENGTH", &format!("{:.3}", song.sample_length));
    write_tag(&mut out, "OFFSET", &format!("{:.3}", song.offset));

    match &song.display_bpm {
        DisplayBpm::Specified(v) => write_tag(&mut out, "DISPLAYBPM", &format!("{:.3}", v)),
        DisplayBpm::Range(lo, hi) => {
            write_tag(&mut out, "DISPLAYBPM", &format!("{:.3}:{:.3}", lo, hi))
        }
        DisplayBpm::Random => write_tag(&mut out, "DISPLAYBPM", "*"),
        DisplayBpm::Actual => {}
    }

    if !song.selectable {
        write_tag(&mut out, "SELECTABLE", "NO");
    }

    write_tag(&mut out, "BPMS", &format_bpms(&song.timing.bpms));
    if !song.timing.stops.is_empty() {
        write_tag(&mut out, "STOPS", &format_stops(&song.timing.stops));
    }
    if !song.timing.delays.is_empty() {
        write_tag(&mut out, "DELAYS", &format_delays(&song.timing.delays));
    }
    if !song.timing.warps.is_empty() {
        write_tag(&mut out, "WARPS", &format_warps(&song.timing.warps));
    }

    for chart in &song.charts {
        out.push_str(&write_ssc_chart(chart));
    }

    out
}

fn write_ssc_chart(chart: &Chart) -> String {
    let mut out = String::from("\n#NOTEDATA:;\n");
    write_tag(&mut out, "STEPSTYPE", &chart.steps_type.to_string());
    if !chart.chart_name.is_empty() {
        write_tag(&mut out, "CHARTNAME", &chart.chart_name);
    }
    write_tag(&mut out, "DESCRIPTION", &chart.description);
    write_tag(&mut out, "DIFFICULTY", &chart.difficulty.to_string());
    write_tag(&mut out, "METER", &chart.meter.to_string());
    if !chart.radar_values.is_empty() {
        let rv = chart
            .radar_values
            .iter()
            .map(|v| format!("{:.6}", v))
            .collect::<Vec<_>>()
            .join(",");
        write_tag(&mut out, "RADARVALUES", &rv);
    }
    if !chart.credit.is_empty() {
        write_tag(&mut out, "CREDIT", &chart.credit);
    }

    if let Some(ct) = &chart.chart_timing {
        write_tag(&mut out, "BPMS", &format_bpms(&ct.bpms));
        if !ct.stops.is_empty() {
            write_tag(&mut out, "STOPS", &format_stops(&ct.stops));
        }
    }

    out.push_str("#NOTES:\n");
    out.push_str(&write_note_data(&chart.note_data));
    out.push_str(";\n");
    out
}

fn write_tag(out: &mut String, tag: &str, value: &str) {
    out.push_str(&format!("#{}:{};\n", tag, value));
}

fn format_bpms(bpms: &[BpmSegment]) -> String {
    bpms.iter()
        .map(|b| format!("{:.3}={:.3}", b.beat, b.bpm))
        .collect::<Vec<_>>()
        .join(",\n")
}

fn format_stops(stops: &[StopSegment]) -> String {
    stops
        .iter()
        .map(|s| format!("{:.3}={:.3}", s.beat, s.duration))
        .collect::<Vec<_>>()
        .join(",\n")
}

fn format_delays(delays: &[DelaySegment]) -> String {
    delays
        .iter()
        .map(|d| format!("{:.3}={:.3}", d.beat, d.duration))
        .collect::<Vec<_>>()
        .join(",\n")
}

fn format_warps(warps: &[WarpSegment]) -> String {
    warps
        .iter()
        .map(|w| format!("{:.3}={:.3}", w.beat, w.skip_beats))
        .collect::<Vec<_>>()
        .join(",\n")
}

pub fn write_note_data(nd: &NoteData) -> String {
    let last_row = nd.last_row();
    if last_row < 0 {
        return "0000\n0000\n0000\n0000\n".to_string();
    }

    let rows_per_measure = ROWS_PER_BEAT * 4;
    let total_measures = (last_row / rows_per_measure) + 1;
    let mut out = String::new();

    for measure in 0..total_measures {
        if measure > 0 {
            out.push_str(",\n");
        }

        let measure_start = measure * rows_per_measure;
        let subdivision = find_measure_subdivision(nd, measure_start, rows_per_measure);
        let lines_in_measure = subdivision;
        let rows_per_line = rows_per_measure / lines_in_measure;

        for line in 0..lines_in_measure {
            let row = measure_start + line * rows_per_line;
            for track in 0..nd.num_tracks {
                let ch = if let Some(note) = nd.get_note(track, row) {
                    match note.note_type {
                        TapNoteType::Tap => '1',
                        TapNoteType::HoldHead => {
                            match note.sub_type {
                                Some(TapNoteSubType::Roll) => '4',
                                _ => '2',
                            }
                        }
                        TapNoteType::Mine => 'M',
                        TapNoteType::Lift => 'L',
                        TapNoteType::Fake => 'F',
                        TapNoteType::AutoKeysound => 'K',
                        _ => '0',
                    }
                } else {
                    // Check if this row is a hold tail
                    if is_hold_tail(nd, track, row) {
                        '3'
                    } else {
                        '0'
                    }
                };
                out.push(ch);
            }
            out.push('\n');
        }
    }

    out
}

fn is_hold_tail(nd: &NoteData, track: usize, row: i32) -> bool {
    if let Some(track_data) = nd.tracks.get(track) {
        if let Some((head_row, note)) = track_data.range(..row).rev().next() {
            if note.note_type == TapNoteType::HoldHead {
                if let Some(dur) = note.hold_duration {
                    return head_row + dur == row;
                }
            }
        }
    }
    false
}

fn find_measure_subdivision(nd: &NoteData, measure_start: i32, rows_per_measure: i32) -> i32 {
    let subdivisions = [4, 8, 12, 16, 24, 32, 48, 64, 192];

    // Collect all rows that need representation in this measure (notes + hold tails)
    let mut needed_rows = Vec::new();
    for track_data in &nd.tracks {
        for (&row, note) in track_data.range(measure_start..measure_start + rows_per_measure) {
            needed_rows.push(row);
            if note.note_type == TapNoteType::HoldHead {
                if let Some(dur) = note.hold_duration {
                    let tail = row + dur;
                    if tail >= measure_start && tail < measure_start + rows_per_measure {
                        needed_rows.push(tail);
                    }
                }
            }
        }
        // Check for hold tails from notes that started before this measure
        for (&row, note) in track_data.range(..measure_start) {
            if note.note_type == TapNoteType::HoldHead {
                if let Some(dur) = note.hold_duration {
                    let tail = row + dur;
                    if tail >= measure_start && tail < measure_start + rows_per_measure {
                        needed_rows.push(tail);
                    }
                }
            }
        }
    }

    for &sub in &subdivisions {
        let rows_per_line = rows_per_measure / sub;
        if rows_per_line <= 0 {
            continue;
        }
        let all_aligned = needed_rows.iter().all(|&r| {
            let local = r - measure_start;
            local % rows_per_line == 0
        });
        if all_aligned {
            return sub;
        }
    }

    192
}

#[cfg(test)]
mod tests {
    use super::*;
    use sm_core::note::{NoteData, TapNote};

    #[test]
    fn test_write_simple_sm() {
        let mut nd = NoteData::new(4);
        nd.set_note(0, 0, TapNote::tap());
        nd.set_note(1, 48, TapNote::tap());
        nd.set_note(2, 96, TapNote::tap());
        nd.set_note(3, 144, TapNote::tap());

        let song = SongFile {
            title: "Test".to_string(),
            artist: "Author".to_string(),
            music: "test.ogg".to_string(),
            timing: TimingData {
                bpms: vec![BpmSegment { beat: 0.0, bpm: 120.0 }],
                ..Default::default()
            },
            charts: vec![Chart {
                steps_type: sm_core::StepsType::DanceSingle,
                description: "test".to_string(),
                chart_name: String::new(),
                difficulty: sm_core::Difficulty::Medium,
                meter: 5,
                radar_values: vec![0.5, 0.5, 0.5, 0.5, 0.5],
                credit: String::new(),
                note_data: nd,
                chart_timing: None,
            }],
            ..Default::default()
        };

        let result = write_sm(&song);
        assert!(result.contains("#TITLE:Test;"));
        assert!(result.contains("#ARTIST:Author;"));
        assert!(result.contains("#NOTES:"));
        assert!(result.contains("1000"));
    }

    #[test]
    fn test_roundtrip() {
        let content = r#"#TITLE:Roundtrip;
#ARTIST:Test;
#MUSIC:test.ogg;
#BPMS:0.000=120.000;
#OFFSET:0.000;
#NOTES:
     dance-single:
     test:
     Medium:
     5:
     0,0,0,0,0:
1000
0100
0010
0001
;
"#;
        let song = crate::sm_parser::parse(content).unwrap();
        let output = write_sm(&song);
        let reparsed = crate::sm_parser::parse(&output).unwrap();
        assert_eq!(reparsed.title, "Roundtrip");
        assert_eq!(reparsed.charts.len(), 1);
        assert_eq!(reparsed.charts[0].note_data.total_tap_notes(), 4);
    }
}
