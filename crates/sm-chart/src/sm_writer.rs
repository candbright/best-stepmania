use crate::{Chart, DisplayBpm, SongFile};
use sm_core::note::{NoteData, TapNote, TapNoteSubType, TapNoteType};
use sm_core::{StepsType, StepsTypeCategory, ROWS_PER_BEAT};
use sm_timing::*;

pub fn write_sm(song: &SongFile) -> String {
    let mut out = String::new();

    write_tag(&mut out, "TITLE", &song.title);
    write_tag(&mut out, "SUBTITLE", &song.subtitle);
    write_tag(&mut out, "ARTIST", &song.artist);
    write_tag(&mut out, "TITLETRANSLIT", &song.title_translit);
    write_tag(&mut out, "SUBTITLETRANSLIT", &song.subtitle_translit);
    write_tag(&mut out, "ARTISTTRANSLIT", &song.artist_translit);
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
    if !song.cd_title.is_empty() {
        write_tag(&mut out, "CDTITLE", &song.cd_title);
    }
    write_tag(&mut out, "OFFSET", &format!("{:.6}", song.offset));
    if song.sample_start >= 0.0 {
        write_tag(&mut out, "SAMPLESTART", &format!("{:.6}", song.sample_start));
    }
    write_tag(&mut out, "SAMPLELENGTH", &format!("{:.6}", song.sample_length));

    match &song.display_bpm {
        DisplayBpm::Specified(v) => write_tag(&mut out, "DISPLAYBPM", &format!("{:.6}", v)),
        DisplayBpm::Range(lo, hi) => {
            write_tag(&mut out, "DISPLAYBPM", &format!("{:.6}:{:.6}", lo, hi))
        }
        DisplayBpm::Random => write_tag(&mut out, "DISPLAYBPM", "*"),
        DisplayBpm::Actual => {}
    }

    if !song.selectable {
        write_tag(&mut out, "SELECTABLE", "NO");
    }

    write_bpms_tag_multiline_sm(&mut out, &song.timing.bpms);
    if !song.timing.stops.is_empty() {
        write_tag(&mut out, "STOPS", &format_stops(&song.timing.stops));
    }

    for bg in &song.bg_changes {
        write_tag(&mut out, "BGCHANGES", bg);
    }
    for fg in &song.fg_changes {
        write_tag(&mut out, "FGCHANGES", fg);
    }

    for (i, chart) in song.charts.iter().enumerate() {
        if i > 0 {
            out.push_str("\n\n");
        }
        out.push_str(&write_sm_chart(chart));
    }

    out
}

/// Community `.sm` first `#NOTES` field: SSC/StepMania types map to `hard` / `double`.
/// `pump-routine` / `dance-routine` use two `#NOTES` blocks (`lover1` then `lover2`), not this tag.
fn sm_community_export_primary_tag(st: StepsType) -> &'static str {
    match st.category() {
        StepsTypeCategory::Single => "hard",
        StepsTypeCategory::Double | StepsTypeCategory::Couple => "double",
        StepsTypeCategory::Routine => "hard",
    }
}

fn sm_community_export_level_line(chart: &Chart) -> String {
    format!("level{}", chart.meter)
}

/// Right side of `//---------------hard - …----------------` (community `.sm` only).
/// Use parsed banner from the source `.sm` when present; never use SSC `DESCRIPTION` (e.g. "12 stars").
fn sm_chart_banner_right(chart: &Chart) -> String {
    chart
        .sm_banner_right
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Description".to_string())
}

/// One community `#NOTES` section: banner + 5 header lines + note body.
fn write_sm_notes_section(chart: &Chart, line1: &str, notes_body: &str) -> String {
    let banner_right = sm_chart_banner_right(chart);
    let level_line = sm_community_export_level_line(chart);
    let mut out = String::from("//---------------");
    out.push_str(line1);
    out.push_str(" - ");
    out.push_str(&banner_right);
    out.push_str("----------------\n\n#NOTES:\n\n");
    out.push_str(&format!("     {}:\n\n", line1));
    out.push_str(&format!("     {}:\n\n", level_line));
    out.push_str(&format!("     {}:\n\n", level_line));
    out.push_str(&format!("     {}:\n\n", chart.meter));
    out.push_str(notes_body);
    out.push_str(";\n");
    out
}

/// Lover / routine: two consecutive `#NOTES` blocks (`lover1` then `lover2`) for community `.sm`.
fn write_sm_routine_lover_pair(chart: &Chart) -> String {
    let l1 = write_note_data_sm_routine_layer(&chart.note_data, chart.steps_type, RoutineWriteLayer::Layer1);
    let l2 = write_note_data_sm_routine_layer(&chart.note_data, chart.steps_type, RoutineWriteLayer::Layer2);
    let a = write_sm_notes_section(chart, "lover1", &l1);
    let b = write_sm_notes_section(chart, "lover2", &l2);
    format!("{}\n\n{}", a, b)
}

fn write_sm_chart(chart: &Chart) -> String {
    if matches!(
        chart.steps_type.category(),
        StepsTypeCategory::Routine
    ) {
        return write_sm_routine_lover_pair(chart);
    }

    let line1 = sm_community_export_primary_tag(chart.steps_type).to_string();
    let body = write_note_data_sm(&chart.note_data, chart.steps_type);
    write_sm_notes_section(&chart, &line1, &body)
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
    out.push_str(&if matches!(chart.steps_type.category(), StepsTypeCategory::Routine) {
        write_note_data_routine(&chart.note_data)
    } else {
        write_note_data(&chart.note_data)
    });
    out.push_str(";\n");
    out
}

fn write_tag(out: &mut String, tag: &str, value: &str) {
    out.push_str(&format!("#{}:{};\n", tag, value));
}

fn format_bpms(bpms: &[BpmSegment]) -> String {
    if bpms.is_empty() {
        return "0.000000=120.000000".to_string();
    }
    let mut s = String::new();
    for (i, b) in bpms.iter().enumerate() {
        let pair = format!("{:.6}={:.6}", b.beat, b.bpm);
        if i == 0 {
            s.push_str(&pair);
        } else {
            s.push('\n');
            s.push(',');
            s.push_str(&pair);
        }
    }
    s
}

/// StepMania community `.sm`: `#BPMS:` first pair on same line, further pairs on lines starting with
/// `,`, then `;` alone on the next line, then two blank lines before the chart banner.
fn write_bpms_tag_multiline_sm(out: &mut String, bpms: &[BpmSegment]) {
    if bpms.is_empty() {
        out.push_str("#BPMS:0.000000=120.000000");
    } else {
        out.push_str("#BPMS:");
        for (i, b) in bpms.iter().enumerate() {
            let pair = format!("{:.6}={:.6}", b.beat, b.bpm);
            if i == 0 {
                out.push_str(&pair);
            } else {
                out.push('\n');
                out.push(',');
                out.push_str(&pair);
            }
        }
    }
    out.push_str("\n;\n\n\n");
}

fn format_stops(stops: &[StopSegment]) -> String {
    stops
        .iter()
        .map(|s| format!("{:.6}={:.6}", s.beat, s.duration))
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
    write_note_data_impl(nd, false, false, None)
}

/// SSC / SM routine: layer 1 measures, `&`, then layer 2 (same row map).
pub fn write_note_data_routine(nd: &NoteData) -> String {
    let l1 = write_note_data_impl(nd, false, false, Some(RoutineWriteLayer::Layer1));
    let l2 = write_note_data_impl(nd, false, false, Some(RoutineWriteLayer::Layer2));
    format!("{}&\n{}", l1.trim_end(), l2.trim_end())
}

/// `.sm` export: inserts `  // measureN` before each measure (community file style).
/// Routine charts should use [`write_sm`] / [`write_sm_chart`], which emit `lover1` + `lover2` blocks.
pub fn write_note_data_sm(nd: &NoteData, steps_type: StepsType) -> String {
    if matches!(steps_type.category(), StepsTypeCategory::Routine) {
        return write_note_data_sm_routine_layer(nd, steps_type, RoutineWriteLayer::Layer1);
    }
    let pump_sm = sm_steps_use_pump_community_sm_layout(steps_type);
    write_note_data_impl(nd, true, pump_sm, None)
}

#[derive(Clone, Copy)]
enum RoutineWriteLayer {
    Layer1,
    Layer2,
}

fn sm_steps_use_pump_community_sm_layout(st: StepsType) -> bool {
    matches!(
        st,
        StepsType::PumpSingle
            | StepsType::PumpHalfdouble
            | StepsType::PumpDouble
            | StepsType::PumpCouple
    )
}

fn note_matches_write_layer(note: &TapNote, layer_filter: Option<RoutineWriteLayer>) -> bool {
    match layer_filter {
        None => true,
        Some(RoutineWriteLayer::Layer1) => {
            note.routine_layer.is_none() || note.routine_layer == Some(1)
        }
        Some(RoutineWriteLayer::Layer2) => note.routine_layer == Some(2),
    }
}

fn write_note_data_impl(
    nd: &NoteData,
    measure_comments: bool,
    pump_community_sm: bool,
    routine_layer: Option<RoutineWriteLayer>,
) -> String {
    // Measure span uses all layers so pump/dance routine `&` blocks stay row-aligned.
    let last_row = last_row_filtered(nd, None);
    if last_row < 0 {
        let w = if pump_community_sm {
            if nd.num_tracks >= 10 {
                20
            } else {
                10
            }
        } else {
            nd.num_tracks.max(4)
        };
        let line = "0".repeat(w);
        if measure_comments {
            return format!("  // measure1\n\n{line}\n\n{line}\n\n{line}\n\n{line}\n\n");
        }
        return format!("{line}\n{line}\n{line}\n{line}\n");
    }

    let rows_per_measure = ROWS_PER_BEAT * 4;
    let total_measures = (last_row / rows_per_measure) + 1;
    let mut out = String::new();

    for measure in 0..total_measures {
        if measure > 0 {
            if measure_comments {
                out.push_str(&format!(",  // measure{}\n\n", measure + 1));
            } else {
                out.push_str(",\n");
            }
        } else if measure_comments {
            out.push_str(&format!("  // measure{}\n\n", measure + 1));
        }

        let measure_start = measure * rows_per_measure;
        let subdivision = find_measure_subdivision(nd, measure_start, rows_per_measure, None);
        let lines_in_measure = subdivision;
        let rows_per_line = rows_per_measure / lines_in_measure;

        for line in 0..lines_in_measure {
            let row = measure_start + line * rows_per_line;
            if pump_community_sm {
                let w = if nd.num_tracks >= 10 { 20 } else { 10 };
                let mut buf = vec!['0'; w];
                for track in 0..nd.num_tracks {
                    let col = if nd.num_tracks >= 10 {
                        crate::pump_sm_layout::lane_to_sm_col0_double(track).unwrap()
                    } else {
                        crate::pump_sm_layout::lane_to_sm_col0_single(track).unwrap()
                    };
                    let ch = if let Some(note) = nd.get_note(track, row) {
                        if !note_matches_write_layer(note, routine_layer) {
                            if is_hold_tail(nd, track, row, routine_layer) {
                                '3'
                            } else {
                                '0'
                            }
                        } else {
                            tap_glyph_char(note)
                        }
                    } else if is_hold_tail(nd, track, row, routine_layer) {
                        '3'
                    } else {
                        '0'
                    };
                    if ch != '0' {
                        buf[col] = ch;
                    }
                }
                for c in buf {
                    out.push(c);
                }
            } else {
                for track in 0..nd.num_tracks {
                    let ch = if let Some(note) = nd.get_note(track, row) {
                        if !note_matches_write_layer(note, routine_layer) {
                            if is_hold_tail(nd, track, row, routine_layer) {
                                '3'
                            } else {
                                '0'
                            }
                        } else {
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
                        }
                    } else if is_hold_tail(nd, track, row, routine_layer) {
                        '3'
                    } else {
                        '0'
                    };
                    out.push(ch);
                }
            }
            if measure_comments {
                out.push_str("\n\n");
            } else {
                out.push('\n');
            }
        }
    }

    out
}

/// SM note body for one routine layer (no `&`; twin `#NOTES` use two calls).
fn write_note_data_sm_routine_layer(
    nd: &NoteData,
    steps_type: StepsType,
    layer: RoutineWriteLayer,
) -> String {
    let pump_sm = sm_steps_use_pump_community_sm_layout(steps_type);
    write_note_data_impl(nd, true, pump_sm, Some(layer))
}

fn tap_glyph_char(note: &TapNote) -> char {
    match note.note_type {
        TapNoteType::Tap => '1',
        TapNoteType::HoldHead => match note.sub_type {
            Some(TapNoteSubType::Roll) => '4',
            _ => '2',
        },
        TapNoteType::Mine => 'M',
        TapNoteType::Lift => 'L',
        TapNoteType::Fake => 'F',
        TapNoteType::AutoKeysound => 'K',
        _ => '0',
    }
}

fn is_hold_tail(nd: &NoteData, track: usize, row: i32, layer_filter: Option<RoutineWriteLayer>) -> bool {
    if let Some(track_data) = nd.tracks.get(track) {
        for (head_row, note) in track_data.range(..row).rev() {
            if note.note_type == TapNoteType::HoldHead {
                if let Some(dur) = note.hold_duration {
                    if head_row + dur == row {
                        return note_matches_write_layer(note, layer_filter);
                    }
                }
            }
        }
    }
    false
}

fn find_measure_subdivision(
    nd: &NoteData,
    measure_start: i32,
    rows_per_measure: i32,
    layer_filter: Option<RoutineWriteLayer>,
) -> i32 {
    let subdivisions = [4, 8, 12, 16, 24, 32, 48, 64, 192];

    // Collect all rows that need representation in this measure (notes + hold tails)
    let mut needed_rows = Vec::new();
    for track_data in &nd.tracks {
        for (&row, note) in track_data.range(measure_start..measure_start + rows_per_measure) {
            if !note_matches_write_layer(note, layer_filter) {
                continue;
            }
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
            if !note_matches_write_layer(note, layer_filter) {
                continue;
            }
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

fn last_row_filtered(nd: &NoteData, layer_filter: Option<RoutineWriteLayer>) -> i32 {
    let mut max_row = -1;
    for track_data in &nd.tracks {
        for (&row, note) in track_data {
            if !note_matches_write_layer(note, layer_filter) {
                continue;
            }
            max_row = max_row.max(row);
            if note.note_type == TapNoteType::HoldHead {
                if let Some(dur) = note.hold_duration {
                    max_row = max_row.max(row + dur);
                }
            }
        }
    }
    max_row
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
                sm_notes_primary_tag: None,
                sm_misplaced_notes_header: false,
                sm_banner_right: None,
            }],
            ..Default::default()
        };

        let result = write_sm(&song);
        assert!(result.contains("#TITLE:Test;"));
        assert!(result.contains("#ARTIST:Author;"));
        assert!(!result.contains("#BACKGROUND"));
        assert!(result.contains("#NOTES:"));
        assert!(result.contains("     hard:\n\n"));
        assert!(result.contains("     level5:\n\n"));
        assert!(!result.contains("0.880800"));
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

    #[test]
    fn test_misplaced_sm_header_roundtrip() {
        let content = r#"#TITLE:T;
#BPMS:0.000000=120.000000;
//---------------hard - Description----------------
#NOTES:

     hard:

     level19:

     level19:

     18:

0000000000
0000000000
,
0000001000
;
"#;
        let song = crate::sm_parser::parse(content).unwrap();
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, sm_core::StepsType::PumpSingle);
        assert!(chart.sm_misplaced_notes_header);
        assert_eq!(chart.sm_notes_primary_tag.as_deref(), Some("hard"));
        assert_eq!(chart.sm_banner_right.as_deref(), Some("Description"));

        let out = write_sm(&song);
        assert!(out.contains("//---------------hard - Description----------------"));
        assert!(out.contains("#BPMS:0.000000=120.000000\n"));
        assert!(out.contains("\n;\n\n\n//---------------hard"));
        assert!(out.contains("     hard:\n\n"));
        assert!(out.contains("     level18:\n\n"));
        let level18_count = out.matches("     level18:\n\n").count();
        assert_eq!(level18_count, 2, "two level lines from meter");

        let again = crate::sm_parser::parse(&out).unwrap();
        let c2 = &again.charts[0];
        assert_eq!(c2.steps_type, sm_core::StepsType::PumpSingle);
        assert!(c2.sm_misplaced_notes_header);
        assert_eq!(c2.sm_notes_primary_tag.as_deref(), Some("hard"));
        assert_eq!(c2.description, "level18");
        assert_eq!(c2.chart_name, "level18");
        assert_eq!(c2.meter, 18);
        assert_eq!(c2.sm_banner_right.as_deref(), Some("Description"));
    }

    #[test]
    fn test_ssc_pump_routine_write_roundtrip_ampersand() {
        let content = r#"
#VERSION:0.83;
#TITLE:Routine SSC;
#ARTIST:Test;
#BPMS:0.000=120.000;
#OFFSET:0.000;

#NOTEDATA:;
#STEPSTYPE:pump-routine;
#DESCRIPTION:;
#CHARTNAME:;
#DIFFICULTY:Hard;
#METER:6;
#RADARVALUES:0.0,0.0;
#CREDIT:;
#NOTES:
  // measure1
0000000000
0000000000
0000000000
0000000000
-,  // measure2
0000000000
0000000000
0000000000
0000000000
-,  // measure3
0100000000
0000000000
0100100000
0000000000
0001000000
0010000000
0000100000
0010000000
&
  // measure1
0000000000
0000000000
0000000000
0000000000
-,  // measure2
0000000000
0000000000
0000000000
0000000000
-,  // measure3
0000000001
0000000000
0000001001
0000000000
0000010000
0000000100
0000001000
0000000100
;
"#;
        let song = crate::ssc_parser::parse(content).unwrap();
        let row_m3_0 = 2 * sm_core::ROWS_PER_BEAT * 4;
        let out = write_ssc(&song);
        assert!(
            out.contains("\n&\n") || out.contains("&\n"),
            "routine export should contain & between layers"
        );
        let again = crate::ssc_parser::parse(&out).unwrap();
        assert_eq!(again.charts.len(), 1);
        let c = &again.charts[0];
        assert_eq!(c.steps_type, StepsType::PumpRoutine);
        assert!(c.note_data.get_note(1, row_m3_0).is_some());
        assert!(c.note_data.get_note(9, row_m3_0).is_some());
    }

    #[test]
    fn test_sm_pump_routine_write_roundtrip_lover1_lover2() {
        let mut nd = NoteData::new(10);
        let mut n = TapNote::tap();
        n.routine_layer = Some(1);
        nd.set_note(0, 0, n);
        let mut n2 = TapNote::tap();
        n2.routine_layer = Some(2);
        nd.set_note(1, 0, n2);
        let song = SongFile {
            title: "T".to_string(),
            artist: "A".to_string(),
            music: "m.ogg".to_string(),
            timing: TimingData {
                bpms: vec![BpmSegment {
                    beat: 0.0,
                    bpm: 120.0,
                }],
                ..Default::default()
            },
            charts: vec![Chart {
                steps_type: StepsType::PumpRoutine,
                description: "d".to_string(),
                chart_name: String::new(),
                difficulty: sm_core::Difficulty::Hard,
                meter: 1,
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
        let sm = write_sm(&song);
        assert!(sm.contains("     lover1:\n\n"));
        assert!(sm.contains("     lover2:\n\n"));
        assert!(!sm.contains('&'), "community SM uses twin #NOTES, not &");
        let reparsed = crate::sm_parser::parse(&sm).unwrap();
        assert_eq!(reparsed.charts.len(), 1);
        let c = &reparsed.charts[0];
        assert_eq!(c.steps_type, StepsType::PumpRoutine);
        assert!(c.note_data.get_note(0, 0).is_some());
        assert!(c.note_data.get_note(1, 0).is_some());
    }
}
