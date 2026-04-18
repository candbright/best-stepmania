use crate::sm_parser::parse_note_data;
use crate::tag_parser::*;
use crate::{Chart, ChartError, DisplayBpm, SongFile};
use sm_core::{Difficulty, StepsType};
use sm_timing::TimingData;

pub fn parse(content: &str) -> Result<SongFile, ChartError> {
    let mut song = SongFile::default();

    // SSC uses #NOTEDATA:; to delimit chart sections
    // Split into header section and chart sections
    let sections: Vec<&str> = content.split("#NOTEDATA:;").collect();

    // Parse the header (first section)
    if let Some(header) = sections.first() {
        parse_header(header, &mut song);
    }

    // Parse each chart section
    for section in sections.iter().skip(1) {
        if let Some(chart) = parse_chart_section(section)? {
            song.charts.push(chart);
        }
    }

    song.timing.offset = song.offset;

    Ok(song)
}

fn parse_header(content: &str, song: &mut SongFile) {
    for tag_block in split_tags(content) {
        let Some((tag, value)) = parse_tag_value(&tag_block) else {
            continue;
        };

        match tag.to_uppercase().as_str() {
            "VERSION" => {} // store if needed
            "TITLE" => song.title = value.to_string(),
            "SUBTITLE" => song.subtitle = value.to_string(),
            "ARTIST" => song.artist = value.to_string(),
            "TITLETRANSLIT" => song.title_translit = value.to_string(),
            "SUBTITLETRANSLIT" => song.subtitle_translit = value.to_string(),
            "ARTISTTRANSLIT" => song.artist_translit = value.to_string(),
            "GENRE" => song.genre = value.to_string(),
            "ORIGIN" => {}
            "CREDIT" => song.credit = value.to_string(),
            "MUSIC" => song.music = value.to_string(),
            "BANNER" => song.banner = value.to_string(),
            "BACKGROUND" => song.background = value.to_string(),
            "LYRICSPATH" => song.lyrics_path = value.to_string(),
            "CDTITLE" => song.cd_title = value.to_string(),
            "JACKET" => song.jacket = value.to_string(),
            "OFFSET" => song.offset = value.parse().unwrap_or(0.0),
            "SAMPLESTART" => song.sample_start = value.parse().unwrap_or(-1.0),
            "SAMPLELENGTH" => song.sample_length = value.parse().unwrap_or(12.0),
            "SELECTABLE" => song.selectable = value.to_uppercase() != "NO",
            "DISPLAYBPM" => {
                song.display_bpm = if value == "*" {
                    crate::DisplayBpm::Random
                } else if let Some(colon) = value.find(':') {
                    let lo = value[..colon].parse().unwrap_or(0.0);
                    let hi = value[colon + 1..].parse().unwrap_or(0.0);
                    DisplayBpm::Range(lo, hi)
                } else if let Ok(v) = value.parse::<f64>() {
                    DisplayBpm::Specified(v)
                } else {
                    DisplayBpm::Actual
                };
            }
            "BPMS" => song.timing.bpms = parse_bpms(value),
            "STOPS" | "FREEZES" => song.timing.stops = parse_stops(value),
            "DELAYS" => song.timing.delays = parse_delays(value),
            "WARPS" => song.timing.warps = parse_warps(value),
            "TIMESIGNATURES" => song.timing.time_signatures = parse_time_signatures(value),
            "TICKCOUNTS" => song.timing.tickcounts = parse_tickcounts(value),
            "COMBOS" => song.timing.combos = parse_combos(value),
            "SPEEDS" => song.timing.speeds = parse_speeds(value),
            "SCROLLS" => song.timing.scrolls = parse_scrolls(value),
            "FAKES" => song.timing.fakes = parse_fakes(value),
            "LABELS" => song.timing.labels = parse_labels(value),
            "BGCHANGES" | "BGCHANGES1" | "BGCHANGES2" => {
                song.bg_changes.push(value.to_string());
            }
            "FGCHANGES" => song.fg_changes.push(value.to_string()),
            "KEYSOUNDS" => {
                song.keysounds = value.split(',').map(|s| s.trim().to_string()).collect();
            }
            _ => {}
        }
    }
}

fn parse_chart_section(section: &str) -> Result<Option<Chart>, ChartError> {
    let mut steps_type: Option<StepsType> = None;
    let mut description = String::new();
    let mut chart_name = String::new();
    let mut difficulty = Difficulty::Edit;
    let mut meter = 1;
    let mut radar_values = Vec::new();
    let mut credit = String::new();
    let mut note_str = String::new();
    let mut chart_timing: Option<TimingData> = None;

    for tag_block in split_tags(section) {
        let Some((tag, value)) = parse_tag_value(&tag_block) else {
            continue;
        };

        match tag.to_uppercase().as_str() {
            "STEPSTYPE" => steps_type = StepsType::from_str_tag(value),
            "DESCRIPTION" => description = value.to_string(),
            "CHARTNAME" => chart_name = value.to_string(),
            "DIFFICULTY" => {
                difficulty = Difficulty::from_str_tag(value).unwrap_or(Difficulty::Edit)
            }
            "METER" => meter = value.parse().unwrap_or(1),
            "RADARVALUES" => {
                radar_values = value
                    .split(',')
                    .filter_map(|v| v.trim().parse().ok())
                    .collect();
            }
            "CREDIT" => credit = value.to_string(),
            "NOTES" | "NOTES2" => note_str = value.to_string(),
            // Per-chart timing overrides
            "BPMS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.bpms = parse_bpms(value);
            }
            "STOPS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.stops = parse_stops(value);
            }
            "DELAYS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.delays = parse_delays(value);
            }
            "WARPS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.warps = parse_warps(value);
            }
            "SPEEDS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.speeds = parse_speeds(value);
            }
            "SCROLLS" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.scrolls = parse_scrolls(value);
            }
            "FAKES" => {
                let td = chart_timing.get_or_insert_with(TimingData::default);
                td.fakes = parse_fakes(value);
            }
            _ => {}
        }
    }

    let Some(st) = steps_type else {
        return Ok(None);
    };

    let num_tracks = st.num_columns();
    let note_data = if note_str.is_empty() {
        sm_core::NoteData::new(num_tracks)
    } else {
        parse_note_data(&note_str, num_tracks, st)?
    };

    Ok(Some(Chart {
        steps_type: st,
        description,
        chart_name,
        difficulty,
        meter,
        radar_values,
        credit,
        note_data,
        chart_timing,
        sm_notes_primary_tag: None,
        sm_misplaced_notes_header: false,
        sm_banner_right: None,
    }))
}

fn split_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut current = String::new();
    let mut in_tag = false;

    for ch in content.chars() {
        if ch == '#' {
            if in_tag && !current.is_empty() {
                tags.push(std::mem::take(&mut current));
            }
            in_tag = true;
            current.push(ch);
        } else if in_tag {
            current.push(ch);
            if ch == ';' {
                tags.push(std::mem::take(&mut current));
                in_tag = false;
            }
        }
    }

    if !current.is_empty() {
        tags.push(current);
    }

    tags
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ssc() {
        let content = r#"
#VERSION:0.83;
#TITLE:SSC Test;
#ARTIST:Test;
#BPMS:0.000=140.000;
#OFFSET:0.000;

#NOTEDATA:;
#STEPSTYPE:dance-single;
#DESCRIPTION:Authored;
#CHARTNAME:My Chart;
#DIFFICULTY:Hard;
#METER:9;
#RADARVALUES:0.5,0.5,0.5,0.5,0.5;
#NOTES:
1000
0100
0010
0001
;
"#;
        let song = parse(content).unwrap();
        assert_eq!(song.title, "SSC Test");
        assert_eq!(song.charts.len(), 1);

        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::DanceSingle);
        assert_eq!(chart.difficulty, Difficulty::Hard);
        assert_eq!(chart.meter, 9);
        assert_eq!(chart.chart_name, "My Chart");
        assert_eq!(chart.note_data.total_tap_notes(), 4);
    }

    /// Pump-routine in SSC: full-width lines, `&` between P1/P2, parallel measures (same comma count ≥2).
    #[test]
    fn test_parse_ssc_pump_routine_parallel() {
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
,  // measure2
0000000000
0000000000
0000000000
0000000000
,  // measure3
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
,  // measure2
0000000000
0000000000
0000000000
0000000000
,  // measure3
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
        assert_eq!(song.charts.len(), 1);
        let chart = &song.charts[0];
        assert_eq!(chart.steps_type, StepsType::PumpRoutine);
        // Third measure, first note row (both players same timeline)
        let row_m3_0 = 2 * 48 * 4;
        assert!(
            chart.note_data.get_note(1, row_m3_0).is_some(),
            "P1 tap on track 1"
        );
        assert!(
            chart.note_data.get_note(9, row_m3_0).is_some(),
            "P2 tap on track 9 same row"
        );
    }
}
