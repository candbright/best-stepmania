use crate::high_score::HighScore;
use crate::profile::Profile;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::Path;
use uuid::Uuid;

/// Max high-score rows kept per profile + song + steps type + difficulty (best N by DP%).
pub const TOP_SCORES_CAP: usize = 10;

pub struct ProfileDb {
    conn: Connection,
}

impl ProfileDb {
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_played_at TEXT NOT NULL,
                total_play_count INTEGER NOT NULL DEFAULT 0,
                total_dance_points INTEGER NOT NULL DEFAULT 0,
                total_play_time_secs REAL NOT NULL DEFAULT 0.0,
                default_speed_mod TEXT NOT NULL DEFAULT 'C500',
                default_noteskin TEXT NOT NULL DEFAULT 'default'
            );

            CREATE TABLE IF NOT EXISTS high_scores (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL REFERENCES profiles(id),
                song_path TEXT NOT NULL,
                steps_type TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                meter INTEGER NOT NULL DEFAULT 0,
                grade TEXT NOT NULL,
                dp_percent REAL NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                max_combo INTEGER NOT NULL DEFAULT 0,
                w1 INTEGER NOT NULL DEFAULT 0,
                w2 INTEGER NOT NULL DEFAULT 0,
                w3 INTEGER NOT NULL DEFAULT 0,
                w4 INTEGER NOT NULL DEFAULT 0,
                w5 INTEGER NOT NULL DEFAULT 0,
                miss INTEGER NOT NULL DEFAULT 0,
                held INTEGER NOT NULL DEFAULT 0,
                let_go INTEGER NOT NULL DEFAULT 0,
                mines_hit INTEGER NOT NULL DEFAULT 0,
                modifiers TEXT NOT NULL DEFAULT '',
                played_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_hs_profile ON high_scores(profile_id);
            CREATE INDEX IF NOT EXISTS idx_hs_song ON high_scores(song_path, steps_type, difficulty);

            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_path TEXT NOT NULL UNIQUE
            );
            ",
        )?;
        Ok(())
    }

    // --- Profile CRUD ---

    pub fn create_profile(&self, profile: &Profile) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO profiles (id, display_name, created_at, last_played_at, total_play_count, total_dance_points, total_play_time_secs, default_speed_mod, default_noteskin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                profile.id.to_string(),
                profile.display_name,
                profile.created_at.to_rfc3339(),
                profile.last_played_at.to_rfc3339(),
                profile.total_play_count,
                profile.total_dance_points,
                profile.total_play_time_secs,
                profile.default_speed_mod,
                profile.default_noteskin,
            ],
        )?;
        Ok(())
    }

    pub fn get_profiles(&self) -> Result<Vec<Profile>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, display_name, created_at, last_played_at, total_play_count, total_dance_points, total_play_time_secs, default_speed_mod, default_noteskin FROM profiles ORDER BY last_played_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Profile {
                id: row.get::<_, String>(0)?.parse().unwrap_or_default(),
                display_name: row.get(1)?,
                created_at: row
                    .get::<_, String>(2)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
                last_played_at: row
                    .get::<_, String>(3)?
                    .parse()
                    .unwrap_or_else(|_| Utc::now()),
                total_play_count: row.get::<_, u32>(4)?,
                total_dance_points: row.get::<_, i64>(5)?,
                total_play_time_secs: row.get::<_, f64>(6)?,
                default_speed_mod: row.get(7)?,
                default_noteskin: row.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn update_profile_stats(
        &self,
        profile_id: &Uuid,
        dance_points: i64,
        play_time_secs: f64,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE profiles SET total_play_count = total_play_count + 1, total_dance_points = total_dance_points + ?1, total_play_time_secs = total_play_time_secs + ?2, last_played_at = ?3 WHERE id = ?4",
            params![dance_points, play_time_secs, Utc::now().to_rfc3339(), profile_id.to_string()],
        )?;
        Ok(())
    }

    // --- High Scores ---

    pub fn save_high_score(&mut self, hs: &HighScore) -> Result<(), rusqlite::Error> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO high_scores (id, profile_id, song_path, steps_type, difficulty, meter, grade, dp_percent, score, max_combo, w1, w2, w3, w4, w5, miss, held, let_go, mines_hit, modifiers, played_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                hs.id.to_string(), hs.profile_id.to_string(),
                hs.song_path, hs.steps_type, hs.difficulty, hs.meter,
                hs.grade, hs.dp_percent, hs.score, hs.max_combo,
                hs.w1, hs.w2, hs.w3, hs.w4, hs.w5, hs.miss,
                hs.held, hs.let_go, hs.mines_hit, hs.modifiers,
                hs.played_at.to_rfc3339(),
            ],
        )?;
        tx.execute(
            "DELETE FROM high_scores WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY dp_percent DESC, played_at DESC, id DESC
                           ) AS rn
                    FROM high_scores
                    WHERE profile_id = ?1 AND song_path = ?2 AND steps_type = ?3 AND difficulty = ?4
                ) WHERE rn > ?5
            )",
            params![
                hs.profile_id.to_string(),
                &hs.song_path,
                &hs.steps_type,
                &hs.difficulty,
                TOP_SCORES_CAP as i64,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn get_top_scores(
        &self,
        profile_id: &Uuid,
        song_path: &str,
        steps_type: &str,
        difficulty: &str,
        limit: usize,
    ) -> Result<Vec<HighScore>, rusqlite::Error> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        let lim = limit.min(TOP_SCORES_CAP);
        let mut stmt = self.conn.prepare(
            "SELECT id, profile_id, song_path, steps_type, difficulty, meter, grade, dp_percent, score, max_combo, w1, w2, w3, w4, w5, miss, held, let_go, mines_hit, modifiers, played_at
             FROM high_scores
             WHERE profile_id = ?1 AND song_path = ?2 AND steps_type = ?3 AND difficulty = ?4
             ORDER BY dp_percent DESC, played_at DESC, id DESC
             LIMIT ?5",
        )?;
        let rows = stmt.query_map(
            params![
                profile_id.to_string(),
                song_path,
                steps_type,
                difficulty,
                lim as i64
            ],
            |row| row_to_high_score(row),
        )?;
        rows.collect()
    }

    /// Removes all stored high scores for one chart key (profile + song path + steps type + difficulty).
    pub fn clear_top_scores_for_chart(
        &self,
        profile_id: &Uuid,
        song_path: &str,
        steps_type: &str,
        difficulty: &str,
    ) -> Result<usize, rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM high_scores WHERE profile_id = ?1 AND song_path = ?2 AND steps_type = ?3 AND difficulty = ?4",
            params![
                profile_id.to_string(),
                song_path,
                steps_type,
                difficulty,
            ],
        )
    }

    pub fn get_recent_scores(
        &self,
        profile_id: &Uuid,
        limit: usize,
    ) -> Result<Vec<HighScore>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, profile_id, song_path, steps_type, difficulty, meter, grade, dp_percent, score, max_combo, w1, w2, w3, w4, w5, miss, held, let_go, mines_hit, modifiers, played_at FROM high_scores WHERE profile_id = ?1 ORDER BY played_at DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![profile_id.to_string(), limit as u32], |row| {
            row_to_high_score(row)
        })?;
        rows.collect()
    }

    // --- Favorites ---

    pub fn toggle_favorite(&self, song_path: &str) -> Result<bool, rusqlite::Error> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM favorites WHERE song_path = ?1",
                params![song_path],
                |_row| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            self.conn.execute(
                "DELETE FROM favorites WHERE song_path = ?1",
                params![song_path],
            )?;
            Ok(false)
        } else {
            self.conn.execute(
                "INSERT INTO favorites (song_path) VALUES (?1)",
                params![song_path],
            )?;
            Ok(true)
        }
    }

    pub fn is_favorite(&self, song_path: &str) -> Result<bool, rusqlite::Error> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM favorites WHERE song_path = ?1",
                params![song_path],
                |_row| Ok(true),
            )
            .unwrap_or(false);
        Ok(exists)
    }

    pub fn get_favorites(&self) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT song_path FROM favorites ORDER BY song_path")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    pub fn cleanup_orphaned_favorites(
        &self,
        valid_song_paths: &[String],
    ) -> Result<usize, rusqlite::Error> {
        let valid_set: std::collections::HashSet<String> =
            valid_song_paths.iter().cloned().collect();
        let favorites = self.get_favorites()?;
        let mut removed = 0;
        for fav in favorites {
            if !valid_set.contains(&fav) {
                self.conn
                    .execute("DELETE FROM favorites WHERE song_path = ?1", params![fav])?;
                removed += 1;
            }
        }
        Ok(removed)
    }
}

fn row_to_high_score(row: &rusqlite::Row) -> Result<HighScore, rusqlite::Error> {
    Ok(HighScore {
        id: row.get::<_, String>(0)?.parse().unwrap_or_default(),
        profile_id: row.get::<_, String>(1)?.parse().unwrap_or_default(),
        song_path: row.get(2)?,
        steps_type: row.get(3)?,
        difficulty: row.get(4)?,
        meter: row.get(5)?,
        grade: row.get(6)?,
        dp_percent: row.get(7)?,
        score: row.get(8)?,
        max_combo: row.get(9)?,
        w1: row.get(10)?,
        w2: row.get(11)?,
        w3: row.get(12)?,
        w4: row.get(13)?,
        w5: row.get(14)?,
        miss: row.get(15)?,
        held: row.get(16)?,
        let_go: row.get(17)?,
        mines_hit: row.get(18)?,
        modifiers: row.get(19)?,
        played_at: row
            .get::<_, String>(20)?
            .parse()
            .unwrap_or_else(|_| Utc::now()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_profile_crud() {
        let db = ProfileDb::open_in_memory().unwrap();
        let p = Profile::new("TestPlayer");
        db.create_profile(&p).unwrap();
        let profiles = db.get_profiles().unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].display_name, "TestPlayer");
    }

    #[test]
    fn test_high_score() {
        let mut db = ProfileDb::open_in_memory().unwrap();
        let p = Profile::new("Player1");
        db.create_profile(&p).unwrap();

        let hs = HighScore {
            id: Uuid::new_v4(),
            profile_id: p.id,
            song_path: "Songs/Pack/Song".to_string(),
            steps_type: "dance-single".to_string(),
            difficulty: "Hard".to_string(),
            meter: 10,
            grade: "SS".to_string(),
            dp_percent: 0.92,
            score: 98500,
            max_combo: 350,
            w1: 200,
            w2: 100,
            w3: 40,
            w4: 5,
            w5: 0,
            miss: 0,
            held: 20,
            let_go: 2,
            mines_hit: 0,
            modifiers: "C500".to_string(),
            played_at: Utc::now(),
        };
        db.save_high_score(&hs).unwrap();

        let top = db
            .get_top_scores(&p.id, "Songs/Pack/Song", "dance-single", "Hard", 10)
            .unwrap();
        assert_eq!(top.len(), 1);
        assert!((top[0].dp_percent - 0.92).abs() < 0.001);

        let lower = HighScore {
            id: Uuid::new_v4(),
            profile_id: p.id,
            song_path: "Songs/Pack/Song".to_string(),
            steps_type: "dance-single".to_string(),
            difficulty: "Hard".to_string(),
            meter: 10,
            grade: "A".to_string(),
            dp_percent: 0.75,
            score: 75000,
            max_combo: 200,
            w1: 100,
            w2: 100,
            w3: 50,
            w4: 10,
            w5: 5,
            miss: 5,
            held: 10,
            let_go: 1,
            mines_hit: 0,
            modifiers: "C500".to_string(),
            played_at: Utc::now(),
        };
        db.save_high_score(&lower).unwrap();
        let top2 = db
            .get_top_scores(&p.id, "Songs/Pack/Song", "dance-single", "Hard", 10)
            .unwrap();
        assert_eq!(top2.len(), 2);
        assert!((top2[0].dp_percent - 0.92).abs() < 0.001);
        assert!((top2[1].dp_percent - 0.75).abs() < 0.001);
    }

    #[test]
    fn test_clear_top_scores_for_chart() {
        let mut db = ProfileDb::open_in_memory().unwrap();
        let p = Profile::new("P");
        db.create_profile(&p).unwrap();

        let hs = HighScore {
            id: Uuid::new_v4(),
            profile_id: p.id,
            song_path: "Songs/A".to_string(),
            steps_type: "pump-single".to_string(),
            difficulty: "Hard".to_string(),
            meter: 10,
            grade: "A".to_string(),
            dp_percent: 0.8,
            score: 80000,
            max_combo: 200,
            w1: 100,
            w2: 50,
            w3: 20,
            w4: 5,
            w5: 0,
            miss: 0,
            held: 0,
            let_go: 0,
            mines_hit: 0,
            modifiers: "".to_string(),
            played_at: Utc::now(),
        };
        db.save_high_score(&hs).unwrap();
        assert_eq!(
            db.get_top_scores(&p.id, "Songs/A", "pump-single", "Hard", 10)
                .unwrap()
                .len(),
            1
        );

        let n = db
            .clear_top_scores_for_chart(&p.id, "Songs/A", "pump-single", "Hard")
            .unwrap();
        assert_eq!(n, 1);
        assert!(db
            .get_top_scores(&p.id, "Songs/A", "pump-single", "Hard", 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn test_high_score_prune_to_cap() {
        let mut db = ProfileDb::open_in_memory().unwrap();
        let p = Profile::new("P");
        db.create_profile(&p).unwrap();

        for i in 0..15 {
            let dp = 0.5 + (i as f64) * 0.01;
            let hs = HighScore {
                id: Uuid::new_v4(),
                profile_id: p.id,
                song_path: "S/X".to_string(),
                steps_type: "dance-single".to_string(),
                difficulty: "Hard".to_string(),
                meter: 9,
                grade: "B".to_string(),
                dp_percent: dp,
                score: 50000,
                max_combo: 100,
                w1: 50,
                w2: 50,
                w3: 20,
                w4: 5,
                w5: 0,
                miss: 0,
                held: 0,
                let_go: 0,
                mines_hit: 0,
                modifiers: "".to_string(),
                played_at: Utc::now(),
            };
            db.save_high_score(&hs).unwrap();
        }

        let top = db
            .get_top_scores(&p.id, "S/X", "dance-single", "Hard", TOP_SCORES_CAP)
            .unwrap();
        assert_eq!(top.len(), TOP_SCORES_CAP);
        assert!((top[0].dp_percent - 0.64).abs() < 0.001);
        assert!((top[9].dp_percent - 0.55).abs() < 0.001);
    }
}
