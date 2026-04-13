use crate::tag_parser::*;
use crate::{Chart, ChartError, DisplayBpm, SongFile};
use sm_core::note::*;
use sm_core::{Difficulty, StepsType};

pub fn parse(content: &str) -> Result<SongFile, ChartError> {
    let mut song = SongFile::default();
    let mut remaining = content;

    // First pass: parse all header tags
    while let Some(pos) = remaining.find('#') {
        remaining = &remaining[pos..];

        // Check for #NOTES tag (special multi-line block)
        if remaining.starts_with("#NOTES") && !remaining.starts_with("#NOTEDATA") {
            let chart = parse_notes_block(remaining, &song)?;
            if let Some((c, advance)) = chart {
                song.charts.push(c);
                remaining = &remaining[advance..];
                continue;
            }
        }

        // Find the end of this tag
        if let Some(semi_pos) = remaining.find(';') {
            let tag_str = &remaining[..semi_pos + 1];
            parse_header_tag(tag_str, &mut song);
            remaining = &remaining[semi_pos + 1..];
        } else {
            break;
        }
    }

    // Apply offset to timing data
    song.timing.offset = song.offset;

    Ok(song)
}

fn parse_header_tag(tag_str: &str, song: &mut SongFile) {
    let clean = tag_str.replace(['\n', '\r'], "");
    let Some((tag, value)) = parse_tag_value(&clean) else {
        return;
    };

    match tag.to_uppercase().as_str() {
        "TITLE" => song.title = value.to_string(),
        "SUBTITLE" => song.subtitle = value.to_string(),
        "ARTIST" => song.artist = value.to_string(),
        "TITLETRANSLIT" => song.title_translit = value.to_string(),
        "SUBTITLETRANSLIT" => song.subtitle_translit = value.to_string(),
        "ARTISTTRANSLIT" => song.artist_translit = value.to_string(),
        "GENRE" => song.genre = value.to_string(),
        "CREDIT" => song.credit = value.to_string(),
        "MUSIC" => song.music = value.to_string(),
        "BANNER" => song.banner = value.to_string(),
        "BACKGROUND" => song.background = value.to_string(),
        "LYRICSPATH" => song.lyrics_path = value.to_string(),
        "CDTITLE" => song.cd_title = value.to_string(),
        "OFFSET" => {
            song.offset = value.parse().unwrap_or(0.0);
        }
        "SAMPLESTART" => {
            song.sample_start = value.parse().unwrap_or(-1.0);
        }
        "SAMPLELENGTH" => {
            song.sample_length = value.parse().unwrap_or(12.0);
        }
        "SELECTABLE" => {
            song.selectable = value.to_uppercase() != "NO";
        }
        "DISPLAYBPM" => {
            song.display_bpm = parse_display_bpm(value);
        }
        "BPMS" => {
            song.timing.bpms = parse_bpms(value);
        }
        "STOPS" | "FREEZES" => {
            song.timing.stops = parse_stops(value);
        }
        "DELAYS" => {
            song.timing.delays = parse_delays(value);
        }
        "TIMESIGNATURES" => {
            song.timing.time_signatures = parse_time_signatures(value);
        }
        "TICKCOUNTS" => {
            song.timing.tickcounts = parse_tickcounts(value);
        }
        "SPEEDS" => {
            song.timing.speeds = parse_speeds(value);
        }
        "SCROLLS" => {
            song.timing.scrolls = parse_scrolls(value);
        }
        "FAKES" => {
            song.timing.fakes = parse_fakes(value);
        }
        "LABELS" => {
            song.timing.labels = parse_labels(value);
        }
        "BGCHANGES" | "BGCHANGES1" | "BGCHANGES2" => {
            song.bg_changes.push(value.to_string());
        }
        "FGCHANGES" => {
            song.fg_changes.push(value.to_string());
        }
        _ => {}
    }
}

fn parse_display_bpm(s: &str) -> DisplayBpm {
    if s == "*" {
        return DisplayBpm::Random;
    }
    if let Some(colon) = s.find(':') {
        let lo: f64 = s[..colon].parse().unwrap_or(0.0);
        let hi: f64 = s[colon + 1..].parse().unwrap_or(0.0);
        return DisplayBpm::Range(lo, hi);
    }
    if let Ok(val) = s.parse::<f64>() {
        return DisplayBpm::Specified(val);
    }
    DisplayBpm::Actual
}

fn parse_notes_block(input: &str, _song: &SongFile) -> Result<Option<(Chart, usize)>, ChartError> {
    // #NOTES:
    //      <StepsType>:
    //      <Description>:
    //      <Difficulty>:
    //      <Meter>:
    //      <RadarValues>:
    //      <NoteData>;
    let Some(colon_after_notes) = input.find(':') else {
        return Ok(None);
    };

    let after_tag = &input[colon_after_notes + 1..];
    let Some(semi_pos) = after_tag.find(';') else {
        return Ok(None);
    };

    let block = &after_tag[..semi_pos];
    let total_consumed = colon_after_notes + 1 + semi_pos + 1;

    // Split by colons to get the 6 sections
    let sections: Vec<&str> = block.splitn(6, ':').collect();
    if sections.len() < 6 {
        return Ok(None);
    }

    let steps_type_str = sections[0].trim();
    let description = sections[1].trim().to_string();
    let difficulty_str = sections[2].trim();
    let meter_str = sections[3].trim();
    let radar_str = sections[4].trim();
    let note_str = sections[5].trim();

    let Some(steps_type) = StepsType::from_str_tag(steps_type_str) else {
        return Ok(None);
    };

    let difficulty = Difficulty::from_str_tag(difficulty_str).unwrap_or(Difficulty::Edit);
    let meter: i32 = meter_str.parse().unwrap_or(1);
    let radar_values: Vec<f64> = radar_str
        .split(',')
        .filter_map(|v| v.trim().parse().ok())
        .collect();

    let num_tracks = steps_type.num_columns();
    let note_data = parse_note_data(note_str, num_tracks, steps_type)?;

    Ok(Some((
        Chart {
            steps_type,
            description,
            chart_name: String::new(),
            difficulty,
            meter,
            radar_values,
            credit: String::new(),
            note_data,
            chart_timing: None,
        },
        total_consumed,
    )))
}

pub fn parse_note_data(
    data: &str,
    num_tracks: usize,
    steps_type: StepsType,
) -> Result<NoteData, ChartError> {
    let mut note_data = NoteData::new(num_tracks);

    // Check if this is a routine mode (pump-routine or dance-routine)
    let is_routine = matches!(steps_type.category(), sm_core::StepsTypeCategory::Routine);
    let half_tracks = num_tracks / 2;

    if is_routine {
        // Pump/dance-routine (StepMania 5 / SSC):
        // - Each note line is usually `num_tracks` wide: [player1 half][player2 half] on the same row.
        // - '&' starts a *second layer* with the *same* measure/line map as the first; non-'0' cells
        //   from layer 2 overlay layer 1 (same row index). This matches charts like bad_romance_2002.ssc.
        // - Legacy stacked SM: narrow 5-wide lines per side, P2 block time-shifted (offset = p1_commas * 192).

        let parts: Vec<&str> = data.splitn(2, '&').collect();
        let p1_data = parts.first().unwrap_or(&"");
        let p2_raw = parts.get(1).unwrap_or(&"").to_string();
        let p2_data = p2_raw.replace(';', "");
        let p2_data = p2_data.trim_end_matches(',').trim_end();

        if p2_data.trim().is_empty() {
            parse_note_data_part(p1_data, &mut note_data, 0, num_tracks, false, Some(1))?;
            return Ok(note_data);
        }

        let rows_per_measure = sm_core::ROWS_PER_BEAT * 4;
        let p1_commas = p1_data.matches(',').count();
        let p2_commas = p2_data.matches(',').count();
        let p2_row_offset: i32 = if p1_commas == p2_commas && p1_commas >= 2 {
            0
        } else {
            (p1_commas as i32) * rows_per_measure
        };

        // Layer 1: full width when each line has ≥ num_tracks columns (SSC routine).
        parse_note_data_part(p1_data, &mut note_data, 0, half_tracks, true, Some(1))?;

        if p2_row_offset == 0 {
            // Parallel SSC: second '&' block is another full 10 (or 8) column layer on the same rows.
            merge_routine_parallel_layer(p2_data, &mut note_data)?;
        } else {
            // Stacked legacy: second block is narrow P2 lanes with time offset.
            parse_note_data_part_with_offset(
                p2_data,
                &mut note_data,
                half_tracks,
                half_tracks,
                p2_row_offset,
                Some(2),
            )?;
        }
    } else {
        // For non-routine, parse normally
        parse_note_data_part(data, &mut note_data, 0, num_tracks, false, None)?;
    }

    Ok(note_data)
}

#[inline]
fn with_routine_layer(mut note: TapNote, layer: Option<u8>) -> TapNote {
    note.routine_layer = layer;
    note
}

/// `routine_expand_wide_lines`: for pump/dance routine P1 blocks after '&', each line with
/// at least `note_data.num_tracks` columns maps one digit per global track (0..10 / 0..8).
fn parse_note_data_part(
    data: &str,
    note_data: &mut NoteData,
    track_offset: usize,
    max_tracks: usize,
    routine_expand_wide_lines: bool,
    routine_layer: Option<u8>,
) -> Result<(), ChartError> {
    let measures: Vec<&str> = data.split(',').collect();

    for (measure_idx, measure) in measures.iter().enumerate() {
        let lines: Vec<&str> = measure
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.starts_with("//"))
            .collect();

        if lines.is_empty() {
            continue;
        }

        let rows_in_measure = lines.len() as i32;
        let rows_per_measure = sm_core::ROWS_PER_BEAT * 4; // 4 beats per measure

        for (line_idx, line) in lines.iter().enumerate() {
            let row = measure_idx as i32 * rows_per_measure
                + line_idx as i32 * rows_per_measure / rows_in_measure;

            let chars: Vec<char> = line.chars().collect();
            let count = if routine_expand_wide_lines && chars.len() >= note_data.num_tracks {
                note_data.num_tracks
            } else {
                max_tracks.min(chars.len())
            };

            for local_track in 0..count {
                let Some(&ch) = chars.get(local_track) else {
                    break;
                };
                let track = track_offset + local_track;
                if track >= note_data.num_tracks {
                    break;
                }
                let note = match ch {
                    '0' => continue,
                    '1' => TapNote::tap(),
                    '2' => TapNote::hold(0), // duration resolved later
                    '3' => {
                        // Hold/Roll tail: find the matching head and set duration
                        resolve_hold_tail(note_data, track, row);
                        continue;
                    }
                    '4' => TapNote::roll(0),
                    'M' | 'm' => TapNote::mine(),
                    'L' | 'l' => TapNote::lift(),
                    'F' | 'f' => TapNote::fake(),
                    'K' | 'k' => TapNote {
                        note_type: TapNoteType::AutoKeysound,
                        sub_type: None,
                        hold_duration: None,
                        keysound_index: None,
                        player_number: None,
                        routine_layer: None,
                    },
                    _ => continue,
                };
                let note = with_routine_layer(note, routine_layer);
                note_data.set_note(track, row, note);
            }
        }
    }

    Ok(())
}

/// Second routine layer after '&' when both sides share the same measure map (`p2_row_offset == 0`).
/// Each row matches layer 1; non-'0' glyphs overwrite / add notes on that track (StepMania 5 SSC routine).
fn merge_routine_parallel_layer(data: &str, note_data: &mut NoteData) -> Result<(), ChartError> {
    let half = note_data.num_tracks / 2;
    let measures: Vec<&str> = data.split(',').collect();

    for (measure_idx, measure) in measures.iter().enumerate() {
        let lines: Vec<&str> = measure
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.starts_with("//"))
            .collect();

        if lines.is_empty() {
            continue;
        }

        let rows_in_measure = lines.len() as i32;
        let rows_per_measure = sm_core::ROWS_PER_BEAT * 4;

        for (line_idx, line) in lines.iter().enumerate() {
            let row = measure_idx as i32 * rows_per_measure
                + line_idx as i32 * rows_per_measure / rows_in_measure;

            let chars: Vec<char> = line.chars().collect();
            let count = if chars.len() >= note_data.num_tracks {
                note_data.num_tracks
            } else {
                half.min(chars.len())
            };

            for local_track in 0..count {
                let Some(&ch) = chars.get(local_track) else {
                    break;
                };
                if ch == '0' {
                    continue;
                }
                let track = local_track;
                if track >= note_data.num_tracks {
                    break;
                }
                let note = match ch {
                    '1' => TapNote::tap(),
                    '2' => TapNote::hold(0),
                    '3' => {
                        resolve_hold_tail(note_data, track, row);
                        continue;
                    }
                    '4' => TapNote::roll(0),
                    'M' | 'm' => TapNote::mine(),
                    'L' | 'l' => TapNote::lift(),
                    'F' | 'f' => TapNote::fake(),
                    'K' | 'k' => TapNote {
                        note_type: TapNoteType::AutoKeysound,
                        sub_type: None,
                        hold_duration: None,
                        keysound_index: None,
                        player_number: None,
                        routine_layer: None,
                    },
                    _ => continue,
                };
                let note = with_routine_layer(note, Some(2));
                note_data.set_note(track, row, note);
            }
        }
    }

    Ok(())
}

fn parse_note_data_part_with_offset(
    data: &str,
    note_data: &mut NoteData,
    track_offset: usize,
    max_tracks: usize,
    row_offset: i32,
    routine_layer: Option<u8>,
) -> Result<(), ChartError> {
    let measures: Vec<&str> = data.split(',').collect();

    for (measure_idx, measure) in measures.iter().enumerate() {
        let lines: Vec<&str> = measure
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty() && !l.starts_with("//"))
            .collect();

        if lines.is_empty() {
            continue;
        }

        let rows_in_measure = lines.len() as i32;
        let rows_per_measure = sm_core::ROWS_PER_BEAT * 4; // 4 beats per measure

        for (line_idx, line) in lines.iter().enumerate() {
            let row = row_offset
                + measure_idx as i32 * rows_per_measure
                + line_idx as i32 * rows_per_measure / rows_in_measure;

            let chars: Vec<char> = line.chars().collect();
            // Full-width routine lines (e.g. 10 columns for pump-routine): P2 data often uses
            // the RIGHT half (columns 5–9). Narrow lines keep legacy behaviour (first max_tracks chars).
            let full_width = track_offset + max_tracks;
            for local_track in 0..max_tracks {
                let char_idx = if chars.len() >= full_width {
                    track_offset + local_track
                } else {
                    local_track
                };
                let Some(&ch) = chars.get(char_idx) else {
                    continue;
                };
                let track = track_offset + local_track;
                let note = match ch {
                    '0' => continue,
                    '1' => TapNote::tap(),
                    '2' => TapNote::hold(0), // duration resolved later
                    '3' => {
                        // Hold/Roll tail: find the matching head and set duration
                        resolve_hold_tail(note_data, track, row);
                        continue;
                    }
                    '4' => TapNote::roll(0),
                    'M' | 'm' => TapNote::mine(),
                    'L' | 'l' => TapNote::lift(),
                    'F' | 'f' => TapNote::fake(),
                    'K' | 'k' => TapNote {
                        note_type: TapNoteType::AutoKeysound,
                        sub_type: None,
                        hold_duration: None,
                        keysound_index: None,
                        player_number: None,
                        routine_layer: None,
                    },
                    _ => continue,
                };
                let note = with_routine_layer(note, routine_layer);
                note_data.set_note(track, row, note);
            }
        }
    }

    Ok(())
}

fn resolve_hold_tail(note_data: &mut NoteData, track: usize, tail_row: i32) {
    // Walk backwards to find the hold/roll head
    if let Some(track_data) = note_data.tracks.get_mut(track) {
        let head_row = track_data
            .range(..tail_row)
            .rev()
            .find(|(_, n)| n.note_type == TapNoteType::HoldHead)
            .map(|(r, _)| *r);

        if let Some(hr) = head_row {
            if let Some(head) = track_data.get_mut(&hr) {
                head.hold_duration = Some(tail_row - hr);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_sm() {
        let content = r#"
#TITLE:Test Song;
#ARTIST:Test Artist;
#BPMS:0.000=120.000;
#OFFSET:0.000;
#NOTES:
     dance-single:
     test:
     Challenge:
     10:
     0.5,0.5,0.5,0.5,0.5:
0001
0010
0100
1000
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.title, "Test Song");
        assert_eq!(song.artist, "Test Artist");
        assert_eq!(song.charts.len(), 1);

        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::DanceSingle);
        assert_eq!(chart.difficulty, Difficulty::Challenge);
        assert_eq!(chart.meter, 10);
        assert_eq!(chart.note_data.total_tap_notes(), 4);
    }

    #[test]
    fn test_parse_pump_routine() {
        // Pump routine has 10 tracks: P1 uses 0-4, P2 uses 5-9
        // '&' is a MEASURE-LEVEL separator:
        //   P1 all measure lines first, then '&', then P2 all measure lines
        // Each player's note data is 5 chars per line (pump-single style per player)
        let content = r#"
#TITLE:Routine Test;
#BPMS:0.000=120.000;
#NOTES:
     pump-routine:
     :
     :
     5:
     :
00000
00000
00000
00000
,
01000
01001
00010
00100
&
00000
00000
00000
00000
,
00000
00001
00010
00100
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.title, "Routine Test");
        assert_eq!(song.charts.len(), 1);

        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpRoutine);
        assert_eq!(chart.note_data.num_tracks, 10);

        // P1 notes (tracks 0-4) - measure 2 (measure_idx=1)
        // rows_per_measure=192, so rows are 192, 240, 288, 336
        // Line 0: row=192, "01000" -> track 1
        assert!(chart.note_data.get_note(1, 192).is_some());
        assert_eq!(
            chart.note_data.get_note(1, 192).unwrap().routine_layer,
            Some(1)
        );
        // Line 1: row=240, "01001" -> track 1 and track 4
        assert!(chart.note_data.get_note(1, 240).is_some());
        assert!(chart.note_data.get_note(4, 240).is_some());
        // Line 2: row=288, "00010" -> track 3
        assert!(chart.note_data.get_note(3, 288).is_some());
        // Line 3: row=336, "00100" -> track 2
        assert!(chart.note_data.get_note(2, 336).is_some());

        // P2 notes (tracks 5-9): P2 measure 1 lines (row offset192 + measure 1 base)
        // "00001" -> track 9 (5+4) at line 1 of P2 measure 1 → row 432
        assert!(chart.note_data.get_note(9, 432).is_some());
        assert_eq!(
            chart.note_data.get_note(9, 432).unwrap().routine_layer,
            Some(2)
        );
        // "00010" -> track 8 (5+3) → row 480
        assert!(chart.note_data.get_note(8, 480).is_some());
        // "00100" -> track 7 (5+2) → row 528
        assert!(chart.note_data.get_note(7, 528).is_some());

        // P1 should have 5 notes, P2 should have 3 notes
        let p1_notes: usize = (0..5).map(|t| chart.note_data.tracks[t].len()).sum();
        let p2_notes: usize = (5..10).map(|t| chart.note_data.tracks[t].len()).sum();
        assert_eq!(p1_notes, 5);
        assert_eq!(p2_notes, 3);
    }

    /// Single line encodes both players before '&' (10 digits → tracks 0–9 same row).
    #[test]
    fn test_parse_pump_routine_one_line_both_halves() {
        let content = r#"
#TITLE:Routine OneLine;
#BPMS:0.000=120.000;
#NOTES:
     pump-routine:
     :
     :
     5:
     :
0000000000
0000000000
0000000000
0000000000
,
0100000001
;
"#;
        let song = parse(content).unwrap();
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpRoutine);
        let row = 192;
        assert!(chart.note_data.get_note(1, row).is_some());
        assert!(chart.note_data.get_note(9, row).is_some());
        assert_eq!(
            chart.note_data.get_note(1, row).unwrap().routine_layer,
            Some(1)
        );
        assert_eq!(
            chart.note_data.get_note(9, row).unwrap().routine_layer,
            Some(1)
        );
    }

    /// Pump routine with 10-character lines: P1 uses left half, P2 uses right half.
    #[test]
    fn test_parse_pump_routine_full_width_lines() {
        let content = r#"
#TITLE:Routine Wide;
#BPMS:0.000=120.000;
#NOTES:
     pump-routine:
     :
     :
     5:
     :
0000000000
0000000000
0000000000
0000000000
,
0100000000
0000000000
0100100000
0000000000
0001000000
0010000000
0000100000
0010000000
&
0000000000
0000000000
0000000000
0000000000
,
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
        let song = parse(content).unwrap();
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpRoutine);
        // Same timing as narrow-line routine test: first P1 note row 192 track 1;
        // P2 first tap is on measure 1 line 0 of the right-hand "0000000001" → row 384, track 9
        assert!(chart.note_data.get_note(1, 192).is_some());
        assert!(chart.note_data.get_note(9, 384).is_some());
        assert_eq!(
            chart.note_data.get_note(1, 192).unwrap().routine_layer,
            Some(1)
        );
        assert_eq!(
            chart.note_data.get_note(9, 384).unwrap().routine_layer,
            Some(2)
        );
    }

    #[test]
    fn test_parse_hold_notes() {
        let content = r#"
#TITLE:Hold Test;
#BPMS:0.000=120.000;
#NOTES:
     dance-single:
     :
     Medium:
     5:
     :
2000
0000
0000
3000
;
"#;
        let song = parse(content).unwrap();
        let chart = &song.charts[0];
        let head = chart.note_data.get_note(0, 0).unwrap();
        assert_eq!(head.note_type, TapNoteType::HoldHead);
        assert!(head.hold_duration.unwrap() > 0);
        assert!(head.routine_layer.is_none());
    }
}
