import type { Mission, WalkMode } from '@/domain/experience';

/**
 * Deterministic plan variants. A walk mode picks route wiggle, the mission
 * pool to draw from, and the AI-interaction budget; the hour of day may add a
 * light-aware mission in the evening. Everything here is pure and seeded
 * downstream, so the same (mode, hourOfDay) always yields the same variant.
 */
export type PlanVariant = {
  routeJitter: number;
  missionPool: Mission[];
  maxAIInteractions: number;
};

const QUIET_MISSIONS: Mission[] = [
  { id: 'm-no-phone', prompt: 'Walk for five minutes without looking at your phone.', estimatedMinutes: 5 },
  { id: 'm-look-up', prompt: 'Stop and look up for thirty seconds.', estimatedMinutes: 2 },
  { id: 'm-texture', prompt: 'Find a texture that surprises you.', estimatedMinutes: 4 },
];

const CURIOUS_MISSIONS: Mission[] = [
  ...QUIET_MISSIONS,
  { id: 'm-leaf-shapes', prompt: 'Find three different leaf shapes.', estimatedMinutes: 5 },
  { id: 'm-three-sounds', prompt: 'Listen for three different sounds.', estimatedMinutes: 4 },
  { id: 'm-older-than-you', prompt: 'Find something older than you.', estimatedMinutes: 5 },
  { id: 'm-brightest-colour', prompt: 'Find the brightest colour around you.', estimatedMinutes: 3 },
];

const EXPLORE_MISSIONS: Mission[] = [
  { id: 'm-furthest-thing', prompt: 'Notice the furthest thing you can see.', estimatedMinutes: 3 },
  { id: 'm-water', prompt: 'Find a place where you can hear water.', estimatedMinutes: 6 },
  { id: 'm-moving-thing', prompt: 'Notice something moving that is not a person.', estimatedMinutes: 4 },
];

/** New light-aware mission added to any pool during evening hours. */
export const LIGHT_MISSION: Mission = {
  id: 'm-light',
  prompt: 'Notice the fading light.',
  estimatedMinutes: 3,
};

/** Evening window (inclusive on both ends) during which LIGHT_MISSION applies. */
export const EVENING_START_HOUR = 18;
export const EVENING_END_HOUR = 22;

const VARIANT_BY_MODE: Record<WalkMode, Omit<PlanVariant, 'missionPool'> & { missionPool: Mission[] }> = {
  quiet: { routeJitter: 0.15, missionPool: QUIET_MISSIONS, maxAIInteractions: 3 },
  curious: { routeJitter: 0.3, missionPool: CURIOUS_MISSIONS, maxAIInteractions: 3 },
  explore: { routeJitter: 0.45, missionPool: EXPLORE_MISSIONS, maxAIInteractions: 4 },
};

export function resolvePlanVariant(mode: WalkMode, hourOfDay: number): PlanVariant {
  const base = VARIANT_BY_MODE[mode];
  const isEvening = hourOfDay >= EVENING_START_HOUR && hourOfDay <= EVENING_END_HOUR;
  const missionPool =
    isEvening && !base.missionPool.some((mission) => mission.id === LIGHT_MISSION.id)
      ? [...base.missionPool, LIGHT_MISSION]
      : [...base.missionPool];
  return { routeJitter: base.routeJitter, missionPool, maxAIInteractions: base.maxAIInteractions };
}