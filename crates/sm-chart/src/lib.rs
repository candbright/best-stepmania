pub mod encoding;
mod pump_sm_layout;
pub mod single_chart_sm;
pub mod sm_parser;
pub mod sm_writer;
pub mod ssc_parser;
mod tag_parser;

pub use single_chart_sm::build_single_chart_sm_song;

use serde::{Deserialize, Serialize};
use sm_core::{Difficulty, NoteData, StepsType};
use sm_timing::TimingData;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum ChartError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error at line {line}: {message}")]
    Parse { line: usize, message: String },
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("Invalid note data: {0}")]
    InvalidNoteData(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongFile {
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub title_translit: String,
    pub subtitle_translit: String,
    pub artist_translit: String,
    pub genre: String,
    pub credit: String,
    pub music: String,
    pub banner: String,
    pub background: String,
    pub lyrics_path: String,
    pub cd_title: String,
    pub jacket: String,
    pub sample_start: f64,
    pub sample_length: f64,
    pub display_bpm: DisplayBpm,
    pub selectable: bool,
    pub offset: f64,
    pub timing: TimingData,
    pub bg_changes: Vec<String>,
    pub fg_changes: Vec<String>,
    pub keysounds: Vec<String>,
    pub charts: Vec<Chart>,
}

impl Default for SongFile {
    fn default() -> Self {
        Self {
            title: String::new(),
            subtitle: String::new(),
            artist: String::new(),
            title_translit: String::new(),
            subtitle_translit: String::new(),
            artist_translit: String::new(),
            genre: String::new(),
            credit: String::new(),
            music: String::new(),
            banner: String::new(),
            background: String::new(),
            lyrics_path: String::new(),
            cd_title: String::new(),
            jacket: String::new(),
            sample_start: -1.0,
            sample_length: 12.0,
            display_bpm: DisplayBpm::Actual,
            selectable: true,
            offset: 0.0,
            timing: TimingData::default(),
            bg_changes: Vec::new(),
            fg_changes: Vec::new(),
            keysounds: Vec::new(),
            charts: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DisplayBpm {
    Actual,
    Specified(f64),
    Range(f64, f64),
    Random,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chart {
    pub steps_type: StepsType,
    pub description: String,
    pub chart_name: String,
    pub difficulty: Difficulty,
    pub meter: i32,
    pub radar_values: Vec<f64>,
    pub credit: String,
    pub note_data: NoteData,
    pub chart_timing: Option<TimingData>,
    /// First line of `#NOTES` as in the source `.sm` (e.g. `hard`) when it is not a valid [`StepsType`] tag.
    #[serde(default)]
    pub sm_notes_primary_tag: Option<String>,
    /// When true, `.sm` export writes the third metadata line from [`Chart::chart_name`] (community misplaced header).
    #[serde(default)]
    pub sm_misplaced_notes_header: bool,
    /// Right-hand side of the `//--------------- left - right ---------------` banner; defaults to [`Chart::description`] when unset.
    #[serde(default)]
    pub sm_banner_right: Option<String>,
}

/// Parse a chart file (SM or SSC) from the given path.
/// Automatically detects file encoding (UTF-8, GBK, Shift-JIS, EUC-KR, etc.)
pub fn parse_file(path: &str) -> Result<SongFile, ChartError> {
    let path = Path::new(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let content = encoding::read_file_auto_encoding(path)?;

    match ext.as_str() {
        "sm" => sm_parser::parse(&content),
        "ssc" => ssc_parser::parse(&content),
        _ => Err(ChartError::UnsupportedFormat(ext)),
    }
}

/// Parse a chart file from a string with explicit format.
pub fn parse_str(content: &str, format: &str) -> Result<SongFile, ChartError> {
    match format {
        "sm" => sm_parser::parse(content),
        "ssc" => ssc_parser::parse(content),
        _ => Err(ChartError::UnsupportedFormat(format.to_string())),
    }
}
