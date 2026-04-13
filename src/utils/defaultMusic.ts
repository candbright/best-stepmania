/**
 * Default Music Generator
 * 
 * Generates a procedural music using Web Audio API:
 * - BPM 100, 45秒循环
 * - 4/4 beat pattern (kick + snare)
 * - C major scale melody
 * 
 * This runs entirely in the browser - no file loading, no IPC, instant start.
 */

export interface DefaultMusicTrack {
  audioBuffer: AudioBuffer;
  duration: number; // seconds
  bpm: number;
}

export interface DefaultChartNote {
  beat: number;      // 0-based beat position
  track: number;     // 0-3 (P1: 0-3, P2: 4-7)
  type: "tap" | "hold" | "roll";
  holdLength?: number; // in beats for hold notes
}

export interface DefaultChart {
  title: string;
  artist: string;
  bpm: number;
  duration: number; // seconds
  notes: DefaultChartNote[];
  difficulty: "Easy";
  meter: number; // difficulty rating e.g. 4
  stepsType: "pump-single";
}

// C major scale frequencies
const C_MAJOR_SCALE = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.00, // G4
  440.00, // A4
  493.88, // B4
  523.25, // C5
];

// BPM 100 = 600ms per beat = 600ms per quarter note
const BEAT_DURATION = 60 / 100; // 0.6 seconds per beat
const SONG_LENGTH_BEATS = 75;   // 45 seconds at BPM 100

/**
 * Generate a kick drum sound
 */
function playKick(ctx: BaseAudioContext, time: number, gain = 1.0): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
  
  gainNode.gain.setValueAtTime(gain * 0.8, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  osc.start(time);
  osc.stop(time + 0.2);
}

/**
 * Generate a snare drum sound
 */
function playSnare(ctx: BaseAudioContext, time: number, gain = 1.0): void {
  // Noise burst
  const bufferSize = ctx.sampleRate * 0.1;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(gain * 0.4, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1000;
  
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  
  // Tone component
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, time);
  oscGain.gain.setValueAtTime(gain * 0.3, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  
  noise.start(time);
  osc.start(time);
  osc.stop(time + 0.05);
}

/**
 * Generate a hi-hat sound
 */
function playHiHat(ctx: BaseAudioContext, time: number, gain = 1.0): void {
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain * 0.15, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  
  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  noise.start(time);
}

/**
 * Generate a melody note
 */
function playMelodyNote(ctx: BaseAudioContext, time: number, frequency: number, duration: number, gain = 0.3): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  osc.type = "sine";
  osc.frequency.value = frequency;
  
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(gain, time + 0.02); // attack
  gainNode.gain.setValueAtTime(gain * 0.7, time + duration * 0.3); // decay
  gainNode.gain.setValueAtTime(gain * 0.7, time + duration * 0.8); // sustain
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration); // release
  
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  osc.start(time);
  osc.stop(time + duration);
}

/**
 * Create the default chart data
 */
function createDefaultChartData(): DefaultChart {
  const notes: DefaultChartNote[] = [];
  
  // Create a simple pattern that repeats every 4 beats
  // Track layout: P1 uses tracks 0-3 (left, down, up, right in DDR notation)
  const pattern: Array<{ beat: number; track: number }> = [
    // Measure 1: Basic quarter note pattern
    { beat: 0, track: 0 },   // Left
    { beat: 1, track: 1 },   // Down
    { beat: 2, track: 2 },   // Up
    { beat: 3, track: 3 },   // Right
    
    // Measure 2: Variation
    { beat: 4, track: 1 },
    { beat: 5, track: 2 },
    { beat: 6, track: 1 },
    { beat: 7, track: 2 },
    
    // Measure 3: More variation with 8th notes
    { beat: 8, track: 0 },
    { beat: 8.5, track: 3 },
    { beat: 9, track: 1 },
    { beat: 10, track: 2 },
    { beat: 10.5, track: 3 },
    { beat: 11, track: 0 },
    { beat: 11.5, track: 1 },
    
    // Measure 4: Bracket pattern (2 notes at same time)
    { beat: 12, track: 0 },
    { beat: 12, track: 3 },
    { beat: 13, track: 1 },
    { beat: 13, track: 2 },
    { beat: 14, track: 0 },
    { beat: 14, track: 3 },
    { beat: 15, track: 1 },
    { beat: 15, track: 2 },
  ];
  
  // Repeat the pattern for the full song
  const totalMeasures = Math.floor(SONG_LENGTH_BEATS / 4);
  
  for (let measure = 0; measure < totalMeasures; measure++) {
    const measureOffset = measure * 4;
    
    // Copy pattern with measure offset
    for (const note of pattern) {
      const beatInSong = measureOffset + note.beat;
      if (beatInSong >= SONG_LENGTH_BEATS) break;
      
      notes.push({
        beat: beatInSong,
        track: note.track,
        type: "tap",
      });
    }
  }
  
  // Sort by beat
  notes.sort((a, b) => a.beat - b.beat);
  
  return {
    title: "Default Track",
    artist: "System",
    bpm: 100,
    duration: SONG_LENGTH_BEATS * BEAT_DURATION,
    notes,
    difficulty: "Easy",
    meter: 4,
    stepsType: "pump-single",
  };
}

/**
 * Generate the full song audio buffer (async)
 */
export async function generateDefaultMusic(): Promise<DefaultMusicTrack> {
  const sampleRate = 44100;
  const duration = SONG_LENGTH_BEATS * BEAT_DURATION; // 45 seconds
  const totalSamples = Math.ceil(duration * sampleRate);
  
  // Create offline context for rendering
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  
  // Schedule all notes
  for (let beat = 0; beat < SONG_LENGTH_BEATS; beat++) {
    const time = beat * BEAT_DURATION;
    const beatInMeasure = beat % 4;
    
    // Kick on 1 and 3
    if (beatInMeasure === 0 || beatInMeasure === 2) {
      playKick(offlineCtx, time, 1.0);
    }
    
    // Snare on 2 and 4
    if (beatInMeasure === 1 || beatInMeasure === 3) {
      playSnare(offlineCtx, time, 0.8);
    }
    
    // Hi-hat on every 8th note
    playHiHat(offlineCtx, time, 0.5);
    playHiHat(offlineCtx, time + BEAT_DURATION / 2, 0.3);
    
    // Melody - play notes on certain beats for musical pattern
    const melodyPattern = [
      0, 2, 4, 7,  // Beat 1: C4, E4, G4, C5
      0, 3, 5, 7,  // Beat 2: variation
      2, 4, 6, 7,  // Beat 3: variation
      0, 2, 4, 5,  // Beat 4: variation
    ];
    
    const melodyIndex = Math.floor(beat / 4) % melodyPattern.length;
    const noteIndex = melodyPattern[(beat + melodyIndex) % melodyPattern.length];
    
    // Only play melody every 2 beats
    if (beat % 2 === 0 && beat > 4 && beat < SONG_LENGTH_BEATS - 4) {
      const melodyBeat = beat % 8;
      if (melodyBeat < 4 || Math.random() > 0.3) {
        const freq = C_MAJOR_SCALE[noteIndex % C_MAJOR_SCALE.length];
        playMelodyNote(offlineCtx, time, freq, BEAT_DURATION * 1.5, 0.25);
      }
    }
  }
  
  // Render to buffer
  const renderedBuffer = await offlineCtx.startRendering();
  
  return {
    audioBuffer: renderedBuffer,
    duration,
    bpm: 100,
  };
}

// Singleton instance - cached after first generation
let cachedDefaultTrack: DefaultMusicTrack | null = null;
let generatingPromise: Promise<DefaultMusicTrack> | null = null;

export function getDefaultMusicTrack(): Promise<DefaultMusicTrack> {
  if (cachedDefaultTrack) {
    return Promise.resolve(cachedDefaultTrack);
  }
  
  if (generatingPromise) {
    return generatingPromise;
  }
  
  generatingPromise = generateDefaultMusic().then(track => {
    cachedDefaultTrack = track;
    return track;
  });
  
  return generatingPromise;
}

// Default chart singleton
let cachedDefaultChart: DefaultChart | null = null;

export function getDefaultChart(): DefaultChart {
  if (!cachedDefaultChart) {
    cachedDefaultChart = createDefaultChartData();
  }
  return cachedDefaultChart;
}
