use serde::{Deserialize, Serialize};
use sm_chart::SongFile;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// 歌曲包含的单个谱面信息（扫描时缓存，避免游戏中重复解析）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartEntry {
    pub steps_type: String,
    pub difficulty: String,
    pub meter: i32,
    pub chart_name: String,
    pub note_count: usize,
    pub num_tracks: usize,
    /// 在完整谱面列表中的原始索引（用于 get_chart_notes）
    pub chart_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongEntry {
    pub path: PathBuf,
    pub chart_file: PathBuf,
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub title_translit: String,
    pub artist_translit: String,
    pub genre: String,
    pub music_path: Option<PathBuf>,
    pub banner_path: Option<PathBuf>,
    pub background_path: Option<PathBuf>,
    pub jacket_path: Option<PathBuf>,
    pub sample_start: f64,
    pub sample_length: f64,
    pub display_bpm: String,
    pub pack_name: String,
    /// 已解析的谱面列表（按难度排序）
    pub charts: Vec<ChartEntry>,
}

pub struct SongManager {
    pub songs: Vec<SongEntry>,
}

impl SongManager {
    pub fn new() -> Self {
        Self { songs: Vec::new() }
    }

    pub fn song_count(&self) -> usize {
        self.songs.len()
    }

    pub fn scan_directory(&mut self, base_path: &str) -> Result<(), String> {
        let base = Path::new(base_path);
        if !base.exists() {
            return Err(format!("Directory not found: {}", base_path));
        }

        // StepMania directory structure: Songs/<Pack>/<Song>/<files>
        // We look for .ssc or .sm files
        for entry in WalkDir::new(base)
            .min_depth(1)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase());

            match ext.as_deref() {
                Some("ssc") | Some("sm") => {
                    if let Some(song_entry) = self.process_chart_file(path, base) {
                        // Check for duplicates (SSC takes priority over SM)
                        let song_dir = path.parent().unwrap_or(path);
                        let existing = self.songs.iter().position(|s| s.path == song_dir);
                        if let Some(idx) = existing {
                            if ext.as_deref() == Some("ssc") {
                                self.songs[idx] = song_entry;
                            }
                        } else {
                            self.songs.push(song_entry);
                        }
                    }
                }
                _ => {}
            }
        }

        Ok(())
    }

    /// Re-parse a chart file from disk and replace the matching [`SongEntry`] (same song folder).
    /// Call after editor writes so `get_song_list` reflects chart adds/removes.
    pub fn refresh_song_for_chart_file(
        &mut self,
        chart_path: &Path,
        songs_base: &Path,
    ) -> Result<(), String> {
        let Some(new_entry) = self.process_chart_file(chart_path, songs_base) else {
            return Err(format!(
                "Failed to re-parse chart file: {}",
                chart_path.display()
            ));
        };
        let song_dir = new_entry.path.clone();
        if let Some(idx) = self.songs.iter().position(|s| s.path == song_dir) {
            self.songs[idx] = new_entry;
        } else {
            self.songs.push(new_entry);
        }
        Ok(())
    }

    fn process_chart_file(&self, chart_path: &Path, base_path: &Path) -> Option<SongEntry> {
        let bytes = std::fs::read(chart_path).ok()?;
        let content = sm_chart::encoding::decode_bytes_to_utf8(&bytes);
        let ext = chart_path.extension()?.to_str()?;

        let song_file = sm_chart::parse_str(&content, ext).ok()?;
        let song_dir = chart_path.parent()?;

        let pack_name = if let Ok(rel) = song_dir.strip_prefix(base_path) {
            let mut comps = rel.components();
            let first = comps
                .next()
                .and_then(|c| c.as_os_str().to_str())
                .unwrap_or("");
            if comps.next().is_some() {
                first.to_string()
            } else {
                String::new()
            }
        } else {
            song_dir
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string()
        };

        let display_bpm = format_display_bpm(&song_file);

        let music_path = if !song_file.music.is_empty() {
            let p = song_dir.join(&song_file.music);
            if p.exists() {
                Some(p)
            } else {
                None
            }
        } else {
            find_audio_file(song_dir)
        };

        let banner_path = resolve_asset(song_dir, &song_file.banner, &["bn", "banner"]);
        let background_path = resolve_asset(song_dir, &song_file.background, &["bg", "background"]);
        let jacket_path = if !song_file.jacket.is_empty() {
            let p = song_dir.join(&song_file.jacket);
            if p.exists() {
                Some(p)
            } else {
                None
            }
        } else {
            None
        };

        Some(SongEntry {
            path: song_dir.to_path_buf(),
            chart_file: chart_path.to_path_buf(),
            title: song_file.title,
            subtitle: song_file.subtitle,
            artist: song_file.artist,
            title_translit: song_file.title_translit,
            artist_translit: song_file.artist_translit,
            genre: song_file.genre,
            music_path,
            banner_path,
            background_path,
            jacket_path,
            sample_start: song_file.sample_start,
            sample_length: song_file.sample_length,
            display_bpm,
            pack_name,
            charts: song_file
                .charts
                .iter()
                .enumerate()
                .map(|(idx, c)| ChartEntry {
                    steps_type: c.steps_type.to_string(),
                    difficulty: c.difficulty.to_string(),
                    meter: c.meter,
                    chart_name: c.chart_name.clone(),
                    note_count: c.note_data.total_tap_notes(),
                    num_tracks: c.steps_type.num_columns(),
                    chart_index: idx,
                })
                .collect(),
        })
    }
}

impl Default for SongManager {
    fn default() -> Self {
        Self::new()
    }
}

fn format_display_bpm(song: &SongFile) -> String {
    match &song.display_bpm {
        sm_chart::DisplayBpm::Actual => {
            let min = song.timing.min_bpm();
            let max = song.timing.max_bpm();
            if (min - max).abs() < 0.01 {
                format!("{:.0}", min)
            } else {
                format!("{:.0}-{:.0}", min, max)
            }
        }
        sm_chart::DisplayBpm::Specified(v) => format!("{:.0}", v),
        sm_chart::DisplayBpm::Range(lo, hi) => format!("{:.0}-{:.0}", lo, hi),
        sm_chart::DisplayBpm::Random => "???".to_string(),
    }
}

fn find_audio_file(dir: &Path) -> Option<PathBuf> {
    let audio_exts = ["ogg", "mp3", "wav", "flac"];
    for ext in &audio_exts {
        for entry in std::fs::read_dir(dir).ok()? {
            let entry = entry.ok()?;
            let path = entry.path();
            if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase() == *ext)
                .unwrap_or(false)
            {
                return Some(path);
            }
        }
    }
    None
}

fn resolve_asset(dir: &Path, explicit: &str, prefixes: &[&str]) -> Option<PathBuf> {
    if !explicit.is_empty() {
        let p = dir.join(explicit);
        if p.exists() {
            return Some(p);
        }
    }
    let img_exts = ["png", "jpg", "jpeg", "gif", "bmp"];
    for prefix in prefixes {
        for ext in &img_exts {
            let candidate = dir.join(format!("{}.{}", prefix, ext));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}
