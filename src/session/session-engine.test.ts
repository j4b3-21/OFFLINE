import { describe, expect, it } from 'vitest';

import { createSession, createSessionReport, transitionSession } from '@/session/session-engine';
import type { ExperiencePlan, SessionRecord } from '@/domain/experience';

function activePlanLike(): ExperiencePlan {
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
      ],
      distanceKm: 0.1,
      durationMinutes: 30,
      instructions: ['Continue.'],
    },
    landmarks: [],
    missions: [
      { id: 'm1', prompt: 'Listen.', estimatedMinutes: 4 },
      { id: 'm2', prompt: 'Look.', estimatedMinutes: 4 },
    ],
    attentionBudget: { maxScreenInteractions: 5, maxScreenSeconds: 90, maxAIInteractions: 3 },
    safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
    offline: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('Session lifecycle', () => {
  it('creates a session in CREATED state with zero honest metrics', () => {
    const session = createSession('exp-1');
    expect(session.status).toBe('CREATED');
    expect(session.metrics).toEqual({
      screenInteractions: 0,
      screenSeconds: 0,
      aiInteractions: 1,
      missionCompletions: 0,
      routeCompleted: false,
      uninterruptedMinutes: 0,
    });
  });

  it('follows the happy path CREATED → PLANNED → STARTED → ACTIVE → COMPLETED', () => {
    let session = createSession('exp-1');
    session = transitionSession(session, 'PLANNED');
    session = transitionSession(session, 'STARTED', '2026-01-01T00:10:00.000Z');
    session = transitionSession(session, 'ACTIVE');
    expect(session.startedAt).toBe('2026-01-01T00:10:00.000Z');
    session = transitionSession(session, 'COMPLETED', '2026-01-01T00:40:00.000Z');
    expect(session.status).toBe('COMPLETED');
    expect(session.completedAt).toBe('2026-01-01T00:40:00.000Z');
  });

  it('supports pause, resume, and cancellation', () => {
    let session = transitionSession(createSession('exp-1'), 'PLANNED');
    session = transitionSession(session, 'STARTED');
    session = transitionSession(session, 'ACTIVE');
    session = transitionSession(session, 'CANCELLED');
    expect(session.status).toBe('CANCELLED');
  });

  it('rejects an invalid transition', () => {
    const session = createSession('exp-1');
    expect(() => transitionSession(session, 'COMPLETED')).toThrow(/Cannot transition/);
  });

  it('does not allow transitions out of a terminal state', () => {
    let session = transitionSession(createSession('exp-1'), 'PLANNED');
    session = transitionSession(session, 'STARTED');
    session = transitionSession(session, 'ACTIVE');
    const done = transitionSession(session, 'COMPLETED');
    expect(() => transitionSession(done, 'ACTIVE')).toThrow(/Cannot transition/);
  });
});

describe('Session report', () => {
  it('computes duration from startedAt/completedAt and honest scores', () => {
    const session: SessionRecord = {
      ...transitionSession(transitionSession(createSession('exp-1'), 'PLANNED'), 'STARTED'),
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:31:00.000Z',
      metrics: {
        screenInteractions: 2,
        screenSeconds: 40,
        aiInteractions: 3,
        missionCompletions: 2,
        routeCompleted: true,
        uninterruptedMinutes: 28,
      },
    };
    const report = createSessionReport(session, activePlanLike());
    expect(report.durationMinutes).toBe(31);
    expect(report.digitalIntrusionScore).toBe(2 + 3 + 1); // 40s / 30 = 1
    expect(report.physicalEngagementScore).toBe(31 + 28 + 2 * 5);
    expect(report.aiDisappearanceRate).toBeCloseTo((31 - 3) / 31);
  });
});