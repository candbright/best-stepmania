use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// 可热替换的音轨数据
pub struct TrackData {
    pub samples: Arc<Vec<f32>>,
    pub channels: u32,
    pub sample_rate: u32,
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
            track: Mutex::new(TrackData {
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
        // 先暂停，避免 callback 读取到中间状态
        self.playing.store(false, Ordering::SeqCst);

        // 替换音轨
        if let Ok(mut t) = self.track.lock() {
            t.samples = samples;
            t.channels = channels;
            t.sample_rate = sample_rate;
        }

        // seek 到目标位置
        let frame = (start_second * sample_rate as f64) as u64;
        self.position.store(f64::to_bits(frame as f64), Ordering::SeqCst);

        // 设置音量并开始播放
        self.volume.store(f64::to_bits(volume.clamp(0.0, 2.0)), Ordering::SeqCst);
        self.playing.store(true, Ordering::SeqCst);
    }

    pub fn set_volume(&self, v: f64) {
        self.volume.store(f64::to_bits(v.clamp(0.0, 2.0)), Ordering::Relaxed);
    }

    pub fn get_volume(&self) -> f64 {
        f64::from_bits(self.volume.load(Ordering::Relaxed))
    }

    pub fn set_rate(&self, r: f64) {
        self.rate.store(f64::to_bits(r.clamp(0.1, 3.0)), Ordering::Relaxed);
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
        // sample_rate from current track
        let sr = self.track.lock().map(|t| t.sample_rate).unwrap_or(44100);
        let frame = (second * sr as f64) as u64;
        self.position.store(f64::to_bits(frame as f64), Ordering::Relaxed);
    }

    pub fn current_second(&self) -> f64 {
        let sr = self.track.lock().map(|t| t.sample_rate).unwrap_or(44100);
        let frame = f64::from_bits(self.position.load(Ordering::Relaxed));
        frame / sr as f64
    }

    pub fn duration_seconds(&self) -> f64 {
        if let Ok(t) = self.track.lock() {
            let total_frames = t.samples.len() as f64 / t.channels as f64;
            total_frames / t.sample_rate as f64
        } else {
            0.0
        }
    }

    /// Audio callback — 在 cpal 音频线程中调用，尽量减少锁争用
    pub fn fill_buffer(&self, output: &mut [f32], out_channels: usize) {
        if !self.playing.load(Ordering::Relaxed) {
            for s in output.iter_mut() { *s = 0.0; }
            return;
        }

        // try_lock：若 swap_track 持有锁则输出静音（极短暂，<1ms）
        let track = match self.track.try_lock() {
            Ok(t) => t,
            Err(_) => {
                for s in output.iter_mut() { *s = 0.0; }
                return;
            }
        };

        let volume = self.get_volume() as f32;
        let rate = self.get_rate();
        let src_channels = track.channels as usize;
        let total_frames = track.samples.len() / src_channels;
        let resample_ratio = track.sample_rate as f64 / self.device_sample_rate as f64;
        let advance_per_frame = rate * resample_ratio;

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

            let src_offset = src_frame * src_channels;
            for ch in 0..out_channels {
                let src_ch = ch % src_channels;
                output[frame * out_channels + ch] = track.samples[src_offset + src_ch] * volume;
            }
            pos += advance_per_frame;
        }

        self.position.store(f64::to_bits(pos), Ordering::Relaxed);
    }
}
