use crate::AppState;
use serde::Serialize;
use sm_audio::AudioEngine;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    pub duration: f64,
    pub sample_rate: u32,
}

/// Resolve a music path: try absolute first, then relative to songs_base_dir.
fn resolve_path(music_path: &str, base_dir: &str) -> Option<PathBuf> {
    let p = Path::new(music_path);
    if p.exists() {
        return Some(p.to_path_buf());
    }
    let alt = Path::new(base_dir).join(music_path);
    if alt.exists() {
        return Some(alt);
    }
    None
}

fn claim_or_reject_request_token(
    latest_token: &std::sync::Mutex<u64>,
    request_token: Option<u64>,
) -> Result<bool, String> {
    let Some(token) = request_token else {
        return Ok(true);
    };
    let mut latest = latest_token.lock().map_err(|e| e.to_string())?;
    if token < *latest {
        return Ok(false);
    }
    *latest = token;
    Ok(true)
}

fn is_current_request_token(
    latest_token: &std::sync::Mutex<u64>,
    request_token: Option<u64>,
) -> Result<bool, String> {
    let Some(token) = request_token else {
        return Ok(true);
    };
    let latest = latest_token.lock().map_err(|e| e.to_string())?;
    Ok(token == *latest)
}

/// Ensure an audio file is decoded and loaded into the engine's active stream.
/// Fast path: if the file is already in cache, just rebuilds the stream.
/// Slow path: decodes the file off-thread, stores in cache, then loads.
async fn ensure_audio_ready(
    audio_engine: &std::sync::Mutex<AudioEngine>,
    resolved: &PathBuf,
) -> Result<(), String> {
    let is_cached = {
        let engine = audio_engine.lock().map_err(|e| e.to_string())?;
        engine.is_cached(resolved)
    };
    if !is_cached {
        let path_clone = resolved.clone();
        let decoded = tauri::async_runtime::spawn_blocking(move || {
            sm_audio::decoder::decode_file(&path_clone)
        })
        .await
        .map_err(|e| format!("Decode task failed: {e}"))?
        .map_err(|e| e)?;
        let mut engine = audio_engine.lock().map_err(|e| e.to_string())?;
        engine.load_decoded(resolved, decoded)?;
    } else {
        let mut engine = audio_engine.lock().map_err(|e| e.to_string())?;
        engine.load_music(resolved)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn audio_load(
    state: State<'_, AppState>,
    music_path: String,
) -> Result<AudioInfo, String> {
    let base_dir = {
        state
            .songs_base_dir
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
    };

    let resolved = resolve_path(&music_path, &base_dir)
        .ok_or_else(|| format!("Audio file not found: {}", music_path))?;

    ensure_audio_ready(&state.audio_engine, &resolved).await?;

    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    Ok(AudioInfo {
        duration: engine.duration(),
        sample_rate: engine.sample_rate(),
    })
}

#[tauri::command]
pub fn audio_play(state: State<AppState>, request_token: Option<u64>) -> Result<(), String> {
    if !claim_or_reject_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.play();
    Ok(())
}

#[tauri::command]
pub fn audio_pause(state: State<AppState>, request_token: Option<u64>) -> Result<(), String> {
    if !claim_or_reject_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.pause();
    Ok(())
}

#[tauri::command]
pub fn audio_seek(
    state: State<AppState>,
    seconds: f64,
    request_token: Option<u64>,
) -> Result<(), String> {
    if !claim_or_reject_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.seek(seconds);
    Ok(())
}

#[tauri::command]
pub fn audio_get_time(state: State<AppState>) -> Result<f64, String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.current_time())
}

#[tauri::command]
pub fn audio_get_duration(state: State<AppState>) -> Result<f64, String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.duration())
}

#[tauri::command]
pub fn audio_is_playing(state: State<AppState>) -> Result<bool, String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.is_playing())
}

#[tauri::command]
pub fn audio_set_volume(
    state: State<AppState>,
    music_volume: Option<f32>,
    master_volume: Option<f32>,
) -> Result<(), String> {
    let mut engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    if let Some(v) = master_volume {
        engine.set_master_volume(v);
    }
    if let Some(v) = music_volume {
        engine.set_music_volume(v);
    }
    Ok(())
}

#[tauri::command]
pub fn audio_set_rate(state: State<AppState>, rate: f64) -> Result<(), String> {
    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.set_rate(rate);
    Ok(())
}

#[tauri::command]
pub fn audio_stop(state: State<AppState>, request_token: Option<u64>) -> Result<(), String> {
    if !claim_or_reject_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }
    let mut engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.stop();
    Ok(())
}

/// Clears all decoded PCM in memory. Normal flows keep cache for instant revisits; expose for settings/debug.
#[tauri::command]
pub fn audio_clear_cache(state: State<AppState>) -> Result<(), String> {
    let mut engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    engine.clear_cache();
    Ok(())
}

/// Preview a song: decode async if not cached, then seek and play.
/// Uses fast path (no stream rebuild) when the same song is already cached.
#[tauri::command]
pub async fn audio_preview(
    state: State<'_, AppState>,
    music_path: String,
    start: f64,
    length: f64,
    request_token: Option<u64>,
) -> Result<(), String> {
    if !claim_or_reject_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }

    let base_dir = {
        state
            .songs_base_dir
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
    };

    let resolved = resolve_path(&music_path, &base_dir)
        .ok_or_else(|| format!("Audio file not found: {}", music_path))?;

    // Fast path: same song already cached and stream exists — just seek+play, no rebuild
    {
        let mut engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
        let duration = engine.duration();
        let actual_start = if start >= 0.0 {
            start
        } else {
            (duration / 2.0 - length / 2.0).max(0.0)
        };
        if engine.preview_quick(&resolved, actual_start) {
            return Ok(());
        }
    }

    // Slow path: decode if not cached, then load stream
    ensure_audio_ready(&state.audio_engine, &resolved).await?;
    if !is_current_request_token(&state.latest_audio_request_token, request_token)? {
        return Ok(());
    }

    let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    let duration = engine.duration();
    let actual_start = if start >= 0.0 {
        start
    } else {
        (duration / 2.0 - length / 2.0).max(0.0)
    };
    engine.seek(actual_start);
    engine.play();
    Ok(())
}

/// 后台预解码歌曲并存入缓存，不播放。
/// 前端可在用户浏览列表时提前调用，使切歌时能立即 preview_quick。
#[tauri::command]
pub async fn audio_preload(
    state: State<'_, AppState>,
    music_path: String,
) -> Result<(), String> {
    let base_dir = {
        state
            .songs_base_dir
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
    };

    let resolved = resolve_path(&music_path, &base_dir)
        .ok_or_else(|| format!("Audio file not found: {}", music_path))?;

    // 已缓存则跳过
    {
        let engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
        if engine.is_cached(&resolved) {
            return Ok(());
        }
    }

    // 后台解码
    let path_clone = resolved.clone();
    let decoded = tauri::async_runtime::spawn_blocking(move || {
        sm_audio::decoder::decode_file(&path_clone)
    })
    .await
    .map_err(|e| format!("Preload task failed: {e}"))?
    .map_err(|e| e)?;

    // 存入缓存（不播放）
    let mut engine = state.audio_engine.lock().map_err(|e| e.to_string())?;
    // 仅缓存解码数据，不重建 stream，不影响当前播放
    engine.cache_only(&resolved, decoded);
    Ok(())
}
