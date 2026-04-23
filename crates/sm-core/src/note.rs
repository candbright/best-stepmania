use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TapNoteType {
    Empty,
    Tap,
    HoldHead,
    HoldTail,
    Mine,
    Lift,
    Fake,
    AutoKeysound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TapNoteSubType {
    Hold,
    Roll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TapNote {
    pub note_type: TapNoteType,
    pub sub_type: Option<TapNoteSubType>,
    /// Duration in rows (for holds/rolls)
    pub hold_duration: Option<i32>,
    pub keysound_index: Option<usize>,
    pub player_number: Option<u8>,
    /// Pump/dance routine: `1` = note data before `&`, `2` = after `&` (parallel or stacked layer).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routine_layer: Option<u8>,
}

impl TapNote {
    pub fn tap() -> Self {
        Self {
            note_type: TapNoteType::Tap,
            sub_type: None,
            hold_duration: None,
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn mine() -> Self {
        Self {
            note_type: TapNoteType::Mine,
            sub_type: None,
            hold_duration: None,
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn hold(duration_rows: i32) -> Self {
        Self {
            note_type: TapNoteType::HoldHead,
            sub_type: Some(TapNoteSubType::Hold),
            hold_duration: Some(duration_rows),
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn roll(duration_rows: i32) -> Self {
        Self {
            note_type: TapNoteType::HoldHead,
            sub_type: Some(TapNoteSubType::Roll),
            hold_duration: Some(duration_rows),
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn lift() -> Self {
        Self {
            note_type: TapNoteType::Lift,
            sub_type: None,
            hold_duration: None,
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn fake() -> Self {
        Self {
            note_type: TapNoteType::Fake,
            sub_type: None,
            hold_duration: None,
            keysound_index: None,
            player_number: None,
            routine_layer: None,
        }
    }

    pub fn is_scoreable(&self) -> bool {
        matches!(
            self.note_type,
            TapNoteType::Tap | TapNoteType::HoldHead | TapNoteType::Lift
        )
    }

    pub fn is_empty(&self) -> bool {
        self.note_type == TapNoteType::Empty
    }
}

/// Sparse storage of notes: each track maps row -> TapNote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteData {
    pub num_tracks: usize,
    pub tracks: Vec<BTreeMap<i32, TapNote>>,
}

impl NoteData {
    pub fn new(num_tracks: usize) -> Self {
        Self {
            num_tracks,
            tracks: (0..num_tracks).map(|_| BTreeMap::new()).collect(),
        }
    }

    pub fn set_note(&mut self, track: usize, row: i32, note: TapNote) {
        if track < self.num_tracks {
            self.tracks[track].insert(row, note);
        }
    }

    pub fn get_note(&self, track: usize, row: i32) -> Option<&TapNote> {
        self.tracks.get(track)?.get(&row)
    }

    pub fn total_tap_notes(&self) -> usize {
        self.tracks
            .iter()
            .flat_map(|t| t.values())
            .filter(|n| n.is_scoreable())
            .count()
    }

    pub fn last_row(&self) -> i32 {
        self.tracks
            .iter()
            .filter_map(|t| t.keys().next_back().copied())
            .max()
            .unwrap_or(0)
    }

    /// Returns all notes at a specific row across all tracks
    pub fn notes_at_row(&self, row: i32) -> Vec<(usize, &TapNote)> {
        self.tracks
            .iter()
            .enumerate()
            .filter_map(|(track, notes)| notes.get(&row).map(|n| (track, n)))
            .collect()
    }

    /// Returns an iterator over all rows that contain at least one note
    pub fn occupied_rows(&self) -> Vec<i32> {
        let mut rows: Vec<i32> = self.tracks.iter().flat_map(|t| t.keys().copied()).collect();
        rows.sort_unstable();
        rows.dedup();
        rows
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_note_data_basic() {
        let mut nd = NoteData::new(4);
        nd.set_note(0, 0, TapNote::tap());
        nd.set_note(2, 48, TapNote::tap());
        nd.set_note(1, 96, TapNote::hold(48));

        assert_eq!(nd.total_tap_notes(), 3);
        assert_eq!(nd.last_row(), 96);
        assert_eq!(nd.notes_at_row(0).len(), 1);
        assert_eq!(nd.occupied_rows(), vec![0, 48, 96]);
    }

    #[test]
    fn test_mine_not_scoreable() {
        let mine = TapNote::mine();
        assert!(!mine.is_scoreable());
    }
}
