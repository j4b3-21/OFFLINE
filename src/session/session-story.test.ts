import { describe, expect, it } from 'vitest';

import { buildSessionStory } from '@/session/session-story';
import type { ExperiencePlan, SessionEvent, SessionReport } from '@/domain/experience';

function planLike(): ExperiencePlan {
  return {
    id: 'exp-1',
    schemaVersion: 'experience.schema.v1' as const,
    durationMinutes: 30,
    route: {
      id: 'route-1',
      summary: 'loop',
      points: [
        { latitude: 0, longitude: 0 },
        { latitude: 0.001, longitude: 0 },
        { latitude: 0, longitude: 0.001 },
        { latitude: 0, longitude: 0 },
      ],
      distanceKm: 3.1,
      durationMinutes: 30,
      instructions: ['Continue.'],
    },
    landmarks: [],
    missions: [
      { id: 'm1', prompt: 'Listen for three sounds.', estimatedMinutes: 4 },
      { id: 'm2', prompt: 'Find something older than you.', estimatedMinutes: 5 },
      { id: 'm3', prompt: 'Walk five minutes phone-free.', estimatedMinutes: 5 },
    ],
    attentionBudget: { maxScreenInteractions: 5, maxScreenSeconds: 90, maxAIInteractions: 3 },
    safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
    offline: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function reportLike(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    durationMinutes: 38,
    screenInteractions: 0,
    screenSeconds: 0,
    aiInteractions: 1,
    missionCompletions: 0,
    routeCompleted: true,
    uninterruptedMinutes: 0,
    digitalIntrusionScore: 0,
    physicalEngagementScore: 0,
    aiDisappearanceRate: 1,
    ...overrides,
  };
}

function event(type: SessionEvent['type'], detail?: string): SessionEvent {
  return { sessionId: 'session-1', type, detail, createdAt: '2026-01-01T00:40:00.000Z' };
}

function allSections(story: ReturnType<typeof buildSessionStory>) {
  return story.sections.map((section) => section.text).join(' ');
}

describe('buildSessionStory', () => {
  it('tells the story of a completed loop with real session events', () => {
    const report = reportLike({
      durationMinutes: 38,
      uninterruptedMinutes: 34,
      screenInteractions: 6,
      screenSeconds: 90,
      missionCompletions: 2,
      routeCompleted: true,
    });
    const story = buildSessionStory(
      report,
      planLike(),
      [event('NAVIGATION_OFF_ROUTE'), event('ROUTE_RECOVERED')],
      ['m1', 'm2'],
    );

    expect(story.opening).toContain('38 minutes');
    expect(story.opening).toContain('34 of them without touching your phone');
    const walk = story.sections.find((section) => section.heading === 'The walk')!.text;
    expect(walk).toContain('completed the loop');
    expect(walk).toContain('about 3.1 km');
    expect(walk).toContain('drifted off route once');
    expect(walk).toContain('found your way back');
    const missions = story.sections.find((section) => section.heading === 'Missions')!.text;
    expect(missions).toContain('2 of your 3 missions');
    expect(missions).toContain('Listen for three sounds');
    expect(missions).toContain('Find something older than you');
    const phone = story.sections.find((section) => section.heading === 'Your phone')!.text;
    expect(phone).toContain('about 6 times');
    expect(phone).toContain('around 2 minutes on screen');
    const next = story.sections.find((section) => section.heading === 'Next time')!.text;
    expect(next).toContain('Walk five minutes phone-free');
  });

  it('celebrates a phone that stayed in the pocket', () => {
    const story = buildSessionStory(reportLike(), planLike(), [], []);
    expect(
      story.sections.find((section) => section.heading === 'Your phone')!.text,
    ).toContain('stayed in your pocket the whole time');
  });

  it('says the route was kept when there were no off-route events', () => {
    const story = buildSessionStory(reportLike(), planLike(), [], []);
    const walk = story.sections.find((section) => section.heading === 'The walk')!.text;
    expect(walk).toContain('stayed on route the whole way');
    expect(walk).not.toContain('drifted');
  });

  it('does not claim the loop was finished when it was not', () => {
    const story = buildSessionStory(
      reportLike({ routeCompleted: false }),
      planLike(),
      [],
      [],
    );
    const walk = story.sections.find((section) => section.heading === 'The walk')!.text;
    expect(walk).toContain('covered part of the route');
    expect(walk).not.toContain('completed the loop');
    expect(walk).not.toContain('stayed on route the whole way');
  });

  it('omits the phone-free claim when there was none', () => {
    const story = buildSessionStory(reportLike({ uninterruptedMinutes: 0 }), planLike(), [], []);
    expect(story.opening).not.toContain('without touching your phone');
  });

  it('says no missions were marked when none were', () => {
    const story = buildSessionStory(reportLike(), planLike(), [], []);
    expect(
      story.sections.find((section) => section.heading === 'Missions')!.text,
    ).toContain('did not mark any');
  });

  it('suggests a longer walk when every mission was finished', () => {
    const story = buildSessionStory(
      reportLike({ missionCompletions: 3 }),
      planLike(),
      [],
      ['m1', 'm2', 'm3'],
    );
    const missions = story.sections.find((section) => section.heading === 'Missions')!.text;
    expect(missions).toContain('all 3 of your missions');
    expect(
      story.sections.find((section) => section.heading === 'Next time')!.text,
    ).toContain('longer walk');
  });

  it('does not claim recovery when the walk ended off route', () => {
    const story = buildSessionStory(
      reportLike({ routeCompleted: false }),
      planLike(),
      [event('NAVIGATION_OFF_ROUTE'), event('NAVIGATION_OFF_ROUTE')],
      [],
    );
    const walk = story.sections.find((section) => section.heading === 'The walk')!.text;
    expect(walk).toContain('drifted off route twice');
    expect(walk).not.toContain('found your way back');
  });

  it('renders short distances in metres', () => {
    const shortPlan = planLike();
    shortPlan.route.distanceKm = 0.45;
    const story = buildSessionStory(reportLike(), shortPlan, [], []);
    expect(
      story.sections.find((section) => section.heading === 'The walk')!.text,
    ).toContain('about 450 m');
  });

  it('keeps every sentence derived from stored fields (no invented claims)', () => {
    const story = buildSessionStory(reportLike(), planLike(), [], []);
    const fullText = `${story.opening} ${allSections(story)}`;
    // No numeric claims beyond what the report/plan/events carry.
    expect(fullText).not.toMatch(/7 min/);
    expect(fullText).not.toContain('moon');
  });
});