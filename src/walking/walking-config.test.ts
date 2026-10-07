import { describe, expect, it } from 'vitest';

import { DEFAULT_WALKING_CONFIG, normalizeWalkingConfig } from '@/walking/walking-config';

describe('walking configuration', () => {
  it('defaults to one minute', () => {
    expect(DEFAULT_WALKING_CONFIG.aiCheckIntervalMs).toBe(60_000);
  });

  it('normalizes unsupported intervals', () => {
    expect(normalizeWalkingConfig({ ...DEFAULT_WALKING_CONFIG, aiCheckIntervalMs: 1 }).aiCheckIntervalMs).toBe(60_000);
  });
});
