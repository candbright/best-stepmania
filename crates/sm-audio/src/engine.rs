use crate::decoder;
use crate::mixer::PlaybackState;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

struct StreamHandle(#[allow(dead_code)] cpal::Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

/// 单首歌曲的解码缓存
#[derive(Clone)]
struct CachedAudio {
    samples: Arc<Vec<f32>>,
    sample_rate: u32,
    channels: u32,
}

/// 音频设备信息（用于前端枚举和切换）
#[derive(Debug, Clone, serde::Serialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

const MAX_CACHE_SIZE: usize = 50;

pub struct AudioEngine {
    pub master_volume: f32,
    pub music_volume: f32,
    pub effect_volume: f32,
    /// 永久 playback state — stream 建立后不再销毁
    playback: Option<Arc<PlaybackState>>,
    /// 永久 stream — 只建一次，切歌时通过 swap_track 热替换
    stream: Option<StreamHandle>,
    device_sample_rate: u32,
    device_channels: usize,
    /// 当前输出设备的 ID（用于检测设备切换）
    current_device_id: Option<String>,
    /// 多歌曲解码缓存（进程内保留至 `clear_cache` 或进程退出；不 LRU 驱逐）
    cache: HashMap<PathBuf, CachedAudio>,
    /// 插入顺序记录（用于未来策略/调试；更新已存在键时移到队尾）
    cache_order: Vec<PathBuf>,
    /// 当前正在播放/已加载的路径
    current_path: Option<PathBuf>,
}

unsafe impl Send for AudioEngine {}
unsafe impl Sync for AudioEngine {}

impl Default for AudioEngine {
    fn default() -> Self {
        Self {
            master_volume: 0.8,
            music_volume: 0.7,
            effect_volume: 0.9,
            playback: None,
            stream: None,
            device_sample_rate: 44100,
            device_channels: 2,
            current_device_id: None,
            cache: HashMap::new(),
            cache_order: Vec::new(),
            current_path: None,
        }
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// 确保永久 stream 存在。首次调用时建立，之后检测到默认设备变化时自动重建。
    fn ensure_stream(&mut self) -> Result<(), String> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "No audio output device found".to_string())?;
        let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());

        if let Some(stream) = self.stream.take() {
            if self.current_device_id.as_ref() == Some(&device_name) {
                self.stream = Some(stream);
                return Ok(());
            }
            drop(stream);
            self.playback = None;
        }

        let config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get output config: {e}"))?;

        self.device_sample_rate = config.sample_rate().0;
        self.device_channels = config.channels() as usize;
        self.current_device_id = Some(device_name);

        let state = PlaybackState::new(
            vec![],
            self.device_channels as u32,
            self.device_sample_rate,
            self.device_sample_rate,
        );

        let playback_ref = Arc::clone(&state);
        let out_channels = self.device_channels;

        let stream_config = config.clone();
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_output_stream(
                &stream_config.into(),
                move |data: &mut [f32], _| {
                    playback_ref.fill_buffer(data, out_channels);
                },
                |err| eprintln!("Audio stream error: {err}"),
                None,
            ),
            cpal::SampleFormat::I16 => {
                let pb = Arc::clone(&state);
                device.build_output_stream(
                    &stream_config.into(),
                    move |data: &mut [i16], _| {
                        let mut float_buf = vec![0.0f32; data.len()];
                        pb.fill_buffer(&mut float_buf, out_channels);
                        for (out, &s) in data.iter_mut().zip(float_buf.iter()) {
                            *out = (s * 32767.0).clamp(-32768.0, 32767.0) as i16;
                        }
                    },
                    |err| eprintln!("Audio stream error: {err}"),
                    None,
                )
            }
            fmt => return Err(format!("Unsupported sample format: {fmt:?}")),
        }
        .map_err(|e| format!("Failed to build audio stream: {e}"))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start stream: {e}"))?;

        self.playback = Some(state);
        self.stream = Some(StreamHandle(stream));
        Ok(())
    }

    /// 列出所有可用音频输出设备
    pub fn devices(&self) -> Vec<AudioDeviceInfo> {
        let host = cpal::default_host();
        let default_name = host.default_output_device().and_then(|d| d.name().ok());

        let mut result = Vec::new();
        if let Ok(devices) = host.devices() {
            for device in devices {
                let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
                let is_default = default_name.as_ref() == Some(&name);
                result.push(AudioDeviceInfo {
                    id: name.clone(),
                    name,
                    is_default,
                });
            }
        }
        result
    }

    /// 强制使用当前默认设备重建 stream（用于系统切换输出设备后手动触发）
    pub fn rebuild_stream(&mut self) -> Result<(), String> {
        let saved_path = self.current_path.clone();
        let saved_position = self
            .playback
            .as_ref()
            .map(|p| p.current_second())
            .unwrap_or(0.0);
        let was_playing = self
            .playback
            .as_ref()
            .map(|p| p.playing.load(std::sync::atomic::Ordering::Relaxed))
            .unwrap_or(false);

        self.stream = None;
        self.playback = None;
        self.current_device_id = None;
        self.ensure_stream()?;

        if let Some(ref path) = saved_path {
            if let Some(ref pb) = self.playback {
                if let Some(cached) = self.cache.get(path) {
                    let vol = if was_playing {
                        self.music_volume as f64 * self.master_volume as f64
                    } else {
                        0.0
                    };
                    pb.swap_track(
                        Arc::clone(&cached.samples),
                        cached.channels,
                        cached.sample_rate,
                        saved_position,
                        vol,
                    );
                    if !was_playing {
                        pb.pause();
                    }
                }
            }
        }

        Ok(())
    }

    fn cache_insert(&mut self, path: PathBuf, audio: CachedAudio) {
        if self.cache.contains_key(&path) {
            self.cache_order.retain(|p| p != &path);
            self.cache_order.push(path.clone());
            self.cache.insert(path, audio);
            return;
        }
        while self.cache.len() >= MAX_CACHE_SIZE {
            if let Some(oldest) = self.cache_order.first().cloned() {
                if Some(&oldest) != self.current_path.as_ref() {
                    self.cache_order.remove(0);
                    self.cache.remove(&oldest);
                    continue;
                }
                break;
            }
        }
        self.cache_order.push(path.clone());
        self.cache.insert(path, audio);
    }

    /// 将解码数据存入缓存（不影响当前播放的 stream）
    pub fn cache_only(&mut self, path: &Path, decoded: crate::decoder::DecodedAudio) {
        let audio = CachedAudio {
            samples: Arc::new(decoded.samples),
            sample_rate: decoded.sample_rate,
            channels: decoded.channels,
        };
        self.cache_insert(path.to_path_buf(), audio);
    }

    /// 加载已解码的音频（来自 async 命令的 spawn_blocking 结果）
    pub fn load_decoded(
        &mut self,
        path: &Path,
        decoded: crate::decoder::DecodedAudio,
    ) -> Result<(), String> {
        let samples = Arc::new(decoded.samples);
        let audio = CachedAudio {
            samples: Arc::clone(&samples),
            sample_rate: decoded.sample_rate,
            channels: decoded.channels,
        };
        self.cache_insert(path.to_path_buf(), audio);
        self.ensure_stream()?;
        self.apply_track(path, 0.0, false);
        Ok(())
    }

    /// 从路径加载（缓存命中则跳过解码）
    pub fn load_music(&mut self, path: &Path) -> Result<(), String> {
        if !self.cache.contains_key(path) {
            let decoded = decoder::decode_file(path)?;
            let audio = CachedAudio {
                samples: Arc::new(decoded.samples),
                sample_rate: decoded.sample_rate,
                channels: decoded.channels,
            };
            self.cache_insert(path.to_path_buf(), audio);
        }
        self.ensure_stream()?;
        self.apply_track(path, 0.0, false);
        Ok(())
    }

    /// 将缓存中的音轨热替换到 playback state，不重建 stream
    fn apply_track(&mut self, path: &Path, start_second: f64, autoplay: bool) {
        let audio = match self.cache.get(path) {
            Some(a) => a.clone(),
            None => return,
        };
        self.current_path = Some(path.to_path_buf());
        if let Some(ref pb) = self.playback {
            let vol = if autoplay {
                self.music_volume as f64 * self.master_volume as f64
            } else {
                0.0 // 静音，等待显式 play()
            };
            pb.swap_track(
                audio.samples,
                audio.channels,
                audio.sample_rate,
                start_second,
                vol,
            );
            if !autoplay {
                pb.pause();
                pb.set_volume(self.music_volume as f64 * self.master_volume as f64);
            }
        }
    }

    /// 快速预览：如果已缓存则立即 swap_track 播放，否则返回 false
    pub fn preview_quick(&mut self, path: &Path, start: f64) -> bool {
        if self.ensure_stream().is_err() {
            return false;
        }
        let audio = match self.cache.get(path) {
            Some(a) => a.clone(),
            None => return false,
        };
        self.current_path = Some(path.to_path_buf());
        if let Some(ref pb) = self.playback {
            pb.swap_track(
                audio.samples,
                audio.channels,
                audio.sample_rate,
                start,
                self.music_volume as f64 * self.master_volume as f64,
            );
            return true;
        }
        false
    }

    pub fn play(&self) {
        if let Some(ref p) = self.playback {
            p.play();
        }
    }

    pub fn pause(&self) {
        if let Some(ref p) = self.playback {
            p.pause();
        }
    }

    /// stop：暂停播放，保留 stream 和缓存
    pub fn stop(&mut self) {
        if let Some(ref p) = self.playback {
            p.pause();
        }
        self.current_path = None;
    }

    pub fn clear_cache(&mut self) {
        self.cache.clear();
        self.cache_order.clear();
    }

    pub fn seek(&self, seconds: f64) {
        if let Some(ref p) = self.playback {
            p.seek_to_second(seconds);
        }
    }

    pub fn current_time(&self) -> f64 {
        self.playback
            .as_ref()
            .map(|p| p.current_second())
            .unwrap_or(0.0)
    }

    pub fn duration(&self) -> f64 {
        self.playback
            .as_ref()
            .map(|p| p.duration_seconds())
            .unwrap_or(0.0)
    }

    pub fn is_playing(&self) -> bool {
        self.playback
            .as_ref()
            .map(|p| p.playing.load(std::sync::atomic::Ordering::Relaxed))
            .unwrap_or(false)
    }

    pub fn set_music_volume(&mut self, v: f32) {
        self.music_volume = v.clamp(0.0, 1.0);
        if let Some(ref p) = self.playback {
            p.set_volume(self.music_volume as f64 * self.master_volume as f64);
        }
    }

    pub fn set_master_volume(&mut self, v: f32) {
        self.master_volume = v.clamp(0.0, 1.0);
        if let Some(ref p) = self.playback {
            p.set_volume(self.music_volume as f64 * self.master_volume as f64);
        }
    }

    pub fn set_rate(&self, rate: f64) {
        if let Some(ref p) = self.playback {
            p.set_rate(rate);
        }
    }

    pub fn has_audio(&self) -> bool {
        self.playback.is_some()
    }

    pub fn sample_rate(&self) -> u32 {
        self.device_sample_rate
    }

    pub fn is_cached(&self, path: &Path) -> bool {
        self.cache.contains_key(path)
    }
}
