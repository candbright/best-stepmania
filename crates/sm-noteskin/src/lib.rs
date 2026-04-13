use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSkinConfig {
    pub name: String,
    pub author: String,
    pub version: String,
    pub supports_rotation: bool,
    pub note_width: f64,
    pub note_height: f64,
    pub receptor_width: f64,
    pub receptor_height: f64,
    pub hold_body_width: f64,
    pub colors: NoteSkinColors,
    pub assets: NoteSkinAssets,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSkinColors {
    pub left: String,
    pub down: String,
    pub up: String,
    pub right: String,
    pub mine: String,
    pub hold_body: String,
    pub hold_cap: String,
    pub receptor_idle: String,
    pub receptor_active: String,
    pub judgment_line: String,
}

impl Default for NoteSkinColors {
    fn default() -> Self {
        Self {
            left: "#ff4081".to_string(),
            down: "#448aff".to_string(),
            up: "#ff1744".to_string(),
            right: "#69f0ae".to_string(),
            mine: "#ff5252".to_string(),
            hold_body: "#ffab40".to_string(),
            hold_cap: "#ff9100".to_string(),
            receptor_idle: "rgba(255,255,255,0.08)".to_string(),
            receptor_active: "#ffffff".to_string(),
            judgment_line: "rgba(255,255,255,0.15)".to_string(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NoteSkinAssets {
    pub tap_note: HashMap<String, PathBuf>,
    pub hold_head: HashMap<String, PathBuf>,
    pub hold_body: HashMap<String, PathBuf>,
    pub hold_tail: HashMap<String, PathBuf>,
    pub receptor: HashMap<String, PathBuf>,
    pub mine: Option<PathBuf>,
}

impl Default for NoteSkinConfig {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            author: "BestStepMania".to_string(),
            version: "1.0".to_string(),
            supports_rotation: true,
            note_width: 64.0,
            note_height: 64.0,
            receptor_width: 64.0,
            receptor_height: 64.0,
            hold_body_width: 48.0,
            colors: NoteSkinColors::default(),
            assets: NoteSkinAssets::default(),
        }
    }
}

impl NoteSkinConfig {
    pub fn load_from_file(path: &Path) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read noteskin config: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse noteskin config: {e}"))
    }

    pub fn color_for_track(&self, track: usize, num_tracks: usize) -> &str {
        if num_tracks == 4 {
            match track {
                0 => &self.colors.left,
                1 => &self.colors.down,
                2 => &self.colors.up,
                3 => &self.colors.right,
                _ => &self.colors.left,
            }
        } else {
            // Generic fallback for other modes
            let colors = [
                &self.colors.left,
                &self.colors.down,
                &self.colors.up,
                &self.colors.right,
            ];
            colors[track % colors.len()]
        }
    }
}

pub struct NoteSkinManager {
    pub skins: HashMap<String, NoteSkinConfig>,
    pub current: String,
}

impl NoteSkinManager {
    pub fn new() -> Self {
        let mut skins = HashMap::new();
        skins.insert("default".to_string(), NoteSkinConfig::default());

        // "flat" built-in skin
        let mut flat = NoteSkinConfig::default();
        flat.name = "flat".to_string();
        flat.colors = NoteSkinColors {
            left: "#e040fb".to_string(),
            down: "#40c4ff".to_string(),
            up: "#69f0ae".to_string(),
            right: "#ffd740".to_string(),
            mine: "#ff1744".to_string(),
            hold_body: "#7c4dff".to_string(),
            hold_cap: "#651fff".to_string(),
            receptor_idle: "rgba(255,255,255,0.06)".to_string(),
            receptor_active: "#ffffff".to_string(),
            judgment_line: "rgba(255,255,255,0.12)".to_string(),
        };
        skins.insert("flat".to_string(), flat);

        // "neon" built-in skin — high-saturation glowing palette
        let mut neon = NoteSkinConfig::default();
        neon.name = "neon".to_string();
        neon.colors = NoteSkinColors {
            left: "#ff00aa".to_string(),
            down: "#00ddff".to_string(),
            up: "#ff2200".to_string(),
            right: "#00ff88".to_string(),
            mine: "#ff0000".to_string(),
            hold_body: "#bb00ff".to_string(),
            hold_cap: "#8800ff".to_string(),
            receptor_idle: "rgba(255,255,255,0.07)".to_string(),
            receptor_active: "#ffffff".to_string(),
            judgment_line: "rgba(255,255,255,0.13)".to_string(),
        };
        skins.insert("neon".to_string(), neon);

        // "retro" built-in skin — warm CRT-inspired palette
        let mut retro = NoteSkinConfig::default();
        retro.name = "retro".to_string();
        retro.colors = NoteSkinColors {
            left: "#ff6600".to_string(),
            down: "#00bb44".to_string(),
            up: "#cc2200".to_string(),
            right: "#ffcc00".to_string(),
            mine: "#ff3333".to_string(),
            hold_body: "#996600".to_string(),
            hold_cap: "#774400".to_string(),
            receptor_idle: "rgba(255,200,100,0.07)".to_string(),
            receptor_active: "#ffeecc".to_string(),
            judgment_line: "rgba(255,200,100,0.13)".to_string(),
        };
        skins.insert("retro".to_string(), retro);

        Self {
            skins,
            current: "default".to_string(),
        }
    }

    pub fn get_current(&self) -> &NoteSkinConfig {
        self.skins.get(&self.current).unwrap_or_else(|| {
            self.skins
                .get("default")
                .expect("Default noteskin must exist")
        })
    }

    pub fn set_current(&mut self, name: &str) -> bool {
        if self.skins.contains_key(name) {
            self.current = name.to_string();
            true
        } else {
            false
        }
    }

    pub fn get_by_name(&self, name: &str) -> Option<&NoteSkinConfig> {
        self.skins.get(name)
    }

    pub fn load_from_directory(&mut self, dir: &Path) -> Result<usize, String> {
        let mut count = 0;
        if !dir.exists() {
            return Ok(0);
        }

        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let config_path = path.join("noteskin.json");
                if config_path.exists() {
                    if let Ok(config) = NoteSkinConfig::load_from_file(&config_path) {
                        self.skins.insert(config.name.clone(), config);
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    pub fn list_skins(&self) -> Vec<String> {
        self.skins.keys().cloned().collect()
    }
}

impl Default for NoteSkinManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_noteskin() {
        let ns = NoteSkinConfig::default();
        assert_eq!(ns.name, "default");
        assert_eq!(ns.note_width, 64.0);
    }

    #[test]
    fn test_noteskin_manager() {
        let mgr = NoteSkinManager::new();
        assert!(mgr.skins.contains_key("default"));
        assert!(mgr.skins.contains_key("flat"));
        assert!(mgr.skins.contains_key("neon"));
        assert!(mgr.skins.contains_key("retro"));
        assert_eq!(mgr.get_current().name, "default");
    }

    #[test]
    fn test_color_for_track() {
        let ns = NoteSkinConfig::default();
        assert_eq!(ns.color_for_track(0, 4), "#ff4081");
        assert_eq!(ns.color_for_track(1, 4), "#448aff");
    }
}
