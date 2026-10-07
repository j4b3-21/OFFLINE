import { describe, expect, it } from 'vitest';

import { isReasonableLocationSample } from '@/navigation/navigation-engine';
import type { Location } from '@/domain/experience';

function sample(latitudeDelta: number, longitudeDelta = 0): Location {
  return {
    latitude: 37.7749 + latitudeDelta,
    longitude: -122.4194 + longitudeDelta,
    accuracyMeters: 10,
    timestamp: Date.now(),
  };
}

describe('GPS sample validation', () => {
  it('accepts the first sample without a previous reference', () => {
    expect(isReasonableLocationSample(undefined, sample(0))).toBe(true);
  });

  it('accepts small, walking-plausible movements', () => {
    // ~0.0009° latitude ≈ 100 m at test latitude.
    expect(isReasonableLocationSample(sample(0), sample(0.0009))).toBe(true);
  });

  it('rejects implausible jumps between consecutive samples', () => {
    // ~0.003° latitude ≈ 334 m — cannot happen while walking in one window.
    expect(isReasonableLocationSample(sample(0), sample(0.003))).toBe(false);
  });

  it('accepts movement exactly at the threshold', () => {
    // ~0.00224° latitude ≈ 249 m (just inside the 250 m threshold).
    expect(isReasonableLocationSample(sample(0), sample(0.00224))).toBe(true);
  });
});