import type { LocalModel, MovementState } from '@/ai/local-model';
import type { Location } from '@/domain/experience';
import type { WalkingConfig } from '@/walking/walking-config';
import type { PlanCueContext } from '@/walking/cue-context';

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
  /**
   * Plan-aware cue context for each check. The host screen always supplies it;
   * a walk with no plan, navigation, or location resolves to an empty context
   * so cues fall back to ambient and never claim plan knowledge.
   */
  cueContext: () => PlanCueContext;
};
