export const EXPERIENCE_SCHEMA_VERSION = 'experience.schema.v1';

export type SessionStatus =
  | 'CREATED'
  | 'PLANNED'
  | 'STARTED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'SAFETY_OVERRIDE'
  | 'FAILED';

export type Route = {
  id: string;
  summary: string;
  points: Coordinate[];
  distanceKm: number;
  durationMinutes: number;
  instructions: string[];
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Location = Coordinate & {
  accuracyMeters?: number;
  altitudeMeters?: number;
  headingDegrees?: number;
  speedMps?: number;
  timestamp: number;
};

export type NavigationStatus =
  | 'NOT_STARTED'
  | 'ON_ROUTE'
  | 'APPROACHING_LANDMARK'
  | 'TURN_REQUIRED'
  | 'OFF_ROUTE'
  | 'COMPLETED'
  | 'PAUSED';

export type NavigationInstruction = {
  text: string;
  distanceMeters: number;
  segmentIndex: number;
};

export type Landmark = {
  id: string;
  title: string;
  description: string;
  coordinate?: Coordinate;
};

export type Mission = {
  id: string;
  prompt: string;
  estimatedMinutes: number;
};

export type AttentionBudget = {
  maxScreenInteractions: number;
  maxScreenSeconds: number;
  maxAIInteractions: number;
  maxVoiceCues?: number;
  maxMusicInterruptions?: number;
};

export type WalkMode = 'quiet' | 'curious' | 'explore';

export type RoutePreferences = {
  targetDurationMinutes: number;
  greeneryWeight: number;
  landmarkWeight: number;
  quietnessWeight: number;
  simplicityWeight: number;
  explorationWeight: number;
  /** Optional plan-variant inputs recorded on the plan (schema stays experience.schema.v1). */
  mode?: WalkMode;
  hourOfDay?: number;
};

export type ExperienceCue = {
  id: string;
  text: string;
  priority: 'safety' | 'navigation' | 'mission' | 'ambient';
  trigger: 'start' | 'route' | 'landmark' | 'mission' | 'complete';
};

export type PlanProvenance = {
  modelId: string;
  promptVersion: string;
  generatedAt: string;
};

export type SafetyConstraints = {
  avoidRoadCrossings: boolean;
  daylightRequired: boolean;
  emergencyOverrideAvailable: boolean;
};

export type ExperiencePlan = {
  id: string;
  schemaVersion: typeof EXPERIENCE_SCHEMA_VERSION;
  durationMinutes: number;
  route: Route;
  landmarks: Landmark[];
  missions: Mission[];
  attentionBudget: AttentionBudget;
  safety: SafetyConstraints;
  offline: true;
  createdAt: string;
  routePreferences?: RoutePreferences;
  cues?: ExperienceCue[];
  provenance?: PlanProvenance;
  routeSeed?: number;
};

export type SessionMetrics = {
  screenInteractions: number;
  screenSeconds: number;
  aiInteractions: number;
  missionCompletions: number;
  routeCompleted: boolean;
  uninterruptedMinutes: number;
};

export type SessionRecord = {
  id: string;
  experienceId: string;
  status: SessionStatus;
  startedAt?: string;
  completedAt?: string;
  metrics: SessionMetrics;
};

/**
 * Meaningful session lifecycle events stored locally (no raw GPS traces).
 * The set is intentionally small: events a user or researcher would review,
 * not every location update.
 */
export type SessionEventType =
  | 'SESSION_CREATED'
  | 'EXPERIENCE_GENERATED'
  | 'SESSION_STARTED'
  | 'NAVIGATION_OFF_ROUTE'
  | 'ROUTE_RECOVERED'
  | 'MISSION_NOTED'
  | 'MISSION_UNNOTED'
  | 'SESSION_COMPLETED';

export type SessionEvent = {
  id?: number;
  sessionId: string;
  type: SessionEventType;
  detail?: string;
  createdAt: string;
};

export type SessionReport = SessionMetrics & {
  durationMinutes: number;
  digitalIntrusionScore: number;
  physicalEngagementScore: number;
  aiDisappearanceRate: number;
};

export function validateExperiencePlan(value: unknown): ExperiencePlan {
  if (!isRecord(value)) {
    throw new Error('Experience must be an object.');
  }

  const durationMinutes = value.durationMinutes;
  if (!isFiniteNumber(durationMinutes) || durationMinutes <= 0 || durationMinutes > 240) {
    throw new Error('Experience duration must be between 1 and 240 minutes.');
  }

  const route = value.route;
  if (
    !isRecord(route) ||
    typeof route.id !== 'string' ||
    typeof route.summary !== 'string' ||
    !Array.isArray(route.points) ||
    route.points.length < 2 ||
    route.points.some(
      (point) =>
        !isRecord(point) ||
        !isFiniteNumber(point.latitude) ||
        !isFiniteNumber(point.longitude),
    ) ||
    !isFiniteNumber(route.distanceKm) ||
    !isFiniteNumber(route.durationMinutes) ||
    !Array.isArray(route.instructions) ||
    route.instructions.length === 0 ||
    route.instructions.some((instruction) => typeof instruction !== 'string')
  ) {
    throw new Error('Experience route is incomplete.');
  }

  if (
    !isRecord(value.safety) ||
    value.safety.avoidRoadCrossings !== true ||
    value.safety.emergencyOverrideAvailable !== true
  ) {
    throw new Error('Experience safety constraints are invalid.');
  }

  const missions = value.missions;
  if (
    !Array.isArray(missions) ||
    missions.length === 0 ||
    missions.length > 7 ||
    missions.some(
      (mission) =>
        !isRecord(mission) ||
        typeof mission.id !== 'string' ||
        typeof mission.prompt !== 'string' ||
        !isFiniteNumber(mission.estimatedMinutes),
    )
  ) {
    throw new Error('Experience missions are invalid.');
  }

  const attentionBudget = value.attentionBudget;
  if (
    !isRecord(attentionBudget) ||
    !isFiniteNumber(attentionBudget.maxScreenInteractions) ||
    !isFiniteNumber(attentionBudget.maxScreenSeconds) ||
    !isFiniteNumber(attentionBudget.maxAIInteractions)
  ) {
    throw new Error('Experience attention budget is invalid.');
  }
  if (
    attentionBudget.maxVoiceCues !== undefined &&
    (!isFiniteNumber(attentionBudget.maxVoiceCues) || attentionBudget.maxVoiceCues < 0)
  ) {
    throw new Error('Experience voice cue budget is invalid.');
  }
  if (
    attentionBudget.maxMusicInterruptions !== undefined &&
    (!isFiniteNumber(attentionBudget.maxMusicInterruptions) ||
      attentionBudget.maxMusicInterruptions < 0)
  ) {
    throw new Error('Experience music interruption budget is invalid.');
  }

  if (value.schemaVersion !== EXPERIENCE_SCHEMA_VERSION || value.offline !== true) {
    throw new Error('Experience schema or offline guarantee is invalid.');
  }

  return value as ExperiencePlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
