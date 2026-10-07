import { describe, expect, it } from 'vitest';

import { MockModel } from '@/ai/mock/mock-model';
import { validateExperiencePlan, type ExperiencePlan } from '@/domain/experience';
import { safetyEngine } from '@/safety/safety-engine';
import { distanceBetween } from '@/navigation/navigation-engine';

const model = new MockModel();

async function planFor(seed: number, durationMinutes: number, withLocation = true) {
  const response = await model.generate({
    task: 'experience-plan',
    durationMinutes,
    routeSeed: seed,
    startLocation: withLocation ? { latitude: 37.7749, longitude: -122.4194 } : undefined,
  });
  return validateExperiencePlan(response.plan);
}

describe('MockModel experience plans', () => {
  it('produces plans that pass schema validation across seeds and durations', async () => {
    for (const seed of [1, 2, 7, 42, 999]) {
      for (const duration of [1, 5, 30, 120, 240]) {
        const plan = await planFor(seed, duration);
        expect(plan.schemaVersion).toBe('experience.schema.v1');
        expect(plan.offline).toBe(true);
        expect(plan.missions.length).toBeGreaterThanOrEqual(3);
        expect(plan.missions.length).toBeLessThanOrEqual(5);
        expect(plan.route.points.length).toBeGreaterThanOrEqual(2);
        expect(plan.route.instructions.length).toBeGreaterThan(0);
      }
    }
  });

  it('produces plans that pass the safety engine', async () => {
    const plan = await planFor(11, 30);
    const result = safetyEngine.validateExperience(plan);
    expect(result.safe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('produces valid plans when location is unavailable', async () => {
    const plan = await planFor(5, 45, false);
    expect(plan.route.points.length).toBeGreaterThanOrEqual(2);
    expect(safetyEngine.validateRoute(plan.route).safe).toBe(true);
  });

  it('is deterministic for the same seed', async () => {
    const first = await planFor(21, 30);
    const second = await planFor(21, 30);
    expect(first.route.points).toEqual(second.route.points);
    expect(first.route.instructions).toEqual(second.route.instructions);
    expect(first.missions).toEqual(second.missions);
  });

  it('produces different geometry for different seeds', async () => {
    const first = await planFor(1, 30);
    const second = await planFor(2, 30);
    expect(first.route.points).not.toEqual(second.route.points);
  });

  it('describes honest geometry: a closed loop whose distance matches its points', async () => {
    const plan = await planFor(3, 40);
    const start = plan.route.points[0];
    const end = plan.route.points[plan.route.points.length - 1];
    expect(distanceBetween(start, end)).toBeLessThan(1);

    const measuredMeters = plan.route.points
      .slice(1)
      .reduce((total, point, index) => total + distanceBetween(plan.route.points[index], point), 0);
    expect(Math.abs(measuredMeters / 1000 - plan.route.distanceKm)).toBeLessThan(0.002);
    expect(plan.route.distanceKm).toBeGreaterThan(0);
  });

  it('plans around the provided start location', async () => {
    const plan = await planFor(4, 30);
    for (const point of plan.route.points) {
      expect(distanceBetween(point, { latitude: 37.7749, longitude: -122.4194 })).toBeLessThan(10_000);
    }
  });
});

describe('MockModel walking cues', () => {
  const walkingState = {
    currentLocation: { latitude: 37.7749, longitude: -122.4194 },
    previousLocation: { latitude: 37.7748, longitude: -122.4193 },
    distanceMovedMeters: 42,
    elapsedSeconds: 30,
    movementState: 'moving' as const,
    recentCueHistory: [] as string[],
    routeSeed: 7,
  };

  it('returns a cue that satisfies the walking monitor validator', async () => {
    const response = await model.generate({ task: 'walking-cue', walkingState });
    expect(response.cue).toBeTruthy();
    expect(response.cue!.length).toBeLessThanOrEqual(160);
    expect(response.cue!.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it('avoids repeating cues already in history', async () => {
    const history = ['Notice three different sounds around you.', 'Keep going; the path opens up ahead.'];
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: { ...walkingState, recentCueHistory: history },
    });
    expect(history).not.toContain(response.cue);
  });

  it('uses step-oriented cues when stationary', async () => {
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: { ...walkingState, movementState: 'stationary' },
    });
    expect(['Take a few steps and see what changes.', 'Move a little further, then look again.']).toContain(
      response.cue,
    );
  });

  it('replaces the ambient cue with a landmark cue naming the planned landmark', async () => {
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: {
        ...walkingState,
        landmarkAhead: { title: 'Open view', description: 'Look up and find the furthest thing you can see.' },
      },
    });
    expect(response.cue).toBe('Open view is ahead — Look up and find the furthest thing you can see.');
  });

  it('yields an ambient cue once the landmark title is already in cue history', async () => {
    const landmarkCue = 'Open view is ahead — Look up and find the furthest thing you can see.';
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: {
        ...walkingState,
        recentCueHistory: [landmarkCue],
        landmarkAhead: { title: 'Open view', description: 'Look up and find the furthest thing you can see.' },
      },
    });
    expect(response.cue).not.toContain('Open view');
    expect(response.cue).not.toBe(landmarkCue);
    expect(response.cue!.length).toBeLessThanOrEqual(160);
  });

  it('replaces the ambient cue with a mission cue', async () => {
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: { ...walkingState, mission: { prompt: 'Find a texture that surprises you.' } },
    });
    expect(response.cue).toBe('While you walk: Find a texture that surprises you.');
  });

  it('fires a mission cue only once: history containing the prompt yields ambient next', async () => {
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: {
        ...walkingState,
        recentCueHistory: ['While you walk: Find a texture that surprises you.'],
        mission: { prompt: 'Find a texture that surprises you.' },
      },
    });
    expect(response.cue).not.toContain('Find a texture that surprises you.');
    expect(response.cue!.length).toBeLessThanOrEqual(160);
  });

  it('prefers the landmark cue over the mission cue when both are fresh', async () => {
    const response = await model.generate({
      task: 'walking-cue',
      walkingState: {
        ...walkingState,
        landmarkAhead: { title: 'Open view', description: 'Look up.' },
        mission: { prompt: 'Find a texture that surprises you.' },
      },
    });
    expect(response.cue).toBe('Open view is ahead — Look up.');
  });

  it('falls back to the ambient pool when no landmark or mission context is present', async () => {
    const response = await model.generate({ task: 'walking-cue', walkingState });
    expect(response.cue).not.toContain('is ahead —');
    expect(response.cue).not.toMatch(/^While you walk:/);
  });
});

describe('MockModel lifecycle', () => {
  it('reports health and metadata like any other LocalModel', async () => {
    expect(model.isLoaded()).toBe(false);
    await model.load();
    expect(model.isLoaded()).toBe(true);
    expect((await model.health()).status).toBe('ready');
    expect(model.metadata()).toEqual({ id: 'mock-planner', displayName: 'Mock planner · offline', local: true });
    await model.unload();
    expect(model.isLoaded()).toBe(false);
  });

  it('streams JSON that parses into a valid plan', async () => {
    const chunks: string[] = [];
    for await (const chunk of model.stream({ task: 'experience-plan', durationMinutes: 30, routeSeed: 9 })) {
      chunks.push(chunk);
    }
    const payload = JSON.parse(chunks.join('')) as { plan: ExperiencePlan };
    expect(validateExperiencePlan(payload.plan).routeSeed).toBe(9);
  });
});
