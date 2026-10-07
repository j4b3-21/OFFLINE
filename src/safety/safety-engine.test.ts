import { describe, expect, it } from 'vitest';

import { safetyEngine } from '@/safety/safety-engine';
import type { ExperiencePlan, Route } from '@/domain/experience';

const safeRoute: Route = {
  id: 'route-safe',
  summary: 'A quiet loop.',
  points: [
    { latitude: 37.7749, longitude: -122.4194 },
    { latitude: 37.7849, longitude: -122.4194 },
  ],
  distanceKm: 1.1,
  durationMinutes: 15,
  instructions: ['Continue straight for 100 m.'],
};

const safePlan: ExperiencePlan = {
  id: 'exp-safe',
  schemaVersion: 'experience.schema.v1',
  durationMinutes: 30,
  route: safeRoute,
  landmarks: [],
  missions: [{ id: 'm1', prompt: 'Listen for three sounds.', estimatedMinutes: 4 }],
  attentionBudget: { maxScreenInteractions: 5, maxScreenSeconds: 90, maxAIInteractions: 3 },
  safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
  offline: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('SafetyEngine.validateExperience', () => {
  it('accepts a safe, offline-capable experience', () => {
    const result = safetyEngine.validateExperience(safePlan);
    expect(result.safe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('rejects an experience that is not offline-capable', () => {
    const result = safetyEngine.validateExperience({ ...safePlan, offline: false } as unknown as ExperiencePlan);
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ')).toContain('offline');
  });

  it('rejects an experience that allows road crossings', () => {
    const result = safetyEngine.validateExperience({
      ...safePlan,
      safety: { ...safePlan.safety, avoidRoadCrossings: false },
    });
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ')).toContain('crossing');
  });

  it('rejects an experience without an emergency override', () => {
    const result = safetyEngine.validateExperience({
      ...safePlan,
      safety: { ...safePlan.safety, emergencyOverrideAvailable: false },
    } as unknown as ExperiencePlan);
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ').toLowerCase()).toContain('emergency');
  });
});

describe('SafetyEngine.validateRoute', () => {
  it('accepts usable geometry', () => {
    expect(safetyEngine.validateRoute(safeRoute).safe).toBe(true);
  });

  it('rejects a route with fewer than two points', () => {
    const result = safetyEngine.validateRoute({ ...safeRoute, points: [{ latitude: 1, longitude: 1 }] });
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ')).toContain('geometry');
  });

  it('rejects invalid coordinates', () => {
    const result = safetyEngine.validateRoute({
      ...safeRoute,
      points: [
        { latitude: 37.77, longitude: Number.NaN },
        { latitude: 37.78, longitude: -122.42 },
      ],
    });
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ')).toContain('invalid coordinates');
  });
});

describe('SafetyEngine.validateNavigationInstruction', () => {
  it('rejects an empty instruction', () => {
    const result = safetyEngine.validateNavigationInstruction({ text: '', distanceMeters: 0, segmentIndex: 0 });
    expect(result.safe).toBe(false);
    expect(result.reasons.join(' ')).toContain('empty');
  });

  it('accepts a concise instruction', () => {
    const result = safetyEngine.validateNavigationInstruction({
      text: 'Turn left at the gate.',
      distanceMeters: 90,
      segmentIndex: 1,
    });
    expect(result.safe).toBe(true);
  });
});

describe('SafetyEngine.shouldOverride', () => {
  it('overrides when off-route with unreliable accuracy', () => {
    expect(safetyEngine.shouldOverride(true, 250)).toBe(true);
    expect(safetyEngine.shouldOverride(true, undefined)).toBe(true);
  });

  it('does not override with good accuracy or when on route', () => {
    expect(safetyEngine.shouldOverride(true, 20)).toBe(false);
    expect(safetyEngine.shouldOverride(false, 250)).toBe(false);
  });
});