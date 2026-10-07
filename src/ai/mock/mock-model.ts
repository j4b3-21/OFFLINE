import type {
  LocalModel,
  ModelHealth,
  ModelMetadata,
  ModelRequest,
  ModelResponse,
  WalkingState,
} from '@/ai/local-model';
import {
  EXPERIENCE_SCHEMA_VERSION,
  type Coordinate,
  type ExperiencePlan,
  type Landmark,
  type Mission,
  type Route,
} from '@/domain/experience';
import { distanceBetween } from '@/navigation/navigation-engine';

/**
 * MockModel is the deterministic, fully offline planner used for development,
 * tests, CI, and the default MVP build. It implements the same LocalModel
 * contract as the TinyLlama adapter, so the experience engine, walking monitor,
 * and safety gates run unchanged.
 *
 * Everything it produces is derived from real inputs (duration, seed,
 * start location) with honest geometry: route distances and instructions come
 * from the generated coordinates, and landmarks are attention anchors rather
 * than claims about surveyed environment features.
 */

const WALKING_SPEED_M_PER_MIN = 75; // ≈ 4.5 km/h

const MISSION_POOL: Mission[] = [
  { id: 'm-leaf-shapes', prompt: 'Find three different leaf shapes.', estimatedMinutes: 5 },
  { id: 'm-three-sounds', prompt: 'Listen for three different sounds.', estimatedMinutes: 4 },
  { id: 'm-older-than-you', prompt: 'Find something older than you.', estimatedMinutes: 5 },
  { id: 'm-no-phone', prompt: 'Walk for five minutes without looking at your phone.', estimatedMinutes: 5 },
  { id: 'm-water', prompt: 'Find a place where you can hear water.', estimatedMinutes: 6 },
  { id: 'm-moving-thing', prompt: 'Notice something moving that is not a person.', estimatedMinutes: 4 },
  { id: 'm-brightest-colour', prompt: 'Find the brightest colour around you.', estimatedMinutes: 3 },
  { id: 'm-look-up', prompt: 'Stop and look up for thirty seconds.', estimatedMinutes: 2 },
  { id: 'm-texture', prompt: 'Find a texture that surprises you.', estimatedMinutes: 4 },
  { id: 'm-furthest-thing', prompt: 'Notice the furthest thing you can see.', estimatedMinutes: 3 },
];

const LANDMARK_ANCHORS: (Pick<Landmark, 'title' | 'description'>)[] = [
  { title: 'First pause', description: 'Stop here and notice three sounds before continuing.' },
  { title: 'Open view', description: 'Look up and find the furthest thing you can see.' },
  { title: 'Quiet stretch', description: 'Walk this section without checking your phone.' },
  { title: 'Halfway point', description: 'Turn around slowly and notice what changed behind you.' },
  { title: 'Texture check', description: 'Touch a surface here and notice how it feels.' },
  { title: 'Final approach', description: 'Slow down and finish the loop quietly.' },
];

const MOVING_CUES = [
  'Notice three different sounds around you.',
  'Keep going; the path opens up ahead.',
  'Look for something you would normally overlook.',
  'What colour do you see most right now?',
  'Let the phone stay in your pocket.',
  'Try to hear water somewhere nearby.',
  'Notice the light through the trees.',
  'Find something shaped like a circle.',
];

const SLOW_CUES = [
  'Keep going at your own pace.',
  'A little further, then look around.',
  'Slow down and notice one detail up close.',
];

const STATIONARY_CUES = [
  'Take a few steps and see what changes.',
  'Move a little further, then look again.',
];

export class MockModel implements LocalModel {
  private loaded = false;

  async load() {
    this.loaded = true;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.task === 'walking-cue') {
      return { cue: walkingCue(request.walkingState) };
    }
    return { plan: buildPlan(request) };
  }

  async *stream(request: ModelRequest): AsyncIterable<string> {
    yield JSON.stringify(await this.generate(request));
  }

  async unload() {
    this.loaded = false;
  }

  isLoaded() {
    return this.loaded;
  }

  async health(): Promise<ModelHealth> {
    return this.loaded
      ? { status: 'ready' }
      : { status: 'unavailable', reason: 'Mock model is idle.' };
  }

  metadata(): ModelMetadata {
    return { id: 'mock-planner', displayName: 'Mock planner · offline', local: true };
  }
}

function buildPlan(request: ModelRequest): ExperiencePlan {
  const durationMinutes = clamp(request.durationMinutes ?? 30, 1, 240);
  const routeSeed = request.routeSeed ?? 1;
  const start: Coordinate = request.startLocation ?? { latitude: 0, longitude: 0 };
  const random = mulberry32(routeSeed);

  const route = buildRoute(routeSeed, durationMinutes, start);
  const missionCount = clamp(Math.round(durationMinutes / 10), 3, 5);
  const missions = pickSeeded(MISSION_POOL, missionCount, random);

  return {
    id: `exp-${routeSeed}`,
    schemaVersion: EXPERIENCE_SCHEMA_VERSION,
    durationMinutes,
    route,
    landmarks: buildLandmarks(route, random),
    missions,
    attentionBudget: {
      maxScreenInteractions: 5,
      maxScreenSeconds: 90,
      maxAIInteractions: 3,
    },
    safety: {
      avoidRoadCrossings: true,
      daylightRequired: true,
      emergencyOverrideAvailable: true,
    },
    offline: true,
    createdAt: new Date().toISOString(),
    routePreferences: {
      targetDurationMinutes: durationMinutes,
      greeneryWeight: 0.25,
      landmarkWeight: 0.2,
      quietnessWeight: 0.25,
      simplicityWeight: 0.15,
      explorationWeight: 0.15,
    },
    routeSeed,
    provenance: {
      modelId: 'mock-planner',
      promptVersion: 'mock-planner.v1',
      generatedAt: new Date().toISOString(),
    },
  };
}

function buildRoute(routeSeed: number, durationMinutes: number, start: Coordinate): Route {
  const random = mulberry32(routeSeed ^ 0x5f3759df);
  const targetMeters = durationMinutes * WALKING_SPEED_M_PER_MIN;
  const segmentCount = clamp(Math.round(durationMinutes / 6), 4, 10);
  const radiusMeters = targetMeters / (2 * Math.PI);
  const latitudeMeters = 111_320;
  const longitudeMeters = 111_320 * Math.cos((start.latitude * Math.PI) / 180 || 1e-6);

  const points: Coordinate[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * 2 * Math.PI;
    const jitter = 1 + (random() - 0.5) * 0.3;
    const radius = radiusMeters * jitter;
    points.push({
      latitude: start.latitude + (radius * Math.cos(angle)) / latitudeMeters,
      longitude: start.longitude + (radius * Math.sin(angle)) / longitudeMeters,
    });
  }
  points.push({ ...points[0] }); // close the loop back at the start

  const instructions: string[] = [];
  let totalMeters = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentMeters = distanceBetween(points[index], points[index + 1]);
    totalMeters += segmentMeters;
    instructions.push(instructionFor(points, index, segmentMeters));
  }

  const distanceKm = Math.round(totalMeters) / 1000;
  return {
    id: `route-${routeSeed}`,
    summary: `A quiet ${durationMinutes}-minute loop that ends where it starts.`,
    points,
    distanceKm,
    durationMinutes: Math.max(1, Math.round(totalMeters / WALKING_SPEED_M_PER_MIN)),
    instructions,
  };
}

function instructionFor(points: Coordinate[], index: number, segmentMeters: number): string {
  const rounded = Math.max(10, Math.round(segmentMeters / 10) * 10);
  if (index === 0) return `Start by walking straight for ${rounded} m.`;
  const previousHeading = bearing(points[index - 1], points[index]);
  const nextHeading = bearing(points[index], points[index + 1]);
  const turn = normalizeDegrees(nextHeading - previousHeading);
  if (turn > 30) return `Turn right at the corner, then continue ${rounded} m.`;
  if (turn < -30) return `Turn left at the corner, then continue ${rounded} m.`;
  return `Continue straight for ${rounded} m.`;
}

function buildLandmarks(route: Route, random: () => number): Landmark[] {
  const anchorCount = 3 + Math.floor(random() * 2);
  const anchors = pickSeeded(LANDMARK_ANCHORS, Math.min(LANDMARK_ANCHORS.length, anchorCount), random);
  const candidateIndexes = [1, Math.floor(route.points.length / 2), route.points.length - 2, 2];
  return anchors.map((anchor, index) => {
    const point = route.points[candidateIndexes[index] ?? 1];
    return {
      id: `landmark-${index + 1}`,
      title: anchor.title,
      description: anchor.description,
      coordinate: { latitude: point.latitude, longitude: point.longitude },
    };
  });
}

function walkingCue(state: WalkingState | undefined): string {
  const history = state?.recentCueHistory ?? [];

  // Plan-aware cues replace the ambient cue at this check. Each fires at most
  // once per landmark/mission thanks to the dedupe history the monitor keeps.
  const landmark = state?.landmarkAhead;
  if (landmark && !history.some((entry) => entry.includes(landmark.title))) {
    return `${landmark.title} is ahead — ${landmark.description}`;
  }

  const mission = state?.mission;
  if (mission && !history.some((entry) => entry.includes(mission.prompt))) {
    return `While you walk: ${mission.prompt}`;
  }

  const pool =
    state?.movementState === 'stationary'
      ? STATIONARY_CUES
      : state?.movementState === 'slow'
        ? SLOW_CUES
        : MOVING_CUES;
  const unused = pool.filter((cue) => !history.includes(cue));
  if (unused.length > 0) {
    return unused[Math.floor(mulberry32((state?.routeSeed ?? 1) + history.length)() * unused.length)];
  }
  return pool[history.length % pool.length];
}

function pickSeeded<T>(pool: T[], count: number, random: () => number): T[] {
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function bearing(from: Coordinate, to: Coordinate): number {
  const latitudeA = (from.latitude * Math.PI) / 180;
  const latitudeB = (to.latitude * Math.PI) / 180;
  const deltaLongitude = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLongitude) * Math.cos(latitudeB);
  const x =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(deltaLongitude);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
