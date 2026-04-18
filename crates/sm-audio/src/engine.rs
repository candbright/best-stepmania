use crate::decoder::{self, AudioProbeInfo, DecodedAudio};
use crate::mixer::PlaybackState;
use crate::stream_ring::StreamingRing;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

struct StreamHandle(#[allow(dead_code)] cpal::Stream);
unsafe impl Send for StreamHandle {}
unsafe impl Sync for StreamHandle {}

const RING_CAP_SECONDS: u32 = 5;
const MAX_META_CACHE: usize = 50;

/// 音频设备信息（用于前端枚举和切换）
#[derive(Debug, Clone, serde::Serialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub struct AudioEngine {
    pub master_volume: f32,
    pub music_volume: f32,
    pub effect_volume: f32,
    playback: Option<Arc<PlaybackState>>,
    stream: Option<StreamHandle>,
    device_sample_rate: u32,
    device_channels: usize,
    current_device_id: Option<String>,
    /// 探测元数据缓存（无整首 PCM）
    meta_cache: HashMap<PathBuf, AudioProbeInfo>,
    meta_cache_order: Vec<PathBuf>,
    current_path: Option<PathBuf>,
    streaming_stop: Option<Arc<AtomicBool>>,
    streaming_handle: Option<JoinHandle<()>>,
}

unsafe impl Send for AudioEngine {}
unsafe impl Sync for AudioEngine {}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop_streaming_thread();
    }
}

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
            meta_cache: HashMap::new(),
            meta_cache_order: Vec::new(),
            current_path: None,
            streaming_stop: None,
            streaming_handle: None,
        }
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        Self::default()
    }

    fn stop_streaming_thread(&mut self) {
        if let Some(stop) = self.streaming_stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
        if let Some(h) = self.streaming_handle.take() {
            let _ = h.join();
        }
    }

    fn meta_cache_insert(&mut self, path: PathBuf, meta: AudioProbeInfo) {
        if self.meta_cache.contains_key(&path) {
            self.meta_cache_order.retain(|p| p != &path);
            self.meta_cache_order.push(path.clone());
            self.meta_cache.insert(path, meta);
            return;
        }
        while self.meta_cache.len() >= MAX_META_CACHE {
            if let Some(oldest) = self.meta_cache_order.first().cloned() {
                if Some(&oldest) != self.current_path.as_ref() {
                    self.meta_cache_order.remove(0);
                    self.meta_cache.remove(&oldest);
                    continue;
                }
                break;
            }
        }
        self.meta_cache_order.push(path.clone());
        self.meta_cache.insert(path, meta);
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
            .map_err(|e| format!("Failed to get default output config: {e}"))?;

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
            .map(|p| p.playing.load(Ordering::Relaxed))
            .unwrap_or(false);

        self.stream = None;
        self.playback = None;
        self.current_device_id = None;
        self.ensure_stream()?;

        if let Some(ref path) = saved_path {
            self.start_streaming_at(path, saved_position, was_playing)?;
        }

        Ok(())
    }

    /// 从路径启动流式解码并挂载到 playback（或仅静音就绪：`autoplay == false`）。
    pub fn start_streaming_at(
        &mut self,
        path: &Path,
        start_second: f64,
        autoplay: bool,
    ) -> Result<(), String> {
        let probe = if let Some(m) = self.meta_cache.get(path) {
            m.clone()
        } else {
            let m = decoder::probe_file(path)?;
            self.meta_cache_insert(path.to_path_buf(), m.clone());
            m
        };

        self.stop_streaming_thread();

        let channels = probe.channels.max(1) as usize;
        let sample_rate = probe.sample_rate;
        let total_frames = probe.total_frames;

        let ring = Arc::new(StreamingRing::new(
            channels,
            sample_rate,
            RING_CAP_SECONDS,
        ));
        let start_frame = (start_second * f64::from(sample_rate)).max(0.0) as u64;
        ring.begin_session(total_frames, start_frame);

        let stop = Arc::new(AtomicBool::new(false));
        let path_owned = path.to_path_buf();
        let ring_thread = Arc::clone(&ring);
        let stop_thread = Arc::clone(&stop);

        let handle = std::thread::spawn(move || {
            let _ = decoder::run_streaming_decode(&path_owned, ring_thread, start_second, stop_thread);
        });

        self.streaming_stop = Some(stop);
        self.streaming_handle = Some(handle);
        self.current_path = Some(path.to_path_buf());

        self.ensure_stream()?;
        if let Some(ref pb) = self.playback {
            let vol = if autoplay {
                self.music_volume as f64 * self.master_volume as f64
            } else {
                0.0
            };
            pb.swap_track_streaming(
                ring,
                probe.channels,
                sample_rate,
                total_frames,
                start_second,
                vol,
            );
            if !autoplay {
                pb.pause();
                pb.set_volume(self.music_volume as f64 * self.master_volume as f64);
            }
        }
        Ok(())
    }

    /// 将已完整解码的数据载入（测试或特殊路径）；走内存轨。
    pub fn load_decoded(&mut self, path: &Path, decoded: DecodedAudio) -> Result<(), String> {
        self.stop_streaming_thread();
        let samples = Arc::new(decoded.samples);
        let sample_rate = decoded.sample_rate;
        let channels = decoded.channels;
        let probe = AudioProbeInfo {
            duration_seconds: samples.len() as f64 / channels as f64 / sample_rate as f64,
            sample_rate,
            channels,
            total_frames: (samples.len() / channels as usize) as u64,
        };
        self.meta_cache_insert(path.to_path_buf(), probe);
        self.ensure_stream()?;
        self.current_path = Some(path.to_path_buf());
        if let Some(ref pb) = self.playback {
            pb.swap_track(
                samples,
                channels,
                sample_rate,
                0.0,
                0.0,
            );
            pb.pause();
            pb.set_volume(self.music_volume as f64 * self.master_volume as f64);
        }
        Ok(())
    }

    /// 从路径加载：流式打开，不整文件解码。
    pub fn load_music(&mut self, path: &Path) -> Result<(), String> {
        self.start_streaming_at(path, 0.0, false)
    }

    /// 若可 probe 则立即启动流式预览（优先使用元数据缓存）。
    pub fn preview_quick(&mut self, path: &Path, start: f64) -> bool {
        if self.ensure_stream().is_err() {
            return false;
        }
        if !self.meta_cache.contains_key(path) {
            match decoder::probe_file(path) {
                Ok(m) => self.meta_cache_insert(path.to_path_buf(), m),
                Err(_) => return false,
            }
        }
        self.start_streaming_at(path, start, true).is_ok()
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

    pub fn stop(&mut self) {
        if let Some(ref p) = self.playback {
            p.pause();
        }
        self.current_path = None;
        self.stop_streaming_thread();
    }

    pub fn clear_cache(&mut self) {
        self.meta_cache.clear();
        self.meta_cache_order.clear();
    }

    pub fn seek(&mut self, seconds: f64) {
        let path = match self.current_path.clone() {
            Some(p) => p,
            None => return,
        };
        if self
            .playback
            .as_ref()
            .map(|p| p.is_streaming_track())
            .unwrap_or(false)
        {
            let was_playing = self
                .playback
                .as_ref()
                .map(|p| p.playing.load(Ordering::Relaxed))
                .unwrap_or(false);
            let _ = self.start_streaming_at(&path, seconds, was_playing);
            return;
        }
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
            .map(|p| p.playing.load(Ordering::Relaxed))
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
        self.meta_cache.contains_key(path)
    }

    /// 仅缓存元数据（probe），不解码 PCM。
    pub fn cache_probe_only(&mut self, path: &Path) -> Result<(), String> {
        if self.meta_cache.contains_key(path) {
            return Ok(());
        }
        let meta = decoder::probe_file(path)?;
        self.meta_cache_insert(path.to_path_buf(), meta);
        Ok(())
    }
}
