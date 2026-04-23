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
        let prelude = &content[..content.len() - remaining.len()];

        // Check for #NOTES tag (special multi-line block)
        if remaining.starts_with("#NOTES") && !remaining.starts_with("#NOTEDATA") {
            let chart = parse_notes_block(remaining, &song, prelude)?;
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

    merge_adjacent_sm_lover_routine_charts(&mut song);

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

/// Map a note row width to the usual StepMania steps type (when the tag line is missing or wrong).
fn steps_type_for_note_width(width: usize) -> Option<StepsType> {
    match width {
        3 => Some(StepsType::DanceThreepanel),
        4 => Some(StepsType::DanceSingle),
        5 => Some(StepsType::PumpSingle),
        6 => Some(StepsType::DanceSolo),
        8 => Some(StepsType::DanceDouble),
        10 => Some(StepsType::PumpDouble),
        // PIU / community `.sm`: 20 chars for pump-double (10 lanes, sparse 2/3/5/7/8 per side).
        20 => Some(StepsType::PumpDouble),
        _ => None,
    }
}

/// Non-standard `#NOTES` first field (difficulty or pack label) that still hints pump mode.
fn sm_community_steps_type_tag(raw: &str) -> Option<StepsType> {
    match raw.trim().to_lowercase().as_str() {
        "double" => Some(StepsType::PumpDouble),
        "lover1" | "lover2" => Some(StepsType::PumpRoutine),
        _ => None,
    }
}

fn note_glyph_line_is_all_note_chars(line: &str) -> bool {
    line.chars()
        .all(|c| c.is_ascii_digit() || matches!(c, 'M' | 'm' | 'L' | 'l' | 'F' | 'f' | 'K' | 'k'))
}

/// First note row width in `#NOTES` body (after trimming / `//` comments).
fn first_note_glyph_line_width(note_str: &str) -> Option<usize> {
    for raw_line in note_str.lines() {
        let line = raw_line.trim();
        let line = line.split("//").next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if note_glyph_line_is_all_note_chars(line) {
            return Some(line.len());
        }
    }
    None
}

/// Wide pump `.sm` rows: community layout uses columns 2/3/5/7/8 per half (see `pump_sm_layout`);
/// legacy files may use **two ASCII columns per lane** (`track t` → `2t`,`2t+1`), still detected per row.
fn sm_pump_uses_double_column_encoding(data: &str, num_tracks: usize) -> bool {
    if num_tracks == 0 {
        return false;
    }
    let Some(w) = first_note_glyph_line_width(data) else {
        return false;
    };
    w >= 2 * num_tracks
}

fn sm_pump_line_has_odd_column_note(line: &str) -> bool {
    let line = line.split("//").next().unwrap_or("").trim();
    if !note_glyph_line_is_all_note_chars(line) {
        return false;
    }
    for (i, c) in line.chars().enumerate() {
        if i % 2 == 1 && c != '0' {
            return true;
        }
    }
    false
}

/// Misplaced header + 10-wide lines that fit community pump-single SM (pair and/or sparse 2/3/5/7/8).
fn sm_misplaced_ten_wide_is_pump_single(note_str: &str) -> bool {
    if first_note_glyph_line_width(note_str) != Some(10) {
        return false;
    }
    for raw_line in note_str.lines() {
        let line = raw_line.trim();
        let line = line.split("//").next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if !note_glyph_line_is_all_note_chars(line) {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        if crate::pump_sm_layout::row_fits_sm_community_single_10(&chars) {
            continue;
        }
        if sm_pump_line_has_odd_column_note(line) {
            return false;
        }
    }
    true
}

fn merge_adjacent_sm_lover_routine_charts(song: &mut SongFile) {
    let mut i = 0;
    while i + 1 < song.charts.len() {
        let merge = matches!(
            (
                song.charts[i].sm_notes_primary_tag.as_deref(),
                song.charts[i + 1].sm_notes_primary_tag.as_deref(),
            ),
            (Some("lover1"), Some("lover2"))
        ) && song.charts[i].steps_type == StepsType::PumpRoutine
            && song.charts[i + 1].steps_type == StepsType::PumpRoutine;

        if merge {
            let mut primary = song.charts[i].clone();
            let lover2 = &song.charts[i + 1];
            overlay_lover2_routine_layer(&mut primary, lover2);
            primary.sm_notes_primary_tag = None;
            primary.description = if primary.description == lover2.description {
                primary.description.clone()
            } else {
                format!("{} · {}", primary.description, lover2.description)
            };
            song.charts.remove(i + 1);
            song.charts[i] = primary;
            continue;
        }
        i += 1;
    }
}

fn overlay_lover2_routine_layer(primary: &mut Chart, lover2: &Chart) {
    for ti in 0..lover2
        .note_data
        .num_tracks
        .min(primary.note_data.num_tracks)
    {
        let rows: Vec<(i32, TapNote)> = lover2.note_data.tracks[ti]
            .iter()
            .map(|(&r, n)| (r, n.clone()))
            .collect();
        for (row, mut note) in rows {
            note.routine_layer = Some(2);
            primary.note_data.set_note(ti, row, note);
        }
    }
}

/// Scan `#NOTES` body for the first full note row and infer column count.
/// Parse `//--------------- left - right -----...` immediately above `#NOTES`, if present.
fn sm_banner_right_from_prelude(prelude: &str) -> Option<String> {
    for raw in prelude.lines().rev() {
        let line = raw.trim();
        let Some(rest) = line.strip_prefix("//---------------") else {
            continue;
        };
        let mid = rest.trim_end_matches('-').trim();
        let Some((_, right)) = mid.split_once(" - ") else {
            continue;
        };
        let right = right.trim();
        if !right.is_empty() {
            return Some(right.to_string());
        }
    }
    None
}

fn infer_steps_type_from_note_block(note_str: &str) -> Option<StepsType> {
    for raw_line in note_str.lines() {
        let line = raw_line.trim();
        let line = line.split("//").next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if note_glyph_line_is_all_note_chars(line) {
            return steps_type_for_note_width(line.len());
        }
    }
    None
}

fn parse_notes_block(
    input: &str,
    _song: &SongFile,
    prelude: &str,
) -> Result<Option<(Chart, usize)>, ChartError> {
    // #NOTES:
    //      <StepsType>:
    //      <Description>:
    //      <Difficulty>:
    //      <Meter>:
    //      <RadarValues>:   (optional — many community .sm files omit this row)
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

    // Up to 6 ':'-delimited fields; the last field is all remaining note data.
    let sections: Vec<&str> = block.splitn(6, ':').collect();
    let (steps_type_str, sec1, sec2, sec3, radar_str, note_str) = match sections.len() {
        6 => (
            sections[0].trim(),
            sections[1].trim(),
            sections[2].trim(),
            sections[3].trim(),
            sections[4].trim(),
            sections[5].trim(),
        ),
        5 => (
            sections[0].trim(),
            sections[1].trim(),
            sections[2].trim(),
            sections[3].trim(),
            "",
            sections[4].trim(),
        ),
        _ => return Ok(None),
    };

    let declared_st = StepsType::from_str_tag(steps_type_str)
        .or_else(|| sm_community_steps_type_tag(steps_type_str));

    let mut inferred_st = infer_steps_type_from_note_block(note_str);
    if declared_st.is_none()
        && inferred_st == Some(StepsType::PumpDouble)
        && sm_misplaced_ten_wide_is_pump_single(note_str)
    {
        inferred_st = Some(StepsType::PumpSingle);
    }

    let steps_type = match (declared_st, inferred_st) {
        // Routine charts often use 5-wide lines per player; width inference would wrongly pick pump-single.
        (Some(d), _) if matches!(d.category(), sm_core::StepsTypeCategory::Routine) => d,
        (Some(d), Some(i)) if d.num_columns() != i.num_columns() => i,
        (Some(d), _) => d,
        (None, Some(i)) => i,
        (None, None) => return Ok(None),
    };

    // PIU/community files often put difficulty (e.g. "hard") in the steps-type slot and omit radar.
    let metadata_misplaced = declared_st.is_none();
    let (description, chart_name, difficulty) = if metadata_misplaced {
        (
            sec1.to_string(),
            sec2.to_string(),
            Difficulty::from_str_tag(steps_type_str).unwrap_or(Difficulty::Edit),
        )
    } else {
        (
            sec1.to_string(),
            String::new(),
            Difficulty::from_str_tag(sec2).unwrap_or(Difficulty::Edit),
        )
    };

    let lover_merge_tag = {
        let low = steps_type_str.trim().to_lowercase();
        if low == "lover1" || low == "lover2" {
            Some(low)
        } else {
            None
        }
    };

    let (sm_notes_primary_tag, sm_misplaced_notes_header, sm_banner_right) = if metadata_misplaced {
        (
            Some(steps_type_str.to_string()),
            true,
            sm_banner_right_from_prelude(prelude),
        )
    } else {
        (lover_merge_tag, false, None)
    };

    let meter: i32 = sec3.parse().unwrap_or(1);
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
            chart_name,
            difficulty,
            meter,
            radar_values,
            credit: String::new(),
            note_data,
            chart_timing: None,
            sm_notes_primary_tag,
            sm_misplaced_notes_header,
            sm_banner_right,
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
            parse_note_data_part(
                p1_data,
                &mut note_data,
                0,
                num_tracks,
                true,
                Some(1),
                steps_type.is_pump(),
            )?;
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

        let p1_pair = sm_pump_uses_double_column_encoding(p1_data, num_tracks);
        let p1_max = if p1_pair { num_tracks } else { half_tracks };
        // Layer 1: full width when each line has ≥ num_tracks columns (SSC routine).
        parse_note_data_part(
            p1_data,
            &mut note_data,
            0,
            p1_max,
            true,
            Some(1),
            steps_type.is_pump(),
        )?;

        if p2_row_offset == 0 {
            // Parallel SSC: second '&' block is another full 10 (or 8) column layer on the same rows.
            merge_routine_parallel_layer(p2_data, &mut note_data, steps_type.is_pump())?;
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
        parse_note_data_part(
            data,
            &mut note_data,
            0,
            num_tracks,
            false,
            None,
            steps_type.is_pump(),
        )?;
    }

    Ok(note_data)
}

#[inline]
fn with_routine_layer(mut note: TapNote, layer: Option<u8>) -> TapNote {
    note.routine_layer = layer;
    note
}

#[derive(Clone, Copy)]
enum PumpSmLineKind {
    SparseSingle10,
    SparseDouble20,
    Pair { lanes: usize },
    Sequential { count: usize },
}

fn classify_pump_sm_line(
    chars: &[char],
    total_tracks: usize,
    max_tracks: usize,
    routine_expand_wide_lines: bool,
) -> PumpSmLineKind {
    debug_assert!(matches!(total_tracks, 5 | 10));
    if total_tracks == 5 {
        if chars.len() >= 10 && crate::pump_sm_layout::row_fits_sm_community_single_10(&chars[..10])
        {
            return PumpSmLineKind::SparseSingle10;
        }
        if chars.len() >= 10 {
            let lanes = max_tracks.min(5).min(chars.len() / 2);
            return PumpSmLineKind::Pair { lanes };
        }
        return PumpSmLineKind::Sequential {
            count: max_tracks.min(chars.len()).min(5),
        };
    }
    if chars.len() >= 20 && crate::pump_sm_layout::row_fits_sm_community_double_20(chars) {
        return PumpSmLineKind::SparseDouble20;
    }
    if chars.len() >= 20 {
        let lanes = max_tracks.min(10).min(chars.len() / 2);
        return PumpSmLineKind::Pair { lanes };
    }
    let count = if routine_expand_wide_lines && chars.len() >= total_tracks {
        total_tracks
    } else {
        max_tracks.min(chars.len())
    };
    PumpSmLineKind::Sequential { count }
}

fn apply_pump_sm_sparse_row(
    note_data: &mut NoteData,
    track_offset: usize,
    lanes: usize,
    row: i32,
    chars: &[char],
    double_width: bool,
    routine_layer: Option<u8>,
) -> Result<(), ChartError> {
    let col_of = |local_lane: usize| -> Option<usize> {
        let g = track_offset + local_lane;
        if double_width {
            crate::pump_sm_layout::lane_to_sm_col0_double(g)
        } else {
            crate::pump_sm_layout::lane_to_sm_col0_single(g)
        }
    };
    for pass in 0..3 {
        for local in 0..lanes {
            let track = track_offset + local;
            if track >= note_data.num_tracks {
                break;
            }
            let Some(ci) = col_of(local) else {
                continue;
            };
            let ch = chars.get(ci).copied().unwrap_or('0');
            match pass {
                0 => {
                    if ch == '3' {
                        resolve_hold_tail(note_data, track, row);
                    }
                }
                1 => {
                    if matches!(ch, '2' | '4') {
                        let note = match ch {
                            '2' => TapNote::hold(0),
                            '4' => TapNote::roll(0),
                            _ => continue,
                        };
                        let note = with_routine_layer(note, routine_layer);
                        note_data.set_note(track, row, note);
                    }
                }
                _ => {
                    let note = match ch {
                        '0' | '2' | '3' | '4' => continue,
                        '1' => TapNote::tap(),
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
    }
    Ok(())
}

fn parse_one_pump_note_line(
    note_data: &mut NoteData,
    track_offset: usize,
    max_tracks: usize,
    row: i32,
    chars: &[char],
    routine_expand_wide_lines: bool,
    routine_layer: Option<u8>,
) -> Result<(), ChartError> {
    match classify_pump_sm_line(
        chars,
        note_data.num_tracks,
        max_tracks,
        routine_expand_wide_lines,
    ) {
        PumpSmLineKind::SparseSingle10 => {
            let lanes = max_tracks.min(5);
            apply_pump_sm_sparse_row(
                note_data,
                track_offset,
                lanes,
                row,
                chars,
                false,
                routine_layer,
            )?;
        }
        PumpSmLineKind::SparseDouble20 => {
            let lanes = max_tracks.min(10);
            apply_pump_sm_sparse_row(
                note_data,
                track_offset,
                lanes,
                row,
                chars,
                true,
                routine_layer,
            )?;
        }
        PumpSmLineKind::Pair { lanes } => {
            for local_track in 0..lanes {
                let track = track_offset + local_track;
                if track >= note_data.num_tracks {
                    break;
                }
                let i = 2 * local_track;
                let ch0 = chars.get(i).copied().unwrap_or('0');
                let ch1 = chars.get(i + 1).copied().unwrap_or('0');
                apply_pump_pair_glyphs(note_data, track, row, ch0, ch1, routine_layer)?;
            }
        }
        PumpSmLineKind::Sequential { count } => {
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

/// `routine_expand_wide_lines`: for pump/dance routine P1 blocks after '&', each line with
/// at least `note_data.num_tracks` columns maps one digit per global track (0..10 / 0..8).
fn parse_note_data_part(
    data: &str,
    note_data: &mut NoteData,
    track_offset: usize,
    max_tracks: usize,
    routine_expand_wide_lines: bool,
    routine_layer: Option<u8>,
    is_pump: bool,
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
            if is_pump {
                parse_one_pump_note_line(
                    note_data,
                    track_offset,
                    max_tracks,
                    row,
                    &chars,
                    routine_expand_wide_lines,
                    routine_layer,
                )?;
                continue;
            }

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

/// PIU `.sm` pair columns: process hold tails before heads, then heads/rolls, then taps/mines.
fn apply_pump_pair_glyphs(
    note_data: &mut NoteData,
    track: usize,
    row: i32,
    ch0: char,
    ch1: char,
    routine_layer: Option<u8>,
) -> Result<(), ChartError> {
    for &ch in &[ch0, ch1] {
        if ch == '3' {
            resolve_hold_tail(note_data, track, row);
        }
    }
    for &ch in &[ch0, ch1] {
        if matches!(ch, '2' | '4') {
            let note = match ch {
                '2' => TapNote::hold(0),
                '4' => TapNote::roll(0),
                _ => continue,
            };
            let note = with_routine_layer(note, routine_layer);
            note_data.set_note(track, row, note);
        }
    }
    for &ch in &[ch0, ch1] {
        let note = match ch {
            '0' | '2' | '3' | '4' => continue,
            '1' => TapNote::tap(),
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
    Ok(())
}

/// Second routine layer after '&' when both sides share the same measure map (`p2_row_offset == 0`).
/// Each row matches layer 1; non-'0' glyphs overwrite / add notes on that track (StepMania 5 SSC routine).
fn merge_routine_parallel_layer(
    data: &str,
    note_data: &mut NoteData,
    is_pump: bool,
) -> Result<(), ChartError> {
    let half = note_data.num_tracks / 2;
    let pair = !is_pump && sm_pump_uses_double_column_encoding(data, note_data.num_tracks);
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
            if is_pump {
                parse_one_pump_note_line(
                    note_data,
                    0,
                    note_data.num_tracks,
                    row,
                    &chars,
                    true,
                    Some(2),
                )?;
                continue;
            }
            if pair {
                if chars.len() < 2 * note_data.num_tracks {
                    continue;
                }
                for local_track in 0..note_data.num_tracks {
                    let i = 2 * local_track;
                    let ch0 = chars[i];
                    let ch1 = chars.get(i + 1).copied().unwrap_or('0');
                    apply_pump_pair_glyphs(note_data, local_track, row, ch0, ch1, Some(2))?;
                }
                continue;
            }

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

    /// Community `.sm`: misplaced header + 10-wide lines that only use even columns → `pump-single` (pair lanes).
    #[test]
    fn test_parse_five_field_notes_misplaced_header_pump_single_pair() {
        let content = r#"#TITLE:T;
#BPMS:0.000000=132.000000;
#OFFSET:0.580000;
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
        let song = parse(content).unwrap();
        assert_eq!(song.charts.len(), 1);
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpSingle);
        assert_eq!(chart.difficulty, Difficulty::Hard);
        assert_eq!(chart.meter, 18);
        assert_eq!(chart.note_data.num_tracks, 5);
        assert!(chart.sm_misplaced_notes_header);
        assert_eq!(chart.sm_notes_primary_tag.as_deref(), Some("hard"));
        assert!(chart.note_data.get_note(3, 192).is_some());
    }

    #[test]
    fn test_parse_wrong_tag_but_correct_width_prefers_geometry() {
        let content = r#"#TITLE:T;
#BPMS:0.000000=120.000000;
#NOTES:
     pump-single:
     d:
     Easy:
     1:
0000000000
0000000000
0000000000
0000000000
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.charts[0].steps_type, StepsType::PumpDouble);
    }

    #[test]
    fn test_ten_wide_odd_column_keeps_pump_double() {
        let content = r#"#TITLE:T;
#BPMS:0.000000=120.000000;
#NOTES:
     hard:
     x:
     Easy:
     1:
0000000000
0001000000
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.charts[0].steps_type, StepsType::PumpDouble);
        assert_eq!(song.charts[0].note_data.num_tracks, 10);
    }

    #[test]
    fn test_sm_community_double_tag_20_wide_pair() {
        let content = r#"#TITLE:T;
#BPMS:0=120;
#NOTES:
     double:
     d:
     Hard:
     1:
00001000000000000000
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.charts.len(), 1);
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpDouble);
        assert!(chart.note_data.get_note(2, 0).is_some());
    }

    #[test]
    fn test_sm_lover1_only_parses_tap() {
        let content = r#"#TITLE:L;
#BPMS:0=120;
#NOTES:
     lover1:
     a:
     Hard:
     1:

0000001000
;"#;
        let song = parse(content).unwrap();
        assert_eq!(song.charts.len(), 1);
        let c = &song.charts[0];
        assert_eq!(c.steps_type, StepsType::PumpRoutine);
        assert_eq!(c.note_data.num_tracks, 10);
        assert!(
            c.note_data.get_note(6, 0).is_some(),
            "expected tap on track 6 row 0 (10-wide routine, digit at index 6)"
        );
    }

    #[test]
    fn test_sm_lover1_lover2_merge_to_one_routine_chart() {
        let content = r#"#TITLE:L;
#BPMS:0=120;
#NOTES:
     lover1:
     a:
     Hard:
     1:

0000001000
;
#NOTES:
     lover2:
     b:
     Hard:
     1:

0000010000
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.charts.len(), 1);
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpRoutine);
        assert_eq!(chart.sm_notes_primary_tag, None);
        let n61 = chart.note_data.get_note(6, 0).unwrap();
        assert_eq!(n61.routine_layer, Some(1));
        let n52 = chart.note_data.get_note(5, 0).unwrap();
        assert_eq!(n52.routine_layer, Some(2));
    }
}
