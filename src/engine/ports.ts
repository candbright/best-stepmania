export interface AudioPort {
  load(musicPath: string): Promise<{ duration: number }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  getTime(): Promise<number>;
  stop(): Promise<void>;
}
