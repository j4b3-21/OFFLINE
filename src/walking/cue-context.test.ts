import { describe, expect, it } from 'vitest';

import {
  LANDMARK_CUE_RADIUS_METERS,
  resolveCueContext,
} from '@/walking/cue-context';
import { distanceBetween, type NavigationState } from '@/navigation/navigation-engine';
import type { ExperiencePlan, Location } from '@/domain/experience';

// Matches the mock planner's latitude conversion (meters per degree).
const METERS_PER_DEGREE_LAT = 111_320;

const ORIGIN = { latitude: 37.7749, longitude: -122.4194 };

function locationAt(latitude: number, longitude: number, timestamp = 1_700_000_000_000): Location {
  return { latitude, longitude, timestamp };
}

function navigationAt(currentSegmentIndex: number): NavigationState {
  return {
    status: 'ON_ROUTE',
    currentSegmentIndex,
    distanceToRouteMeters: 0,
    distanceToNextInstructionMeters: 0,
    offRoute: false,
  };
}

function planWith(options: {
  points: number;
  landmarks?: { title: string; description: string; metersNorth?: number; withCoordinate?: boolean }[];
  missions?: { id: string; prompt: string; estimatedMinutes: number }[];
}): ExperiencePlan {
  const { points, landmarks = [], missions = [] } = options;
  return {
    id: 'test-plan',
    schemaVersion: 'experience.schema.v1',
    durationMinutes: 30,
    route: {
      id: 'test-route',
      summary: 'Test route',
      points: Array.from({ length: points }, (_, index) => ({
        latitude: ORIGIN.latitude + index * 0.001,
        longitude: ORIGIN.longitude,
      })),
      distanceKm: 1,
      durationMinutes: 30,
      instructions: ['Walk.'],
    },
    landmarks: landmarks.map((landmark, index) => ({
      id: `landmark-${index}`,
      title: landmark.title,
      description: landmark.description,
      coordinate:
        landmark.withCoordinate === false
          ? undefined
          : {
              latitude: ORIGIN.latitude + (landmark.metersNorth ?? 0) / METERS_PER_DEGREE_LAT,
              longitude: ORIGIN.longitude,
            },
    })),
    missions,
    attentionBudget: { maxScreenInteractions: 5, maxScreenSeconds: 90, maxAIInteractions: 3 },
    safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
    offline: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('resolveCueContext', () => {
  it('returns an empty context when plan, navigation, or location is missing', () => {
    const location = locationAt(ORIGIN.latitude, ORIGIN.longitude);
    const navigation = navigationAt(0);
    const plan = planWith({ points: 5, missions: [{ id: 'm-1', prompt: 'Look around.', estimatedMinutes: 3 }] });

    expect(resolveCueContext(undefined, undefined, undefined)).toEqual({});
    expect(resolveCueContext(plan, undefined, location)).toEqual({});
    expect(resolveCueContext(undefined, navigation, location)).toEqual({});
    expect(resolveCueContext(plan, navigation, undefined)).toEqual({});
  });

  it('resolves a landmark within the radius as landmarkAhead with title and description', () => {
    const plan = planWith({
      points: 5,
      landmarks: [{ title: 'First pause', description: 'Stop and look around.', metersNorth: 350 }],
    });
    const result = resolveCueContext(plan, navigationAt(0), locationAt(ORIGIN.latitude, ORIGIN.longitude));
    expect(result.landmarkAhead).toEqual({ title: 'First pause', description: 'Stop and look around.' });
  });

  it('picks the nearest landmark when several are inside the radius', () => {
    const plan = planWith({
      points: 5,
      landmarks: [
        { title: 'Far pause', description: 'Far.', metersNorth: 380 },
        { title: 'Near pause', description: 'Near.', metersNorth: 100 },
      ],
    });
    const result = resolveCueContext(plan, navigationAt(0), locationAt(ORIGIN.latitude, ORIGIN.longitude));
    expect(result.landmarkAhead?.title).toBe('Near pause');
  });

  it('leaves landmarkAhead unset for a landmark outside the radius', () => {
    const plan = planWith({
      points: 5,
      landmarks: [{ title: 'Far pause', description: 'Too far.', metersNorth: 1_000 }],
    });
    const result = resolveCueContext(plan, navigationAt(0), locationAt(ORIGIN.latitude, ORIGIN.longitude));
    expect(result.landmarkAhead).toBeUndefined();
  });

  it('treats the radius boundary as inclusive-in / exclusive-out', () => {
    // 400 m converted through the same latitude conversion gives ≈399.6 m (inside);
    // 401 m gives ≈400.6 m (outside). This pins the <= LANDMARK_CUE_RADIUS_METERS rule.
    const justInside = planWith({
      points: 5,
      landmarks: [{ title: 'Boundary pause', description: 'Just inside.', metersNorth: LANDMARK_CUE_RADIUS_METERS }],
    });
    const justOutside = planWith({
      points: 5,
      landmarks: [{ title: 'Boundary pause', description: 'Just outside.', metersNorth: LANDMARK_CUE_RADIUS_METERS + 1 }],
    });
    const location = locationAt(ORIGIN.latitude, ORIGIN.longitude);

    expect(distanceBetween(justInside.landmarks[0].coordinate!, location)).toBeLessThan(LANDMARK_CUE_RADIUS_METERS);
    expect(distanceBetween(justOutside.landmarks[0].coordinate!, location)).toBeGreaterThan(LANDMARK_CUE_RADIUS_METERS);

    expect(resolveCueContext(justInside, navigationAt(0), location).landmarkAhead?.title).toBe('Boundary pause');
    expect(resolveCueContext(justOutside, navigationAt(0), location).landmarkAhead).toBeUndefined();
  });

  it('ignores landmarks without a coordinate', () => {
    const plan = planWith({
      points: 5,
      landmarks: [{ title: 'No coordinate', description: 'Missing.', withCoordinate: false }],
    });
    const result = resolveCueContext(plan, navigationAt(0), locationAt(ORIGIN.latitude, ORIGIN.longitude));
    expect(result.landmarkAhead).toBeUndefined();
  });

  it('selects the mission by route progress brackets across the route', () => {
    const missions = [
      { id: 'm-1', prompt: 'First mission.', estimatedMinutes: 3 },
      { id: 'm-2', prompt: 'Second mission.', estimatedMinutes: 3 },
      { id: 'm-3', prompt: 'Third mission.', estimatedMinutes: 3 },
    ];
    const plan = planWith({ points: 5, missions }); // route.points.length - 1 = 4
    const location = locationAt(ORIGIN.latitude, ORIGIN.longitude);

    // progress 0 → index 0
    expect(resolveCueContext(plan, navigationAt(0), location).mission?.prompt).toBe('First mission.');
    // progress 0.5 → floor(1.5) = 1
    expect(resolveCueContext(plan, navigationAt(2), location).mission?.prompt).toBe('Second mission.');
    // progress 1 → floor(3) → clamped to last index
    expect(resolveCueContext(plan, navigationAt(4), location).mission?.prompt).toBe('Third mission.');
    // beyond the end of the route clamps progress to 1 → last mission
    expect(resolveCueContext(plan, navigationAt(99), location).mission?.prompt).toBe('Third mission.');
    // negative progress (defensive) clamps index to 0
    expect(resolveCueContext(plan, navigationAt(-3), location).mission?.prompt).toBe('First mission.');
  });

  it('clamps to the first mission when there is only one', () => {
    const plan = planWith({
      points: 5,
      missions: [{ id: 'm-1', prompt: 'The only mission.', estimatedMinutes: 3 }],
    });
    const location = locationAt(ORIGIN.latitude, ORIGIN.longitude);
    expect(resolveCueContext(plan, navigationAt(3), location).mission?.prompt).toBe('The only mission.');
  });

  it('returns an empty context for empty landmarks and missions', () => {
    const plan = planWith({ points: 5 });
    const result = resolveCueContext(plan, navigationAt(0), locationAt(ORIGIN.latitude, ORIGIN.longitude));
    expect(result).toEqual({});
  });
});