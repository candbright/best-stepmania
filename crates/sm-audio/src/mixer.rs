use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::stream_ring::StreamingRing;

/// 可热替换的音轨数据
pub enum TrackData {
    Memory {
        samples: Arc<Vec<f32>>,
        channels: u32,
        sample_rate: u32,
    },
    Streaming {
        ring: Arc<StreamingRing>,
        channels: u32,
        sample_rate: u32,
        total_frames: u64,
    },
}

impl TrackData {
    fn sample_rate(&self) -> u32 {
        match self {
            TrackData::Memory { sample_rate, .. } => *sample_rate,
            TrackData::Streaming { sample_rate, .. } => *sample_rate,
        }
    }
}

/// 播放状态 — 所有字段均支持无锁/低锁访问，可在 audio callback 中安全读取
pub struct PlaybackState {
    /// 当前音轨（可热替换，不重建 stream）
    pub track: Mutex<TrackData>,
    pub device_sample_rate: u32,
    pub position: AtomicU64,
    pub playing: AtomicBool,
    pub volume: AtomicU64,
    pub rate: AtomicU64,
}

impl PlaybackState {
    pub fn new(
        samples: Vec<f32>,
        channels: u32,
        sample_rate: u32,
        device_sample_rate: u32,
    ) -> Arc<Self> {
        Arc::new(Self {
            track: Mutex::new(TrackData::Memory {
                samples: Arc::new(samples),
                channels,
                sample_rate,
            }),
            device_sample_rate,
            position: AtomicU64::new(0),
            playing: AtomicBool::new(false),
            volume: AtomicU64::new(f64::to_bits(1.0)),
            rate: AtomicU64::new(f64::to_bits(1.0)),
        })
    }

    /// 热替换音轨数据，不重建 stream。替换后立即从 start_second 开始播放。
    pub fn swap_track(
        &self,
        samples: Arc<Vec<f32>>,
        channels: u32,
        sample_rate: u32,
        start_second: f64,
        volume: f64,
    ) {
        self.playing.store(false, Ordering::SeqCst);

        if let Ok(mut t) = self.track.lock() {
            *t = TrackData::Memory {
                samples,
                channels,
                sample_rate,
            };
        }

        let frame = (start_second * sample_rate as f64) as u64;
        self.position
            .store(f64::to_bits(frame as f64), Ordering::SeqCst);

        self.volume
            .store(f64::to_bits(volume.clamp(0.0, 2.0)), Ordering::SeqCst);
        self.playing.store(true, Ordering::SeqCst);
    }

    pub fn swap_track_streaming(
        &self,
        ring: Arc<StreamingRing>,
        channels: u32,
        sample_rate: u32,
        total_frames: u64,
        start_second: f64,
        volume: f64,
    ) {
        self.playing.store(false, Ordering::SeqCst);

        if let Ok(mut t) = self.track.lock() {
            *t = TrackData::Streaming {
                ring,
                channels,
                sample_rate,
                total_frames,
            };
        }

        let frame = (start_second * sample_rate as f64) as u64;
        self.position
            .store(f64::to_bits(frame as f64), Ordering::SeqCst);

        self.volume
            .store(f64::to_bits(volume.clamp(0.0, 2.0)), Ordering::SeqCst);
        self.playing.store(true, Ordering::SeqCst);
    }

    pub fn is_streaming_track(&self) -> bool {
        self.track
            .lock()
            .map(|t| matches!(*t, TrackData::Streaming { .. }))
            .unwrap_or(false)
    }

    pub fn set_volume(&self, v: f64) {
        self.volume
            .store(f64::to_bits(v.clamp(0.0, 2.0)), Ordering::Relaxed);
    }

    pub fn get_volume(&self) -> f64 {
        f64::from_bits(self.volume.load(Ordering::Relaxed))
    }

    pub fn set_rate(&self, r: f64) {
        self.rate
            .store(f64::to_bits(r.clamp(0.1, 3.0)), Ordering::Relaxed);
    }

    pub fn get_rate(&self) -> f64 {
        f64::from_bits(self.rate.load(Ordering::Relaxed))
    }

    pub fn play(&self) {
        self.playing.store(true, Ordering::Relaxed);
    }

    pub fn pause(&self) {
        self.playing.store(false, Ordering::Relaxed);
    }

    pub fn seek_to_second(&self, second: f64) {
        if self.is_streaming_track() {
            // 流式定位由 AudioEngine 停止线程并 swap_track_streaming 完成
            return;
        }
        let sr = self.track.lock().map(|t| t.sample_rate()).unwrap_or(44100);
        let frame = (second * sr as f64) as u64;
        self.position
            .store(f64::to_bits(frame as f64), Ordering::Relaxed);
    }

    pub fn current_second(&self) -> f64 {
        let sr = self.track.lock().map(|t| t.sample_rate()).unwrap_or(44100);
        let frame = f64::from_bits(self.position.load(Ordering::Relaxed));
        frame / sr as f64
    }

    pub fn duration_seconds(&self) -> f64 {
        if let Ok(t) = self.track.lock() {
            match &*t {
                TrackData::Memory {
                    samples,
                    channels,
                    sample_rate,
                } => {
                    let total_frames = samples.len() as f64 / *channels as f64;
                    total_frames / *sample_rate as f64
                }
                TrackData::Streaming {
                    total_frames,
                    sample_rate,
                    ..
                } => {
                    if *total_frames == 0 {
                        0.0
                    } else {
                        *total_frames as f64 / *sample_rate as f64
                    }
                }
            }
        } else {
            0.0
        }
    }

    pub fn fill_buffer(&self, output: &mut [f32], out_channels: usize) {
        if !self.playing.load(Ordering::Relaxed) {
            // 暂停时仍推进流式 read_floor（与 playback position 对齐），避免解码线程在背压里空转、切歌 join 卡死
            if let Ok(t) = self.track.try_lock() {
                if let TrackData::Streaming { ring, .. } = &*t {
                    let pos = f64::from_bits(self.position.load(Ordering::Relaxed));
                    ring.read_floor.store(pos.floor() as u64, Ordering::Release);
                }
            }
            for s in output.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        let track = match self.track.try_lock() {
            Ok(t) => t,
            Err(_) => {
                for s in output.iter_mut() {
                    *s = 0.0;
                }
                return;
            }
        };

        let volume = self.get_volume() as f32;
        let rate = self.get_rate();

        match &*track {
            TrackData::Memory {
                samples,
                channels,
                sample_rate,
            } => {
                self.fill_buffer_memory(
                    samples,
                    *channels as usize,
                    *sample_rate,
                    output,
                    out_channels,
                    volume,
                    rate,
                );
            }
            TrackData::Streaming {
                ring,
                channels,
                sample_rate,
                total_frames,
            } => {
                self.fill_buffer_streaming(
                    ring,
                    *channels as usize,
                    *sample_rate,
                    *total_frames,
                    output,
                    out_channels,
                    volume,
                    rate,
                );
            }
        }
    }

    fn fill_buffer_memory(
        &self,
        samples: &Arc<Vec<f32>>,
        src_channels: usize,
        sample_rate: u32,
        output: &mut [f32],
        out_channels: usize,
        volume: f32,
        rate: f64,
    ) {
        let resample_ratio = sample_rate as f64 / self.device_sample_rate as f64;
        let advance_per_frame = rate * resample_ratio;
        let total_frames = samples.len() / src_channels;
        let out_frames = output.len() / out_channels;
        let mut pos = f64::from_bits(self.position.load(Ordering::Relaxed));

        for frame in 0..out_frames {
            let src_frame = pos as usize;
            if src_frame >= total_frames {
                for ch in 0..out_channels {
                    output[frame * out_channels + ch] = 0.0;
                }
                self.playing.store(false, Ordering::Relaxed);
                continue;
            }

            let frac = pos - src_frame as f64;
            let src_offset = src_frame * src_channels;
            let is_last_frame = src_frame >= total_frames - 1;

            for ch in 0..out_channels {
                let src_ch = ch % src_channels;
                let s0 = samples[src_offset + src_ch];
                let s1 = if is_last_frame {
                    s0
                } else {
                    samples[src_offset + src_channels + src_ch]
                };
                output[frame * out_channels + ch] = (s0 + (s1 - s0) * frac as f32) * volume;
            }
            pos += advance_per_frame;
        }

        self.position.store(f64::to_bits(pos), Ordering::Relaxed);
    }

    fn fill_buffer_streaming(
        &self,
        ring: &Arc<StreamingRing>,
        src_channels: usize,
        sample_rate: u32,
        total_frames: u64,
        output: &mut [f32],
        out_channels: usize,
        volume: f32,
        rate: f64,
    ) {
        let resample_ratio = sample_rate as f64 / self.device_sample_rate as f64;
        let advance_per_frame = rate * resample_ratio;
        let out_frames = output.len() / out_channels;
        let mut pos = f64::from_bits(self.position.load(Ordering::Relaxed));

        for frame in 0..out_frames {
            let src_frame = pos as u64;
            let we = ring.write_end.load(Ordering::Acquire);
            let done = ring.decode_done.load(Ordering::Relaxed);

            let at_end = if total_frames > 0 {
                pos >= total_frames as f64
            } else {
                done && src_frame >= we
            };

            if at_end {
                for ch in 0..out_channels {
                    output[frame * out_channels + ch] = 0.0;
                }
                self.playing.store(false, Ordering::Relaxed);
                continue;
            }

            let frac = pos - src_frame as f64;

            for ch in 0..out_channels {
                let src_ch = ch % src_channels;
                let s0 = ring.sample_at(src_frame, src_ch).unwrap_or(0.0);
                let s1 = ring
                    .sample_at(src_frame.saturating_add(1), src_ch)
                    .unwrap_or(s0);
                output[frame * out_channels + ch] = (s0 + (s1 - s0) * frac as f32) * volume;
            }

            pos += advance_per_frame;
        }

        ring.read_floor.store(pos.floor() as u64, Ordering::Release);
        self.position.store(f64::to_bits(pos), Ordering::Relaxed);
    }
}
