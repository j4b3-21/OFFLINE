import type {
  Coordinate,
  Location,
  NavigationInstruction,
  NavigationStatus,
  Route,
} from '@/domain/experience';

export type NavigationState = {
  status: NavigationStatus;
  currentLocation?: Location;
  currentSegmentIndex: number;
  distanceToRouteMeters: number;
  distanceToNextInstructionMeters: number;
  nextInstruction?: NavigationInstruction;
  offRoute: boolean;
};

const OFF_ROUTE_THRESHOLD_METERS = 45;
const ARRIVAL_THRESHOLD_METERS = 35;

/**
 * The largest horizontal distance a single GPS sample may plausibly move in
 * the monitoring loop before we treat it as a sensor jump rather than motion.
 * Generous for walking; a real walker cannot cross this in one sample window.
 */
export const MAX_REASONABLE_JUMP_METERS = 250;

/** Rejects implausible GPS jumps between consecutive samples (§ location accuracy). */
export function isReasonableLocationSample(
  previous: Location | undefined,
  candidate: Location,
): boolean {
  if (!previous) return true;
  return distanceBetween(previous, candidate) <= MAX_REASONABLE_JUMP_METERS;
}

export function createNavigationState(route: Route): NavigationState {
  return {
    status: 'NOT_STARTED',
    currentSegmentIndex: 0,
    distanceToRouteMeters: Number.POSITIVE_INFINITY,
    distanceToNextInstructionMeters: Number.POSITIVE_INFINITY,
    nextInstruction: route.instructions[0]
      ? { text: route.instructions[0], distanceMeters: 0, segmentIndex: 0 }
      : undefined,
    offRoute: false,
  };
}

export function updateNavigationState(
  route: Route,
  location: Location,
  previous: NavigationState,
): NavigationState {
  const nearest = nearestRoutePoint(route.points, location);
  const segmentIndex = Math.min(nearest.index, Math.max(0, route.points.length - 2));
  const distanceToNextInstructionMeters = Math.max(0, (segmentIndex + 1) * (route.distanceKm * 1000) / (route.points.length - 1) - nearest.progressMeters);
  const offRoute = nearest.distanceMeters > OFF_ROUTE_THRESHOLD_METERS;
  const completed = !offRoute && nearest.index === route.points.length - 1 && nearest.distanceMeters <= ARRIVAL_THRESHOLD_METERS;

  return {
    status: completed
      ? 'COMPLETED'
      : offRoute
        ? 'OFF_ROUTE'
        : distanceToNextInstructionMeters < 80
          ? 'APPROACHING_LANDMARK'
          : 'ON_ROUTE',
    currentLocation: location,
    currentSegmentIndex: segmentIndex,
    distanceToRouteMeters: nearest.distanceMeters,
    distanceToNextInstructionMeters,
    nextInstruction: route.instructions[segmentIndex]
      ? {
          text: route.instructions[segmentIndex],
          distanceMeters: distanceToNextInstructionMeters,
          segmentIndex,
        }
      : previous.nextInstruction,
    offRoute,
  };
}

function nearestRoutePoint(points: Coordinate[], location: Coordinate) {
  let nearest = { index: 0, distanceMeters: Number.POSITIVE_INFINITY, progressMeters: 0 };
  for (let index = 0; index < points.length; index += 1) {
    const distanceMeters = distanceBetween(points[index], location);
    if (distanceMeters < nearest.distanceMeters) {
      nearest = {
        index,
        distanceMeters,
        progressMeters: index * 100,
      };
    }
  }
  return nearest;
}

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
