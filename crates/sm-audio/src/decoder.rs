use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

use crate::stream_ring::StreamingRing;

pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u32,
}

/// 探测结果（不解码 PCM）
#[derive(Debug, Clone)]
pub struct AudioProbeInfo {
    pub duration_seconds: f64,
    pub sample_rate: u32,
    pub channels: u32,
    pub total_frames: u64,
}

pub fn probe_file(path: &Path) -> Result<AudioProbeInfo, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    let format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "No audio track found".to_string())?;

    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2) as u32;
    let total_frames = track.codec_params.n_frames.unwrap_or(0);
    let duration_seconds = if total_frames > 0 {
        total_frames as f64 / f64::from(sample_rate)
    } else {
        0.0
    };

    Ok(AudioProbeInfo {
        duration_seconds,
        sample_rate,
        channels,
        total_frames,
    })
}

pub fn decode_file(path: &Path) -> Result<DecodedAudio, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "No audio track found".to_string())?;

    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let num_channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2) as usize;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    let mut all_samples: Vec<Vec<f32>> = vec![Vec::new(); num_channels];

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        match decoded {
            AudioBufferRef::F32(buf) => {
                for ch in 0..buf.spec().channels.count() {
                    all_samples[ch].extend_from_slice(buf.chan(ch));
                }
            }
            AudioBufferRef::S16(buf) => {
                for ch in 0..buf.spec().channels.count() {
                    all_samples[ch].extend(buf.chan(ch).iter().map(|&s| s as f32 / 32768.0));
                }
            }
            AudioBufferRef::S32(buf) => {
                for ch in 0..buf.spec().channels.count() {
                    all_samples[ch]
                        .extend(buf.chan(ch).iter().map(|&s| s as f32 / 2_147_483_648.0));
                }
            }
            _ => {}
        }
    }

    let num_channels = all_samples.len().max(1);
    let num_frames = all_samples.first().map(|c| c.len()).unwrap_or(0);
    let total_samples = num_frames * num_channels;

    let mut interleaved = Vec::with_capacity(total_samples);
    interleaved.resize(total_samples, 0.0_f32);

    for (frame, chunk) in interleaved.chunks_mut(num_channels).enumerate() {
        for (ch, sample) in chunk.iter_mut().enumerate() {
            *sample = all_samples[ch].get(frame).copied().unwrap_or(0.0);
        }
    }

    Ok(DecodedAudio {
        samples: interleaved,
        sample_rate,
        channels: num_channels as u32,
    })
}

const STREAM_CAP_MARGIN_FRAMES: u64 = 64;

enum EmitOutcome {
    Continue,
    EndOfTrack,
    Stopped,
}

fn emit_decoded_buffer(
    decoded: AudioBufferRef<'_>,
    ring: &StreamingRing,
    num_channels: usize,
    scratch_frame: &mut [f32],
    next_emit_frame: &mut u64,
    stop: &AtomicBool,
) -> Result<EmitOutcome, String> {
    let cap = ring.cap_frames();

    match decoded {
        AudioBufferRef::F32(buf) => {
            let n_frames = buf.frames();
            let ch_count = buf.spec().channels.count().min(num_channels);
            for f in 0..n_frames {
                if stop.load(Ordering::Relaxed) {
                    return Ok(EmitOutcome::Stopped);
                }
                loop {
                    if stop.load(Ordering::Relaxed) {
                        return Ok(EmitOutcome::Stopped);
                    }
                    let rf = ring.read_floor.load(Ordering::Acquire);
                    if *next_emit_frame < rf.saturating_add(cap).saturating_sub(STREAM_CAP_MARGIN_FRAMES)
                    {
                        break;
                    }
                    std::thread::yield_now();
                }
                for ch in 0..ch_count {
                    scratch_frame[ch] = buf.chan(ch)[f];
                }
                for ch in ch_count..num_channels {
                    scratch_frame[ch] = 0.0;
                }
                ring.write_frame(*next_emit_frame, scratch_frame)?;
                *next_emit_frame = next_emit_frame.saturating_add(1);
                let tf = ring.total_frames.load(Ordering::Relaxed);
                if tf > 0 && *next_emit_frame >= tf {
                    return Ok(EmitOutcome::EndOfTrack);
                }
            }
        }
        AudioBufferRef::S16(buf) => {
            let n_frames = buf.frames();
            let ch_count = buf.spec().channels.count().min(num_channels);
            for f in 0..n_frames {
                if stop.load(Ordering::Relaxed) {
                    return Ok(EmitOutcome::Stopped);
                }
                loop {
                    if stop.load(Ordering::Relaxed) {
                        return Ok(EmitOutcome::Stopped);
                    }
                    let rf = ring.read_floor.load(Ordering::Acquire);
                    if *next_emit_frame < rf.saturating_add(cap).saturating_sub(STREAM_CAP_MARGIN_FRAMES)
                    {
                        break;
                    }
                    std::thread::yield_now();
                }
                for ch in 0..ch_count {
                    scratch_frame[ch] = buf.chan(ch)[f] as f32 / 32768.0;
                }
                for ch in ch_count..num_channels {
                    scratch_frame[ch] = 0.0;
                }
                ring.write_frame(*next_emit_frame, scratch_frame)?;
                *next_emit_frame = next_emit_frame.saturating_add(1);
                let tf = ring.total_frames.load(Ordering::Relaxed);
                if tf > 0 && *next_emit_frame >= tf {
                    return Ok(EmitOutcome::EndOfTrack);
                }
            }
        }
        AudioBufferRef::S32(buf) => {
            let n_frames = buf.frames();
            let ch_count = buf.spec().channels.count().min(num_channels);
            for f in 0..n_frames {
                if stop.load(Ordering::Relaxed) {
                    return Ok(EmitOutcome::Stopped);
                }
                loop {
                    if stop.load(Ordering::Relaxed) {
                        return Ok(EmitOutcome::Stopped);
                    }
                    let rf = ring.read_floor.load(Ordering::Acquire);
                    if *next_emit_frame < rf.saturating_add(cap).saturating_sub(STREAM_CAP_MARGIN_FRAMES)
                    {
                        break;
                    }
                    std::thread::yield_now();
                }
                for ch in 0..ch_count {
                    scratch_frame[ch] = buf.chan(ch)[f] as f32 / 2_147_483_648.0;
                }
                for ch in ch_count..num_channels {
                    scratch_frame[ch] = 0.0;
                }
                ring.write_frame(*next_emit_frame, scratch_frame)?;
                *next_emit_frame = next_emit_frame.saturating_add(1);
                let tf = ring.total_frames.load(Ordering::Relaxed);
                if tf > 0 && *next_emit_frame >= tf {
                    return Ok(EmitOutcome::EndOfTrack);
                }
            }
        }
        _ => {}
    }
    Ok(EmitOutcome::Continue)
}

/// 在独立线程中按包解码并写入环形缓冲，直到 EOF 或 `stop`。
pub fn run_streaming_decode(
    path: &Path,
    ring: Arc<StreamingRing>,
    start_second: f64,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Failed to probe audio format: {e}"))?
        .format;

    let track = format
        .default_track()
        .ok_or_else(|| "No audio track found".to_string())?;

    let codec_params = track.codec_params.clone();
    let num_channels = codec_params.channels.map(|c| c.count()).unwrap_or(2) as usize;
    let track_id = track.id;

    if start_second > 0.0 {
        let _ = format.seek(
            SeekMode::Accurate,
            SeekTo::Time {
                time: Time::from(start_second),
                track_id: Some(track_id),
            },
        );
    }

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    let mut next_emit_frame: u64 = ring.write_end.load(Ordering::Acquire);
    let mut scratch_frame: Vec<f32> = vec![0.0_f32; num_channels.max(2)];

    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }

        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        match emit_decoded_buffer(
            decoded,
            &ring,
            num_channels,
            &mut scratch_frame,
            &mut next_emit_frame,
            &stop,
        )? {
            EmitOutcome::EndOfTrack => {
                ring.decode_done.store(true, Ordering::SeqCst);
                return Ok(());
            }
            EmitOutcome::Stopped => {
                return Ok(());
            }
            EmitOutcome::Continue => {}
        }
    }

    ring.decode_done.store(true, Ordering::SeqCst);
    Ok(())
}
