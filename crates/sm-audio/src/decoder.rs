use std::fs::File;
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u32,
}

pub fn decode_file(path: &Path) -> Result<DecodedAudio, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open audio file: {e}"))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "No audio track found".to_string())?;

    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let _channels = track.codec_params.channels.map(|c| c.count() as u32).unwrap_or(2);
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {e}"))?;

    let mut all_samples = Vec::new();

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
                    let chan = buf.chan(ch);
                    if all_samples.len() <= ch {
                        all_samples.resize(buf.spec().channels.count(), Vec::new());
                    }
                    all_samples[ch].extend_from_slice(chan);
                }
            }
            AudioBufferRef::S16(buf) => {
                for ch in 0..buf.spec().channels.count() {
                    let chan = buf.chan(ch);
                    if all_samples.len() <= ch {
                        all_samples.resize(buf.spec().channels.count(), Vec::new());
                    }
                    all_samples[ch].extend(chan.iter().map(|&s| s as f32 / 32768.0));
                }
            }
            AudioBufferRef::S32(buf) => {
                for ch in 0..buf.spec().channels.count() {
                    let chan = buf.chan(ch);
                    if all_samples.len() <= ch {
                        all_samples.resize(buf.spec().channels.count(), Vec::new());
                    }
                    all_samples[ch].extend(chan.iter().map(|&s| s as f32 / 2_147_483_648.0));
                }
            }
            _ => {}
        }
    }

    // Interleave channels
    let num_channels = all_samples.len().max(1);
    let num_frames = all_samples.first().map(|c| c.len()).unwrap_or(0);
    let mut interleaved = Vec::with_capacity(num_frames * num_channels);
    for frame in 0..num_frames {
        for ch in 0..num_channels {
            interleaved.push(all_samples[ch].get(frame).copied().unwrap_or(0.0));
        }
    }

    Ok(DecodedAudio {
        samples: interleaved,
        sample_rate,
        channels: num_channels as u32,
    })
}
