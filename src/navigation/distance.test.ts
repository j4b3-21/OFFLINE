import { describe, expect, it } from 'vitest';

import { distanceBetween } from '@/navigation/navigation-engine';
import { movementStateFor } from '@/walking/walking-monitor';

describe('walking distance and movement state', () => {
  it('returns zero for the same position', () => {
    expect(distanceBetween({ latitude: 12, longitude: 77 }, { latitude: 12, longitude: 77 })).toBe(0);
  });

  it('classifies stationary, slow, and moving states', () => {
    expect(movementStateFor(2, 60, 5)).toBe('stationary');
    expect(movementStateFor(20, 60, 5)).toBe('slow');
    expect(movementStateFor(60, 60, 5)).toBe('moving');
  });
});
