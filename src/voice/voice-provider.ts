import * as Speech from 'expo-speech';

import type { VoiceConfig } from '@/config/integrations';

export type VoiceCue = {
  id: string;
  text: string;
  provider: 'system';
  voicePreset: string;
};

export interface VoiceProvider {
  synthesize(cue: VoiceCue): Promise<VoiceCue>;
  play(cue: VoiceCue): Promise<void>;
  stop(): Promise<void>;
  isAvailable(): boolean;
}

export class SystemVoiceProvider implements VoiceProvider {
  constructor(private readonly config: VoiceConfig) {}

  async synthesize(cue: VoiceCue) {
    return { ...cue, provider: 'system' as const, voicePreset: 'system' };
  }

  async play(cue: VoiceCue) {
    Speech.speak(cue.text, {
      language: this.config.language,
      rate: this.config.rate,
      pitch: this.config.pitch,
      volume: this.config.volume,
    });
  }

  async stop() {
    await Speech.stop();
  }

  isAvailable() {
    return true;
  }
}
