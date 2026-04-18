export interface AudioPlaybackState {
  time: number;
  duration: number;
  isPlaying: boolean;
}

export interface AudioPort {
  load(musicPath: string): Promise<{ duration: number }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  getTime(): Promise<number>;
  /** Single IPC round-trip for sync + EOF detection (preferred over {@link getTime} alone). */
  getPlaybackState(): Promise<AudioPlaybackState>;
  stop(): Promise<void>;
}
