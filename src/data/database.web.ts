import type { ExperiencePlan, SessionEvent, SessionEventType, SessionRecord } from '@/domain/experience';

const experiences = new Map<string, ExperiencePlan>();
const sessions = new Map<string, SessionRecord>();
const sessionEvents: SessionEvent[] = [];

export async function initializeDatabase(): Promise<void> {
  // The mobile build uses SQLite. Web keeps the same repository contract with
  // an in-memory fallback because Expo SQLite web requires WASM hosting headers.
}

export async function saveExperience(plan: ExperiencePlan): Promise<void> {
  experiences.set(plan.id, plan);
}

export async function saveSession(session: SessionRecord): Promise<void> {
  sessions.set(session.id, session);
}

export async function getExperience(id: string): Promise<ExperiencePlan | undefined> {
  return experiences.get(id);
}

export async function getLatestOpenSession(): Promise<SessionRecord | undefined> {
  return [...sessions.values()]
    .filter((session) => ['PLANNED', 'STARTED', 'ACTIVE'].includes(session.status))
    .sort((a, b) => b.id.localeCompare(a.id))[0];
}

export async function recordSessionEvent(
  sessionId: string,
  type: SessionEventType,
  detail?: string,
): Promise<void> {
  sessionEvents.push({ sessionId, type, detail, createdAt: new Date().toISOString() });
}

export async function getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  return sessionEvents.filter((event) => event.sessionId === sessionId);
}
