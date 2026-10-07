import { describe, expect, it } from 'vitest';

import { EVENING_END_HOUR, EVENING_START_HOUR, resolvePlanVariant } from '@/experience/plan-variants';
import type { WalkMode } from '@/domain/experience';

function missionIds(mode: WalkMode, hourOfDay: number) {
  return resolvePlanVariant(mode, hourOfDay).missionPool.map((mission) => mission.id);
}

describe('resolvePlanVariant', () => {
  it('quiet: low route jitter, calm mission pool, default AI budget', () => {
    const variant = resolvePlanVariant('quiet', 12);
    expect(variant.routeJitter).toBe(0.15);
    expect(missionIds('quiet', 12)).toEqual(['m-no-phone', 'm-look-up', 'm-texture']);
    expect(variant.maxAIInteractions).toBe(3);
  });

  it('curious: mid route jitter, broader mission pool, default AI budget', () => {
    const variant = resolvePlanVariant('curious', 12);
    expect(variant.routeJitter).toBe(0.3);
    expect(missionIds('curious', 12)).toEqual([
      'm-no-phone',
      'm-look-up',
      'm-texture',
      'm-leaf-shapes',
      'm-three-sounds',
      'm-older-than-you',
      'm-brightest-colour',
    ]);
    expect(variant.maxAIInteractions).toBe(3);
  });

  it('explore: high route jitter, furthest/water/moving pool, larger AI budget', () => {
    const variant = resolvePlanVariant('explore', 12);
    expect(variant.routeJitter).toBe(0.45);
    expect(missionIds('explore', 12)).toEqual(['m-furthest-thing', 'm-water', 'm-moving-thing']);
    expect(variant.maxAIInteractions).toBe(4);
  });

  it('evening hours add the light-aware mission once for every mode', () => {
    for (const hourOfDay of [EVENING_START_HOUR, 20, EVENING_END_HOUR]) {
      for (const mode of ['quiet', 'curious', 'explore'] as const) {
        const variant = resolvePlanVariant(mode, hourOfDay);
        expect(variant.missionPool.filter((mission) => mission.id === 'm-light')).toHaveLength(1);
        expect(variant.missionPool.some((mission) => mission.prompt === 'Notice the fading light.')).toBe(true);
      }
    }
  });

  it('daylight hours do not add the light-aware mission', () => {
    for (const hourOfDay of [0, 9, 12, EVENING_START_HOUR - 1, EVENING_END_HOUR + 1, 23]) {
      expect(missionIds('quiet', hourOfDay)).not.toContain('m-light');
    }
  });

  it('keeps maxAIInteractions within the attention budget bounds', () => {
    // Calm modes stay at the attention-budget default of 3; explore is the only mode above it.
    expect(resolvePlanVariant('quiet', 12).maxAIInteractions).toBe(3);
    expect(resolvePlanVariant('curious', 12).maxAIInteractions).toBe(3);
    expect(resolvePlanVariant('explore', 12).maxAIInteractions).toBe(4);
  });

  it('returns a fresh mission pool on every call so callers can mutate safely', () => {
    const first = resolvePlanVariant('quiet', 12).missionPool;
    const second = resolvePlanVariant('quiet', 12).missionPool;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});