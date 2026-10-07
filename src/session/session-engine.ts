import type { ExperiencePlan, SessionRecord, SessionReport, SessionStatus } from '@/domain/experience';

const transitions: Record<SessionStatus, SessionStatus[]> = {
  CREATED: ['PLANNED', 'FAILED'],
  PLANNED: ['STARTED', 'CANCELLED', 'FAILED'],
  STARTED: ['ACTIVE', 'INTERRUPTED', 'SAFETY_OVERRIDE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'INTERRUPTED', 'SAFETY_OVERRIDE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  INTERRUPTED: [],
  SAFETY_OVERRIDE: [],
  FAILED: [],
};

export function createSession(experienceId: string): SessionRecord {
  return {
    id: `session-${Date.now()}`,
    experienceId,
    status: 'CREATED',
    metrics: {
      screenInteractions: 0,
      screenSeconds: 0,
      aiInteractions: 1,
      missionCompletions: 0,
      routeCompleted: false,
      uninterruptedMinutes: 0,
    },
  };
}

export function transitionSession(
  session: SessionRecord,
  nextStatus: SessionStatus,
  now = new Date().toISOString(),
): SessionRecord {
  if (!transitions[session.status].includes(nextStatus)) {
    throw new Error(`Cannot transition session from ${session.status} to ${nextStatus}.`);
  }

  return {
    ...session,
    status: nextStatus,
    startedAt: nextStatus === 'STARTED' ? now : session.startedAt,
    completedAt: nextStatus === 'COMPLETED' ? now : session.completedAt,
  };
}

export function createSessionReport(session: SessionRecord, plan: ExperiencePlan): SessionReport {
  const durationMinutes = Math.max(
    1,
    session.startedAt && session.completedAt
      ? Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000)
      : plan.durationMinutes,
  );
  const digitalIntrusionScore =
    session.metrics.screenInteractions +
    session.metrics.aiInteractions +
    Math.round(session.metrics.screenSeconds / 30);
  const physicalEngagementScore =
    durationMinutes + session.metrics.uninterruptedMinutes + session.metrics.missionCompletions * 5;

  return {
    ...session.metrics,
    durationMinutes,
    digitalIntrusionScore,
    physicalEngagementScore,
    aiDisappearanceRate: Math.max(
      0,
      Math.min(1, (durationMinutes - session.metrics.aiInteractions) / durationMinutes),
    ),
  };
}
