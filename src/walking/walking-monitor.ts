import type { WalkingState } from '@/ai/local-model';
import { distanceBetween, isReasonableLocationSample } from '@/navigation/navigation-engine';
import type { Location } from '@/domain/experience';
import { normalizeWalkingConfig, type WalkingConfig } from '@/walking/walking-config';
import type { WalkingSessionDependencies, WalkingSnapshot } from '@/walking/walking-types';
export type { WalkingSnapshot } from '@/walking/walking-types';

type Listener = (snapshot: WalkingSnapshot) => void;

export class WalkingMonitor {
  private config: WalkingConfig;
  private cleanupLocation?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private checking = false;
  private stopped = true;
  private listeners = new Set<Listener>();
  private snapshot: WalkingSnapshot = {
    status: 'IDLE',
    distanceMovedMeters: 0,
    movementState: 'stationary',
    recentCueHistory: [],
  };

  constructor(private readonly dependencies: WalkingSessionDependencies) {
    this.config = normalizeWalkingConfig(dependencies.config);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  updateConfig(config: WalkingConfig) {
    this.config = normalizeWalkingConfig(config);
    if (!this.stopped && this.snapshot.status === 'WALKING') this.scheduleNextCheck();
  }

  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.update({ status: 'STARTING', error: undefined });
    try {
      const initial = await this.dependencies.getCurrentLocation();
      this.requireReliableLocation(initial);
      this.update({ status: 'WALKING', currentPosition: initial, previousPosition: initial, movementState: 'stationary' });
      this.cleanupLocation = await this.dependencies.subscribeToLocation(
        (location) => this.handleLocation(location),
        (error) => this.update({ status: 'ERROR', error: error.message }),
      );
      this.scheduleNextCheck();
    } catch (error) {
      await this.stop();
      this.update({ status: 'ERROR', error: error instanceof Error ? error.message : 'Location unavailable.' });
      throw error;
    }
  }

  pause() {
    if (this.stopped) return;
    this.clearTimer();
    this.update({ status: 'PAUSED' });
  }

  resume() {
    if (this.stopped || this.snapshot.status !== 'PAUSED') return;
    this.update({ status: 'WALKING' });
    this.scheduleNextCheck();
  }

  async stop() {
    this.stopped = true;
    this.clearTimer();
    this.cleanupLocation?.();
    this.cleanupLocation = undefined;
    await this.dependencies.voice.stop();
    if (this.dependencies.model.isLoaded()) await this.dependencies.model.unload();
    this.update({ status: 'STOPPED' });
  }

  private handleLocation(location: Location) {
    if (this.stopped || !this.isReliable(location)) return;
    this.update({ currentPosition: location });
  }

  private scheduleNextCheck() {
    this.clearTimer();
    if (this.stopped || this.snapshot.status !== 'WALKING') return;
    const nextCheckAt = Date.now() + this.config.aiCheckIntervalMs;
    this.update({ nextCheckAt });
    this.timer = setTimeout(() => void this.runCheck(), this.config.aiCheckIntervalMs);
  }

  private async runCheck() {
    if (this.stopped || this.checking || this.snapshot.status !== 'WALKING') return;
    this.checking = true;
    this.update({ status: 'CHECKING', lastCheckTime: Date.now() });
    try {
      const current = await this.dependencies.getCurrentLocation();
      this.requireReliableLocation(current);
      const previous = this.snapshot.previousPosition ?? current;
      // A single implausible sample is not movement: keep previous position so
      // the check neither claims motion nor progresses the route on a jump.
      const distanceMovedMeters = isReasonableLocationSample(previous, current)
        ? distanceBetween(previous, current)
        : 0;
      const elapsedSeconds = Math.max(1, (current.timestamp - previous.timestamp) / 1000);
      const movementState = movementStateFor(distanceMovedMeters, elapsedSeconds, this.config.minimumMovementMeters);
      const cueContext = this.dependencies.cueContext();
      const walkingState: WalkingState = {
        currentLocation: current,
        previousLocation: previous,
        distanceMovedMeters,
        elapsedSeconds,
        movementState,
        recentCueHistory: this.snapshot.recentCueHistory,
        routeSeed: this.dependencies.routeSeed,
        landmarkAhead: cueContext.landmarkAhead,
        mission: cueContext.mission,
      };
      await this.dependencies.model.load();
      try {
        const response = await this.dependencies.model.generate({ task: 'walking-cue', walkingState });
        const cue = validateCue(response.cue);
        const history = [...this.snapshot.recentCueHistory, cue].slice(-8);
        this.update({ status: 'SPEAKING', currentPosition: current, previousPosition: current, distanceMovedMeters, movementState, recentCueHistory: history });
        if (this.config.voiceEnabled) {
          await this.dependencies.voice.play({
            id: `walking-${current.timestamp}`,
            text: cue,
            provider: this.dependencies.voiceProvider,
            voicePreset: 'calm',
          });
        }
        this.update({ status: 'WALKING' });
      } finally {
        if (this.dependencies.model.isLoaded()) await this.dependencies.model.unload();
      }
    } catch (error) {
      this.update({ status: 'ERROR', error: error instanceof Error ? error.message : 'Walking check failed.' });
    } finally {
      this.checking = false;
      if (!this.stopped) this.scheduleNextCheck();
    }
  }

  private requireReliableLocation(location: Location) {
    if (!this.isReliable(location)) throw new Error('A reliable GPS location is required before checking movement.');
  }

  private isReliable(location: Location) {
    return Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      (location.accuracyMeters === undefined || location.accuracyMeters <= 100);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private update(patch: Partial<WalkingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export function movementStateFor(
  distanceMovedMeters: number,
  elapsedSeconds: number,
  minimumMovementMeters: number,
): 'moving' | 'slow' | 'stationary' {
  if (distanceMovedMeters < minimumMovementMeters) return 'stationary';
  const metersPerSecond = distanceMovedMeters / Math.max(1, elapsedSeconds);
  return metersPerSecond < 0.6 ? 'slow' : 'moving';
}

function validateCue(cue: string | undefined) {
  const normalized = cue?.replace(/\s+/g, ' ').trim();
  if (!normalized) throw new Error('The local model returned an empty walking cue.');
  if (normalized.length > 160) throw new Error('The local model returned an overly long walking cue.');
  if (normalized.split(/[.!?]/).filter(Boolean).length > 2) throw new Error('The local model returned too many sentences.');
  return normalized;
}
