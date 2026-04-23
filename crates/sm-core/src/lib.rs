pub mod difficulty;
pub mod game_types;
pub mod note;

pub use difficulty::Difficulty;
pub use game_types::{PlayMode, StepsType, StepsTypeCategory};
pub use note::{NoteData, TapNote, TapNoteSubType, TapNoteType};

pub const ROWS_PER_BEAT: i32 = 48;
pub const MAX_TRACKS: usize = 16;

pub fn beat_to_row(beat: f64) -> i32 {
    (beat * ROWS_PER_BEAT as f64).round() as i32
}

pub fn row_to_beat(row: i32) -> f64 {
    row as f64 / ROWS_PER_BEAT as f64
}

pub fn row_to_quantization(row: i32) -> NoteQuantization {
    let beat_row = row % ROWS_PER_BEAT;
    if beat_row == 0 {
        NoteQuantization::Fourth
    } else if beat_row % (ROWS_PER_BEAT / 2) == 0 {
        NoteQuantization::Eighth
    } else if beat_row % (ROWS_PER_BEAT / 3) == 0 {
        NoteQuantization::Twelfth
    } else if beat_row % (ROWS_PER_BEAT / 4) == 0 {
        NoteQuantization::Sixteenth
    } else if beat_row % (ROWS_PER_BEAT / 6) == 0 {
        NoteQuantization::TwentyFourth
    } else if beat_row % (ROWS_PER_BEAT / 8) == 0 {
        NoteQuantization::ThirtySecond
    } else if beat_row % (ROWS_PER_BEAT / 12) == 0 {
        NoteQuantization::FortyEighth
    } else if beat_row % (ROWS_PER_BEAT / 16) == 0 {
        NoteQuantization::SixtyFourth
    } else {
        NoteQuantization::OneNinetySecond
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum NoteQuantization {
    Fourth,
    Eighth,
    Twelfth,
    Sixteenth,
    TwentyFourth,
    ThirtySecond,
    FortyEighth,
    SixtyFourth,
    OneNinetySecond,
}
