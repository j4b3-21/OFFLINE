export type WalkingConfig = {
  aiCheckIntervalMs: number;
  minimumMovementMeters: number;
  routeRandomness: number;
  voiceEnabled: boolean;
};

export const WALKING_INTERVAL_OPTIONS = [
  { label: '30 sec', value: 30_000 },
  { label: '1 min', value: 60_000 },
  { label: '2 min', value: 120_000 },
  { label: '3 min', value: 180_000 },
  { label: '5 min', value: 300_000 },
] as const;

export const DEFAULT_WALKING_CONFIG: WalkingConfig = {
  aiCheckIntervalMs: 60_000,
  minimumMovementMeters: 5,
  routeRandomness: 0.7,
  voiceEnabled: true,
};

export function normalizeWalkingConfig(config: WalkingConfig): WalkingConfig {
  const interval = WALKING_INTERVAL_OPTIONS.some((option) => option.value === config.aiCheckIntervalMs)
    ? config.aiCheckIntervalMs
    : DEFAULT_WALKING_CONFIG.aiCheckIntervalMs;
  return {
    ...config,
    aiCheckIntervalMs: interval,
    minimumMovementMeters: Math.max(1, config.minimumMovementMeters),
    routeRandomness: Math.min(1, Math.max(0, config.routeRandomness)),
  };
}
