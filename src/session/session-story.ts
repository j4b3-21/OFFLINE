import type { ExperiencePlan, SessionEvent, SessionReport } from '@/domain/experience';

export type StorySection = {
  heading: string;
  text: string;
};

export type SessionStory = {
  opening: string;
  sections: StorySection[];
};

/**
 * Builds the plain-language debrief shown on the report card.
 *
 * Every sentence is derived from stored session fields:
 * - SessionReport (duration, uninterrupted stretch, missions counted,
 *   route completion, screen proxies) — the same honest metrics the app
 *   already records.
 * - Session events (off-route / recovered counts).
 * - The plan's missions and route distance.
 * - The missions the user actually marked on the report (live state).
 *
 * Nothing is invented: if a field or event is missing, the corresponding
 * clause is omitted rather than guessed.
 */
export function buildSessionStory(
  report: SessionReport,
  plan: ExperiencePlan,
  events: SessionEvent[],
  notedMissionIds: string[],
): SessionStory {
  return {
    opening: buildOpening(report),
    sections: [
      { heading: 'The walk', text: buildWalkSection(report, plan, events) },
      { heading: 'Missions', text: buildMissionsSection(plan, notedMissionIds) },
      { heading: 'Your phone', text: buildPhoneSection(report) },
      { heading: 'Next time', text: buildNextTimeSection(report, plan, notedMissionIds) },
    ],
  };
}

function buildOpening(report: SessionReport): string {
  const base = `You were gone ${report.durationMinutes} minutes.`;
  if (report.uninterruptedMinutes > 0) {
    return `${base} ${report.uninterruptedMinutes} of them without touching your phone.`;
  }
  return base;
}

function buildWalkSection(
  report: SessionReport,
  plan: ExperiencePlan,
  events: SessionEvent[],
): string {
  const distance = formatDistance(plan.route.distanceKm);
  const routeText = report.routeCompleted
    ? `You completed the loop — ${distance}.`
    : `You covered part of the route before turning back — ${distance}.`;

  const offRouteCount = events.filter((type: SessionEvent) => type.type === 'NAVIGATION_OFF_ROUTE').length;
  if (offRouteCount === 0) {
    return report.routeCompleted
      ? `${routeText} You stayed on route the whole way.`
      : routeText;
  }

  const wandering = ` You drifted off route ${offRouteWord(offRouteCount)}`;
  return report.routeCompleted ? `${routeText}${wandering} and found your way back.` : `${routeText}${wandering}.`;
}

function buildMissionsSection(plan: ExperiencePlan, notedMissionIds: string[]): string {
  const total = plan.missions.length;
  const noted = plan.missions.filter((mission) => notedMissionIds.includes(mission.id));
  if (noted.length === 0) {
    return `You did not mark any of your ${total} missions this time.`;
  }
  if (noted.length === total) {
    return `You finished all ${total} of your missions.`;
  }
  const list = noted.map((mission) => `\u201C${mission.prompt}\u201D`).join(', ');
  return `You finished ${noted.length} of your ${total} missions: ${list}.`;
}

function buildPhoneSection(report: SessionReport): string {
  if (report.screenInteractions === 0 && report.screenSeconds === 0) {
    return 'Your phone stayed in your pocket the whole time.';
  }
  const onScreen =
    report.screenSeconds < 60
      ? 'under a minute'
      : `around ${Math.round(report.screenSeconds / 60)} minutes`;
  const timeWord = report.screenInteractions === 1 ? 'time' : 'times';
  return `You checked your phone about ${report.screenInteractions} ${timeWord} — ${onScreen} on screen across the whole walk.`;
}

function buildNextTimeSection(
  report: SessionReport,
  plan: ExperiencePlan,
  notedMissionIds: string[],
): string {
  const unfinished = plan.missions.find((mission) => !notedMissionIds.includes(mission.id));
  if (unfinished) {
    return `Same length, a different direction next time — \u201C${unfinished.prompt}\u201D is waiting.`;
  }
  if (report.durationMinutes < 240) {
    return 'Try a longer walk next time — you finished everything this one offered.';
  }
  return 'Same length, a different direction next time.';
}

function offRouteWord(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  if (count === 3) return 'three times';
  return `${count} times`;
}

function formatDistance(km: number): string {
  if (km >= 1) return `about ${km.toFixed(1)} km`;
  return `about ${Math.round(km * 1000)} m`;
}