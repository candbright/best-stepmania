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

    /// 确保永久 stream 存在。首次调用时建立，之后不再重建。
    fn ensure_stream(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }

        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "No audio output device found".to_string())?;
        let config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get output config: {e}"))?;

        self.device_sample_rate = config.sample_rate().0;
        self.device_channels = config.channels() as usize;

        // 用空 samples 初始化 playback state（静音）
        let state = PlaybackState::new(
            vec![],
            self.device_channels as u32,
            self.device_sample_rate,
            self.device_sample_rate,
        );

        let playback_ref = Arc::clone(&state);
        let out_channels = self.device_channels;

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_output_stream(
                &config.into(),
                move |data: &mut [f32], _| {
                    playback_ref.fill_buffer(data, out_channels);
                },
                |err| eprintln!("Audio stream error: {err}"),
                None,
            ),
            cpal::SampleFormat::I16 => {
                let pb = Arc::clone(&state);
                device.build_output_stream(
                    &config.into(),
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

    /// 将解码数据存入缓存（不驱逐；内存随曲目增长，由 `clear_cache` 或设置页主动释放）
    fn cache_insert(&mut self, path: PathBuf, audio: CachedAudio) {
        if self.cache.contains_key(&path) {
            self.cache_order.retain(|p| p != &path);
            self.cache_order.push(path.clone());
            self.cache.insert(path, audio);
            return;
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
