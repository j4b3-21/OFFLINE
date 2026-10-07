import type { LocalModel, MovementState } from '@/ai/local-model';
import type { Location } from '@/domain/experience';
import type { WalkingConfig } from '@/walking/walking-config';

export type WalkingSessionStatus = 'IDLE' | 'STARTING' | 'WALKING' | 'CHECKING' | 'SPEAKING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export type WalkingSnapshot = {
  status: WalkingSessionStatus;
  currentPosition?: Location;
  previousPosition?: Location;
  distanceMovedMeters: number;
  movementState: MovementState;
  lastCheckTime?: number;
  nextCheckAt?: number;
  recentCueHistory: string[];
  error?: string;
};

export type WalkingSessionDependencies = {
  model: LocalModel;
  voice: {
    play: (cue: { id: string; text: string; provider: 'system'; voicePreset: string }) => Promise<void>;
    stop: () => Promise<void>;
  };
  voiceProvider: 'system';
  getCurrentLocation: () => Promise<Location>;
  subscribeToLocation: (callback: (location: Location) => void, onError?: (error: Error) => void) => Promise<() => void>;
  config: WalkingConfig;
  routeSeed: number;
};
