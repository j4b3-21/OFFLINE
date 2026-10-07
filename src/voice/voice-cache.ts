import type { VoiceCue, VoiceProvider } from '@/voice/voice-provider';

export interface VoiceCache {
  get(key: string): Promise<VoiceCue | undefined>;
  save(key: string, cue: VoiceCue): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function voiceCacheKey(cue: Pick<VoiceCue, 'text' | 'voicePreset'>) {
  return `system:${cue.voicePreset}:${cue.text.trim().toLowerCase()}`;
}

export class MemoryVoiceCache implements VoiceCache {
  private readonly values = new Map<string, VoiceCue>();

  async get(key: string) {
    return this.values.get(key);
  }
  async save(key: string, cue: VoiceCue) {
    this.values.set(key, cue);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async clear() {
    this.values.clear();
  }
}

export function validateVoiceCue(text: string): void {
  const normalized = text.trim();
  if (!normalized) throw new Error('Voice cue cannot be empty.');
  if (normalized.length > 160) throw new Error('Voice cue is too long for low-attention guidance.');
}

export async function prepareVoiceCue(
  provider: VoiceProvider,
  cache: VoiceCache,
  cue: VoiceCue,
): Promise<VoiceCue> {
  validateVoiceCue(cue.text);
  const key = voiceCacheKey(cue);
  const cached = await cache.get(key);
  if (cached) return cached;
  const prepared = await provider.synthesize(cue);
  await cache.save(key, prepared);
  return prepared;
}
