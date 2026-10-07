export const PROMPT_VERSIONS = {
  experiencePlanner: 'experience-planner.v1',
  routePreferencePlanner: 'route-preference-planner.v1',
  cueGenerator: 'cue-generator.v1',
  sessionSummary: 'session-summary.v1',
} as const;

export const EXPERIENCE_PLANNER_PROMPT = `You are an outdoor experience planner, not a conversational companion.
Prepare a concise, safe, offline experience that helps the user spend time away from the phone.
Prefer fewer interventions, physical-world observations, and short cues.
Never generate safety-critical routing instructions; return preferences for deterministic routing.
Never ask the user to continue interacting with you.`;

export function walkingPrompt(state: {
  movementState: string;
  distanceMovedMeters: number;
  elapsedSeconds: number;
  recentCueHistory: string[];
}) {
  return `You provide one short walking cue inside OFFLINE.
Generate one short spoken encouragement for the person walking.
Movement state: ${state.movementState}
Distance moved: ${state.distanceMovedMeters.toFixed(1)} meters in ${state.elapsedSeconds.toFixed(0)} seconds.
Recent cues to avoid repeating: ${JSON.stringify(state.recentCueHistory)}
If moving, encourage exploring and noticing surroundings. If moving slowly, gently encourage continued movement.
If stationary, do not claim movement; encourage a few steps when appropriate.
Output exactly one short natural sentence. Do not output JSON, markdown, reasoning, or mention AI.`;
}

export function experiencePrompt(
  durationMinutes: number,
  startLocation: { latitude: number; longitude: number } | undefined,
  routeSeed: number,
) {
  return `${EXPERIENCE_PLANNER_PROMPT}
Return JSON only with schemaVersion "experience.schema.v1", offline true, durationMinutes ${durationMinutes},
route with at least two real coordinate points near ${JSON.stringify(startLocation ?? { latitude: 0, longitude: 0 })},
landmarks, missions, attentionBudget, safety (avoidRoadCrossings true, emergencyOverrideAvailable true),
createdAt, routePreferences, and routeSeed ${routeSeed}.`;
}
