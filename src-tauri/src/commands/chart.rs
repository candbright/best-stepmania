use crate::AppState;
use serde::{Deserialize, Serialize};
use sm_core::note::{NoteData, TapNote, TapNoteType};
use std::path::{Path, PathBuf};
use tauri::State;

/// Parse a chart file with caching. Returns a clone of the cached SongFile.
fn parse_chart_cached(
    state: &State<'_, AppState>,
    chart_path: &PathBuf,
) -> Result<sm_chart::SongFile, String> {
    // Try cache first
    if let Ok(mut cache) = state.chart_cache.lock() {
        if let Some(song) = cache.get(chart_path) {
            return Ok(song.clone());
        }
    }
    // Cache miss: parse and insert
    let song = sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;
    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path.clone(), song.clone());
    }
    Ok(song)
}

fn find_chart_in_dir(dir: &Path) -> Option<PathBuf> {
    let mut sm_path: Option<PathBuf> = None;
    let mut ssc_path: Option<PathBuf> = None;

    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        match ext.as_deref() {
            Some("ssc") => {
                if ssc_path.is_none() {
                    ssc_path = Some(p);
                }
            }
            Some("sm") => {
                if sm_path.is_none() {
                    sm_path = Some(p);
                }
            }
            _ => {}
        }
    }

    ssc_path.or(sm_path)
}

/// Serialise `song` to disk at `path`, choosing .ssc or .sm writer by extension.
/// Centralises the extension-branch so callers never duplicate it.
fn write_chart_to_file(path: &std::path::Path, song: &sm_chart::SongFile) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let content = match ext.as_str() {
        "ssc" => sm_chart::sm_writer::write_ssc(song),
        _ => sm_chart::sm_writer::write_sm(song),
    };
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Keep in-memory [`sm_song::SongManager`] in sync after editor writes so `get_song_list` matches disk.
/// When the editor changes `steps_type`, lane count may change; keep `note_data` in range.
fn resize_chart_note_data(note_data: &mut NoteData, new_st: sm_core::StepsType) {
    let new_nt = new_st.num_columns();
    if note_data.num_tracks == new_nt {
        return;
    }
    let old = std::mem::replace(note_data, NoteData::new(new_nt));
    let copy = old.num_tracks.min(new_nt);
    for t in 0..copy {
        note_data.tracks[t] = old.tracks[t].clone();
    }
}

fn refresh_song_list_entry(state: &State<'_, AppState>, chart_path: &Path) {
    let base = match state.songs_base_dir.lock() {
        Ok(b) => b.clone(),
        Err(_) => return,
    };
    if base.is_empty() {
        return;
    }
    let base_path = Path::new(&base);
    if let Ok(mut mgr) = state.song_manager.lock() {
        let _ = mgr.refresh_song_for_chart_file(chart_path, base_path);
    }
}

/// Direct `.sm` / `.ssc` paths must belong to the scanned library (prevents arbitrary file reads via IPC).
fn ensure_chart_file_in_library(state: &State<'_, AppState>, chart_path: &Path) -> Result<(), String> {
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    if mgr.songs.is_empty() {
        return Err("Song library is empty; scan songs before opening chart files by path".to_string());
    }
    let canon_chart = chart_path.canonicalize().ok();
    let known = mgr.songs.iter().any(|s| {
        if s.chart_file == chart_path {
            return true;
        }
        match (&canon_chart, s.chart_file.canonicalize().ok()) {
            (Some(a), Some(b)) => *a == b,
            _ => false,
        }
    });
    if known {
        Ok(())
    } else {
        Err(format!(
            "Chart file is not in the scanned song library: {}",
            chart_path.display()
        ))
    }
}

/// Directory must be a known song folder (canonical match) or under the primary scanned songs base path.
fn ensure_song_dir_in_library(state: &State<'_, AppState>, dir: &Path) -> Result<(), String> {
    let dir_canon = dir
        .canonicalize()
        .map_err(|e| format!("Song path not accessible: {e}"))?;
    let mgr = state.song_manager.lock().map_err(|e| e.to_string())?;
    if mgr.songs.iter().any(|s| s.path.canonicalize().ok().as_ref() == Some(&dir_canon)) {
        return Ok(());
    }
    drop(mgr);
    let base = state.songs_base_dir.lock().map_err(|e| e.to_string())?;
    if base.is_empty() {
        return Err("Song directory is not in the scanned library".to_string());
    }
    let base_canon = Path::new(base.as_str())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if dir_canon.starts_with(&base_canon) {
        Ok(())
    } else {
        Err("Song directory is outside the configured songs location".to_string())
    }
}

fn resolve_chart_path(state: &State<'_, AppState>, song_path: &str) -> Result<PathBuf, String> {
    let input = Path::new(song_path);

    // 直接传入谱面文件路径
    if input.is_file() {
        let ext = input
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if ext == "sm" || ext == "ssc" {
            ensure_chart_file_in_library(state, input)?;
            return Ok(input.to_path_buf());
        }
        return Err(format!("Unsupported chart file: {}", song_path));
    }

    // 传入歌曲目录路径：优先从扫描缓存中取精确 chart_file
    if input.is_dir() {
        if let Ok(mgr) = state.song_manager.lock() {
            if let Some(song) = mgr.songs.iter().find(|s| s.path == input) {
                return Ok(song.chart_file.clone());
            }
            if let Some(song) = mgr
                .songs
                .iter()
                .find(|s| s.path.to_string_lossy() == song_path)
            {
                return Ok(song.chart_file.clone());
            }
        }

        ensure_song_dir_in_library(state, input)?;
        return find_chart_in_dir(input)
            .ok_or_else(|| format!("No .sm/.ssc chart file found in directory: {}", song_path));
    }

    Err(format!("Song path not found: {}", song_path))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartInfo {
    pub steps_type: String,
    pub difficulty: String,
    pub meter: i32,
    pub chart_name: String,
    pub description: String,
    pub note_count: usize,
    pub num_tracks: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartNoteRow {
    pub row: i32,
    pub beat: f64,
    pub second: f64,
    pub notes: Vec<NoteInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    pub track: usize,
    pub note_type: String,
    pub hold_end_row: Option<i32>,
    pub hold_end_second: Option<f64>,
    /// Routine: `1` = before `&`, `2` = after `&` in the chart file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routine_layer: Option<u8>,
}

#[tauri::command]
pub fn load_chart(state: State<'_, AppState>, song_path: String) -> Result<Vec<ChartInfo>, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let song = parse_chart_cached(&state, &chart_path)?;
    // 返回所有谱面（不限于 pump），前端按需过滤
    Ok(song
        .charts
        .iter()
        .map(|c| ChartInfo {
            steps_type: c.steps_type.to_string(),
            difficulty: c.difficulty.to_string(),
            meter: c.meter,
            chart_name: c.chart_name.clone(),
            description: c.description.clone(),
            note_count: c.note_data.total_tap_notes(),
            num_tracks: c.steps_type.num_columns(),
        })
        .collect())
}

fn extract_chart_note_rows(song: &sm_chart::SongFile, chart_index: usize) -> Result<Vec<ChartNoteRow>, String> {
    let chart = song.charts.get(chart_index).ok_or_else(|| {
        format!(
            "Chart index {} out of range (total charts: {})",
            chart_index,
            song.charts.len()
        )
    })?;

    let timing = chart.chart_timing.as_ref().unwrap_or(&song.timing);
    let nd = &chart.note_data;

    let mut result = Vec::new();
    for row in nd.occupied_rows() {
        let beat = sm_core::row_to_beat(row);
        let second = timing.beat_to_second(beat);

        let notes: Vec<NoteInfo> = nd
            .notes_at_row(row)
            .iter()
            .filter(|(_, n)| !n.is_empty())
            .map(|(track, n)| {
                let hold_end_row = if n.note_type == TapNoteType::HoldHead {
                    n.hold_duration.map(|d| row + d)
                } else {
                    None
                };
                let hold_end_second = hold_end_row.map(|end_row| {
                    let end_beat = sm_core::row_to_beat(end_row);
                    timing.beat_to_second(end_beat)
                });
                // 区分 Hold 和 Roll：两者 note_type 都是 HoldHead，
                // 但 sub_type 不同（Hold = TapNoteSubType::Hold, Roll = TapNoteSubType::Roll）
                use sm_core::note::TapNoteSubType;
                let note_type_str = match n.note_type {
                    TapNoteType::HoldHead => match n.sub_type {
                        Some(TapNoteSubType::Roll) => "Roll",
                        _ => "HoldHead",
                    },
                    TapNoteType::Tap => "Tap",
                    TapNoteType::Mine => "Mine",
                    TapNoteType::Lift => "Lift",
                    TapNoteType::Fake => "Fake",
                    TapNoteType::AutoKeysound => "AutoKeysound",
                    TapNoteType::HoldTail => "HoldTail",
                    TapNoteType::Empty => "Empty",
                };
                NoteInfo {
                    track: *track,
                    note_type: note_type_str.to_string(),
                    hold_end_row,
                    hold_end_second,
                    routine_layer: n.routine_layer,
                }
            })
            .collect();

        if !notes.is_empty() {
            result.push(ChartNoteRow {
                row,
                beat,
                second,
                notes,
            });
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn get_chart_notes(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: usize,
) -> Result<Vec<ChartNoteRow>, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let song = parse_chart_cached(&state, &chart_path)?;
    extract_chart_note_rows(&song, chart_index)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChartNote {
    pub row: i32,
    pub track: usize,
    pub note_type: String,
    pub hold_end_row: Option<i32>,
    /// Pump routine: `1` = before `&`, `2` = after `&` (parallel layer).
    #[serde(default)]
    pub routine_layer: Option<u8>,
}

#[tauri::command]
pub fn save_chart(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: usize,
    notes: Vec<SaveChartNote>,
) -> Result<(), String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    // 直接用全部谱面列表的索引（与 load_chart / get_chart_notes 保持一致）
    let total_charts = song.charts.len();
    let chart = song.charts.get_mut(chart_index).ok_or_else(|| {
        format!(
            "Chart index {} out of range (total: {})",
            chart_index, total_charts
        )
    })?;

    let num_tracks = chart.note_data.num_tracks;
    let mut nd = NoteData::new(num_tracks);

    for n in &notes {
        if n.track >= num_tracks {
            continue;
        }
        let mut note = match n.note_type.as_str() {
            "Tap" => TapNote::tap(),
            "HoldHead" => {
                let dur = n.hold_end_row.map(|end| end - n.row).unwrap_or(48);
                TapNote::hold(dur)
            }
            "Mine" => TapNote::mine(),
            "Lift" => TapNote::lift(),
            "Fake" => TapNote::fake(),
            "Roll" => {
                let dur = n.hold_end_row.map(|end| end - n.row).unwrap_or(48);
                TapNote::roll(dur)
            }
            _ => TapNote::tap(),
        };
        if matches!(n.routine_layer, Some(1) | Some(2)) {
            note.routine_layer = n.routine_layer;
        }
        nd.set_note(n.track, n.row, note);
    }

    chart.note_data = nd;

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    // Update cache with the newly written chart
    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path.clone(), song);
    }

    Ok(())
}

// --- New commands for enhanced editor ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMetadata {
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub genre: String,
    pub credit: String,
    pub music: String,
    pub banner: String,
    pub background: String,
    pub sample_start: f64,
    pub sample_length: f64,
    pub offset: f64,
}

#[tauri::command]
pub fn get_song_metadata(
    state: State<'_, AppState>,
    song_path: String,
) -> Result<SongMetadata, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let song = parse_chart_cached(&state, &chart_path)?;
    Ok(SongMetadata {
        title: song.title.clone(),
        subtitle: song.subtitle.clone(),
        artist: song.artist.clone(),
        genre: song.genre.clone(),
        credit: song.credit.clone(),
        music: song.music.clone(),
        banner: song.banner.clone(),
        background: song.background.clone(),
        sample_start: song.sample_start,
        sample_length: song.sample_length,
        offset: song.offset,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMetadataUpdate {
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub artist: Option<String>,
    pub genre: Option<String>,
    pub credit: Option<String>,
    pub banner: Option<String>,
    pub background: Option<String>,
    pub music: Option<String>,
    pub sample_start: Option<f64>,
    pub sample_length: Option<f64>,
    pub offset: Option<f64>,
}

#[tauri::command]
pub fn update_song_metadata(
    state: State<'_, AppState>,
    song_path: String,
    metadata: SongMetadataUpdate,
) -> Result<(), String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    if let Some(v) = metadata.title {
        song.title = v;
    }
    if let Some(v) = metadata.subtitle {
        song.subtitle = v;
    }
    if let Some(v) = metadata.artist {
        song.artist = v;
    }
    if let Some(v) = metadata.genre {
        song.genre = v;
    }
    if let Some(v) = metadata.credit {
        song.credit = v;
    }
    if let Some(v) = metadata.banner {
        song.banner = v;
    }
    if let Some(v) = metadata.background {
        song.background = v;
    }
    if let Some(v) = metadata.music {
        song.music = v;
    }
    if let Some(v) = metadata.sample_start {
        song.sample_start = v;
    }
    if let Some(v) = metadata.sample_length {
        song.sample_length = v;
    }
    if let Some(v) = metadata.offset {
        song.offset = v;
    }

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(())
}

#[tauri::command]
pub fn create_new_chart(
    state: State<'_, AppState>,
    song_path: String,
    steps_type: String,
    difficulty: String,
    meter: i32,
) -> Result<usize, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    let st = sm_core::StepsType::from_str_tag(&steps_type)
        .ok_or_else(|| format!("Unknown steps type: {}", steps_type))?;
    let diff = sm_core::Difficulty::from_str_tag(&difficulty)
        .ok_or_else(|| format!("Unknown difficulty: {}", difficulty))?;

    let new_chart = sm_chart::Chart {
        steps_type: st,
        description: String::new(),
        chart_name: String::new(),
        difficulty: diff,
        meter,
        radar_values: Vec::new(),
        credit: String::new(),
        note_data: NoteData::new(st.num_columns()),
        chart_timing: None,
    };

    song.charts.push(new_chart);
    let new_index = song.charts.len() - 1;

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(new_index)
}

/// Clone an existing chart (notes + per-chart timing) and append it. Sets `chart_name` for disambiguation.
#[tauri::command]
pub fn duplicate_chart(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: usize,
) -> Result<usize, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    if chart_index >= song.charts.len() {
        return Err(format!(
            "Chart index {} out of range (total charts: {})",
            chart_index,
            song.charts.len()
        ));
    }

    let mut new_chart = song.charts[chart_index].clone();
    let src_name = song.charts[chart_index].chart_name.clone();
    new_chart.chart_name = if src_name.is_empty() {
        "Copy".to_string()
    } else {
        format!("{} (Copy)", src_name)
    };

    song.charts.push(new_chart);
    let new_index = song.charts.len() - 1;

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(new_index)
}

#[tauri::command]
pub fn delete_chart(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: usize,
) -> Result<(), String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    if chart_index >= song.charts.len() {
        return Err(format!(
            "Chart index {} out of range (total: {})",
            chart_index,
            song.charts.len()
        ));
    }

    song.charts.remove(chart_index);

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(())
}

#[tauri::command]
pub fn update_chart_properties(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: usize,
    steps_type: String,
    difficulty: String,
    meter: i32,
) -> Result<(), String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    let total = song.charts.len();
    let chart = song
        .charts
        .get_mut(chart_index)
        .ok_or_else(|| format!("Chart index {} out of range (total: {})", chart_index, total))?;

    let st = sm_core::StepsType::from_str_tag(&steps_type)
        .ok_or_else(|| format!("Unknown steps type: {}", steps_type))?;
    let diff = sm_core::Difficulty::from_str_tag(&difficulty)
        .ok_or_else(|| format!("Unknown difficulty: {}", difficulty))?;

    resize_chart_note_data(&mut chart.note_data, st);
    chart.steps_type = st;
    chart.difficulty = diff;
    chart.meter = meter;

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(())
}

// --- BPM Changes API ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmChange {
    pub beat: f64,
    pub bpm: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSignatureChange {
    pub beat: f64,
    pub numerator: i32,
    pub denominator: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TickcountChange {
    pub beat: f64,
    pub ticks_per_beat: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboChange {
    pub beat: f64,
    pub combo: i32,
    pub miss_combo: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedChange {
    pub beat: f64,
    pub ratio: f64,
    pub delay: f64,
    pub unit: u8, // 0 = beats, 1 = seconds
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollChange {
    pub beat: f64,
    pub ratio: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelChange {
    pub beat: f64,
    pub label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingDataResponse {
    pub bpms: Vec<BpmChange>,
    pub stops: Vec<(f64, f64)>,  // (beat, duration)
    pub delays: Vec<(f64, f64)>, // (beat, duration)
    pub time_signatures: Vec<TimeSignatureChange>,
    pub tickcounts: Vec<TickcountChange>,
    pub combos: Vec<ComboChange>,
    pub speeds: Vec<SpeedChange>,
    pub scrolls: Vec<ScrollChange>,
    pub labels: Vec<LabelChange>,
    pub offset: f64,
}

fn resolve_chart_timing_ref<'a>(
    song: &'a sm_chart::SongFile,
    chart_index: Option<usize>,
) -> &'a sm_timing::TimingData {
    match chart_index {
        Some(idx) => song
            .charts
            .get(idx)
            .and_then(|c| c.chart_timing.as_ref())
            .unwrap_or(&song.timing),
        None => &song.timing,
    }
}

fn timing_data_to_response(timing: &sm_timing::TimingData) -> TimingDataResponse {
    TimingDataResponse {
        bpms: timing
            .bpms
            .iter()
            .map(|b| BpmChange {
                beat: b.beat,
                bpm: b.bpm,
            })
            .collect(),
        stops: timing.stops.iter().map(|s| (s.beat, s.duration)).collect(),
        delays: timing.delays.iter().map(|d| (d.beat, d.duration)).collect(),
        time_signatures: timing
            .time_signatures
            .iter()
            .map(|ts| TimeSignatureChange {
                beat: ts.beat,
                numerator: ts.numerator,
                denominator: ts.denominator,
            })
            .collect(),
        tickcounts: timing
            .tickcounts
            .iter()
            .map(|tc| TickcountChange {
                beat: tc.beat,
                ticks_per_beat: tc.ticks_per_beat,
            })
            .collect(),
        combos: timing
            .combos
            .iter()
            .map(|c| ComboChange {
                beat: c.beat,
                combo: c.hit_mult,
                miss_combo: c.miss_mult,
            })
            .collect(),
        speeds: timing
            .speeds
            .iter()
            .map(|s| SpeedChange {
                beat: s.beat,
                ratio: s.ratio,
                delay: s.duration,
                unit: if s.unit == sm_timing::SpeedUnit::Seconds {
                    1
                } else {
                    0
                },
            })
            .collect(),
        scrolls: timing
            .scrolls
            .iter()
            .map(|s| ScrollChange {
                beat: s.beat,
                ratio: s.factor,
            })
            .collect(),
        labels: timing
            .labels
            .iter()
            .map(|l| LabelChange {
                beat: l.beat,
                label: l.text.clone(),
            })
            .collect(),
        offset: timing.offset,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartPlayBundle {
    pub notes: Vec<ChartNoteRow>,
    pub timing: TimingDataResponse,
}

/// One IPC round-trip: note rows + timing for each chart index (same order as `chart_indices`).
#[tauri::command]
pub fn get_chart_play_payload(
    state: State<'_, AppState>,
    song_path: String,
    chart_indices: Vec<usize>,
) -> Result<Vec<ChartPlayBundle>, String> {
    if chart_indices.is_empty() {
        return Err("chart_indices must not be empty".to_string());
    }
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let song = parse_chart_cached(&state, &chart_path)?;
    let mut out = Vec::with_capacity(chart_indices.len());
    for &idx in &chart_indices {
        if idx >= song.charts.len() {
            return Err(format!(
                "Chart index {} out of range (total charts: {})",
                idx,
                song.charts.len()
            ));
        }
        let notes = extract_chart_note_rows(&song, idx)?;
        let timing_ref = resolve_chart_timing_ref(&song, Some(idx));
        let timing = timing_data_to_response(timing_ref);
        out.push(ChartPlayBundle { notes, timing });
    }
    Ok(out)
}

#[tauri::command]
pub fn get_bpm_changes(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: Option<usize>,
) -> Result<TimingDataResponse, String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let song = parse_chart_cached(&state, &chart_path)?;
    let timing = resolve_chart_timing_ref(&song, chart_index);
    Ok(timing_data_to_response(timing))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmChangesUpdate {
    pub bpms: Vec<BpmChange>,
    pub stops: Option<Vec<(f64, f64)>>,
    pub delays: Option<Vec<(f64, f64)>>,
    pub time_signatures: Option<Vec<TimeSignatureChange>>,
    pub tickcounts: Option<Vec<TickcountChange>>,
    pub combos: Option<Vec<ComboChange>>,
    pub speeds: Option<Vec<SpeedChange>>,
    pub scrolls: Option<Vec<ScrollChange>>,
    pub labels: Option<Vec<LabelChange>>,
    pub offset: Option<f64>,
}

#[tauri::command]
pub fn save_bpm_changes(
    state: State<'_, AppState>,
    song_path: String,
    chart_index: Option<usize>,
    update: BpmChangesUpdate,
) -> Result<(), String> {
    let chart_path = resolve_chart_path(&state, &song_path)?;
    let mut song =
        sm_chart::parse_file(&chart_path.to_string_lossy()).map_err(|e| e.to_string())?;

    // Get the timing to update (song-level or chart-level)
    let timing = if let Some(idx) = chart_index {
        // Ensure chart exists
        if idx >= song.charts.len() {
            return Err(format!("Chart index {} out of range", idx));
        }
        // Get or create chart-specific timing
        song.charts[idx]
            .chart_timing
            .get_or_insert_with(sm_timing::TimingData::default)
    } else {
        &mut song.timing
    };

    // Update BPMs
    timing.bpms = update
        .bpms
        .into_iter()
        .map(|b| sm_timing::BpmSegment {
            beat: b.beat,
            bpm: b.bpm,
        })
        .collect();

    // Update stops if provided
    if let Some(stops) = update.stops {
        timing.stops = stops
            .into_iter()
            .map(|(beat, duration)| sm_timing::StopSegment { beat, duration })
            .collect();
    }

    // Update delays if provided
    if let Some(delays) = update.delays {
        timing.delays = delays
            .into_iter()
            .map(|(beat, duration)| sm_timing::DelaySegment { beat, duration })
            .collect();
    }

    // Update offset if provided
    if let Some(offset) = update.offset {
        timing.offset = offset;
        if chart_index.is_none() {
            song.offset = offset;
        }
    }

    // Update time signatures if provided
    if let Some(sigs) = update.time_signatures {
        timing.time_signatures = sigs
            .into_iter()
            .map(|ts| sm_timing::TimeSignatureSegment {
                beat: ts.beat,
                numerator: ts.numerator,
                denominator: ts.denominator,
            })
            .collect();
    }

    // Update tickcounts if provided
    if let Some(tcs) = update.tickcounts {
        timing.tickcounts = tcs
            .into_iter()
            .map(|tc| sm_timing::TickcountSegment {
                beat: tc.beat,
                ticks_per_beat: tc.ticks_per_beat,
            })
            .collect();
    }

    // Update combos if provided
    if let Some(combos) = update.combos {
        timing.combos = combos
            .into_iter()
            .map(|c| sm_timing::ComboSegment {
                beat: c.beat,
                hit_mult: c.combo,
                miss_mult: c.miss_combo,
            })
            .collect();
    }

    // Update speeds if provided
    if let Some(speeds) = update.speeds {
        timing.speeds = speeds
            .into_iter()
            .map(|s| {
                let unit = if s.unit == 1 {
                    sm_timing::SpeedUnit::Seconds
                } else {
                    sm_timing::SpeedUnit::Beats
                };
                sm_timing::SpeedSegment {
                    beat: s.beat,
                    ratio: s.ratio,
                    duration: s.delay,
                    unit,
                }
            })
            .collect();
    }

    // Update scrolls if provided
    if let Some(scrolls) = update.scrolls {
        timing.scrolls = scrolls
            .into_iter()
            .map(|s| sm_timing::ScrollSegment {
                beat: s.beat,
                factor: s.ratio,
            })
            .collect();
    }

    // Update labels if provided
    if let Some(labels) = update.labels {
        timing.labels = labels
            .into_iter()
            .map(|l| sm_timing::LabelSegment {
                beat: l.beat,
                text: l.label,
            })
            .collect();
    }

    write_chart_to_file(&chart_path, &song)?;

    refresh_song_list_entry(&state, chart_path.as_path());

    // Update cache
    if let Ok(mut cache) = state.chart_cache.lock() {
        cache.insert(chart_path, song);
    }

    Ok(())
}
