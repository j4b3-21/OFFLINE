import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as Device from 'expo-device';

export interface AudioGuidance {
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
  isAvailable(): boolean;
}

let lastSpokenText = '';
let lastSpokenAt = 0;
const SPEECH_COOLDOWN_MS = 20_000;

export const audioGuidance: AudioGuidance = {
  async speak(text) {
    const now = Date.now();
    if (text === lastSpokenText && now - lastSpokenAt < SPEECH_COOLDOWN_MS) return;
    lastSpokenText = text;
    lastSpokenAt = now;
    Speech.speak(text);
  },
  async stop() {
    lastSpokenText = '';
    await Speech.stop();
  },
  isAvailable() {
    return true;
  },
};

export async function signalGuidance(kind: 'continue' | 'turn' | 'attention') {
  if (!Device.isDevice) return;

  const count = kind === 'continue' ? 1 : kind === 'turn' ? 2 : 3;
  for (let index = 0; index < count; index += 1) {
    await Haptics.selectionAsync();
    if (index < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
