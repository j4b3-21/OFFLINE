import * as Linking from 'expo-linking';

export type PlaybackState = {
  isPlaying: boolean;
  source: 'spotify' | 'system' | 'unknown';
};

export interface MusicProvider {
  isAvailable(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getPlaybackState(): Promise<PlaybackState | null>;
  open(): Promise<void>;
}

export class SpotifyMusicProvider implements MusicProvider {
  async isAvailable() {
    return Linking.canOpenURL('spotify:');
  }

  async connect() {
    throw new Error('Spotify authentication requires a developer-configured OAuth flow.');
  }

  async disconnect() {}

  async play() {
    await this.open();
  }

  async pause() {
    throw new Error('Spotify playback control requires an approved native/provider integration.');
  }

  async resume() {
    await this.open();
  }

  async getPlaybackState() {
    return null;
  }

  async open() {
    if (!(await this.isAvailable())) throw new Error('Spotify is not installed or unavailable.');
    await Linking.openURL('spotify:');
  }
}

export class MockMusicProvider implements MusicProvider {
  private playing = false;

  async isAvailable() {
    return true;
  }

  async connect() {}
  async disconnect() {
    this.playing = false;
  }
  async play() {
    this.playing = true;
  }
  async pause() {
    this.playing = false;
  }
  async resume() {
    this.playing = true;
  }
  async getPlaybackState() {
    return { isPlaying: this.playing, source: 'spotify' as const };
  }
  async open() {}
}
