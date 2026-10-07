import type { VoiceCue } from '@/voice/voice-provider';

export type AudioPriority = 'safety' | 'navigation' | 'mission' | 'ambient';

export type AudioEvent = {
  priority: AudioPriority;
  cue: VoiceCue;
};

const priorityRank: Record<AudioPriority, number> = {
  safety: 4,
  navigation: 3,
  mission: 2,
  ambient: 1,
};

export function shouldInterruptMusic(event: AudioEvent, musicPlaying: boolean) {
  return musicPlaying && priorityRank[event.priority] >= priorityRank.navigation;
}

export function shouldSuppressCue(event: AudioEvent, musicPlaying: boolean) {
  return musicPlaying && event.priority === 'ambient';
}
