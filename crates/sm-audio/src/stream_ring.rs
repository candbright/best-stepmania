//! 固定容量环形缓冲：按绝对帧索引存储交错 f32 样本，供解码线程写入、cpal 回调读取。
//! SPSC：写端仅解码线程，读端仅 `fill_buffer`；配合 `write_end` Release / Acquire 建立先后关系。

use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub struct StreamingRing {
    pub channels: usize,
    cap_frames: u64,
    buf: UnsafeCell<Vec<f32>>,
    /// 已写入的下一绝对帧下标（写完帧 `f` 后值为 `f + 1`）
    pub write_end: AtomicU64,
    /// 播放侧当前读位置下界（`floor(pos)`），用于背压
    pub read_floor: AtomicU64,
    /// 文件总帧数（未知则为 0）
    pub total_frames: AtomicU64,
    pub decode_done: AtomicBool,
}

unsafe impl Sync for StreamingRing {}

impl StreamingRing {
    pub fn new(channels: usize, sample_rate: u32, cap_seconds: u32) -> Self {
        let cap_frames = u64::from(sample_rate) * u64::from(cap_seconds);
        let cap_samples = cap_frames as usize * channels;
        Self {
            channels,
            cap_frames,
            buf: UnsafeCell::new(vec![0.0_f32; cap_samples]),
            write_end: AtomicU64::new(0),
            read_floor: AtomicU64::new(0),
            total_frames: AtomicU64::new(0),
            decode_done: AtomicBool::new(false),
        }
    }

    /// 开始新的流式会话：`start_frame` 为首个待解码的绝对帧索引。
    pub fn begin_session(&self, total_frames: u64, start_frame: u64) {
        unsafe {
            (*self.buf.get()).fill(0.0);
        }
        self.write_end.store(start_frame, Ordering::SeqCst);
        self.read_floor.store(start_frame, Ordering::SeqCst);
        self.total_frames.store(total_frames, Ordering::SeqCst);
        self.decode_done.store(false, Ordering::SeqCst);
    }

    /// 读取绝对帧 `frame` 的声道 `ch`。若尚未解码或已被覆盖则返回 `None`。
    pub fn sample_at(&self, frame: u64, ch: usize) -> Option<f32> {
        if ch >= self.channels {
            return None;
        }
        let we = self.write_end.load(Ordering::Acquire);
        if frame >= we {
            return None;
        }
        let cap = self.cap_frames;
        if frame < we.saturating_sub(cap) {
            return None;
        }
        let idx = (frame % cap) as usize * self.channels + ch;
        unsafe { Some((&(*self.buf.get()))[idx]) }
    }

    /// 写入绝对帧 `frame_index` 的一帧交错样本（长度须为 channels）。
    pub fn write_frame(&self, frame_index: u64, interleaved: &[f32]) -> Result<(), String> {
        if interleaved.len() != self.channels {
            return Err("bad interleaved frame length".to_string());
        }
        let cap = self.cap_frames;
        let base = (frame_index % cap) as usize * self.channels;
        unsafe {
            (&mut (*self.buf.get()))[base..base + self.channels].copy_from_slice(interleaved);
        }
        self.write_end
            .store(frame_index.saturating_add(1), Ordering::Release);
        Ok(())
    }

    pub fn cap_frames(&self) -> u64 {
        self.cap_frames
    }
}
