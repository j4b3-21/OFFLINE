import type { ExperiencePlan, Location } from '@/domain/experience';
import { distanceBetween, type NavigationState } from '@/navigation/navigation-engine';

/**
 * The slice of the active plan that a single cue check may reference.
 * Both fields are optional: a walk with no reliable location, no navigation,
 * no landmarks, or no missions must degrade to ambient cues and never claim
 * plan knowledge it does not have.
 */
export type PlanCueContext = {
  landmarkAhead?: { title: string; description: string };
  mission?: { prompt: string };
};

/** Landmarks within this distance may be announced as "ahead". */
export const LANDMARK_CUE_RADIUS_METERS = 400;

/**
 * Resolve the plan context for one cue check: the nearest landmark within
 * `LANDMARK_CUE_RADIUS_METERS` and the mission whose progress bracket the
 * route currently passes through. Returns `{}` when the plan, navigation, or
 * location is missing so the walker only ever hears ambient cues in that case.
 */
export function resolveCueContext(
  plan: ExperiencePlan | undefined,
  navigation: NavigationState | undefined,
  location: Location | undefined,
): PlanCueContext {
  if (!plan || !navigation || !location) return {};

  const context: PlanCueContext = {};

  const landmarkAhead = nearestLandmarkWithinRadius(plan.landmarks, location);
  if (landmarkAhead) context.landmarkAhead = landmarkAhead;

  const mission = missionForRouteProgress(plan, navigation);
  if (mission) context.mission = mission;

  return context;
}

function nearestLandmarkWithinRadius(
  landmarks: ExperiencePlan['landmarks'],
  location: Location,
): { title: string; description: string } | undefined {
  let nearest: { title: string; description: string } | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const landmark of landmarks) {
    if (!landmark.coordinate) continue;
    const distanceMeters = distanceBetween(landmark.coordinate, location);
    // Inclusive-in / exclusive-out: a landmark exactly at the radius is "ahead".
    if (distanceMeters <= LANDMARK_CUE_RADIUS_METERS && distanceMeters < nearestDistance) {
      nearest = { title: landmark.title, description: landmark.description };
      nearestDistance = distanceMeters;
    }
  }
  return nearest;
}

function missionForRouteProgress(
  plan: ExperiencePlan,
  navigation: NavigationState,
): { prompt: string } | undefined {
  if (plan.missions.length === 0) return undefined;
  const progressDenominator = plan.route.points.length - 1;
  if (progressDenominator <= 0) return undefined; // degenerate route: no progress claim
  const progress = Math.min(1, (navigation.currentSegmentIndex ?? 0) / progressDenominator);
  const index = Math.max(
    0,
    Math.min(plan.missions.length - 1, Math.floor(progress * plan.missions.length)),
  );
  return { prompt: plan.missions[index].prompt };
}