import type { ExperiencePlan, SessionEvent, SessionEventType, SessionRecord } from '@/domain/experience';

const experiences = new Map<string, ExperiencePlan>();
const sessions = new Map<string, SessionRecord>();
// The web fallback stores SessionRecords without a createdAt field, so
// insertion/update time is tracked separately to mirror the SQLite
// `sessions.created_at` column for newest-first listing.
const sessionCreationTimes = new Map<string, string>();
let sessionEvents: SessionEvent[] = [];

export async function initializeDatabase(): Promise<void> {
  // The mobile build uses SQLite. Web keeps the same repository contract with
  // an in-memory fallback because Expo SQLite web requires WASM hosting headers.
}

export async function saveExperience(plan: ExperiencePlan): Promise<void> {
  experiences.set(plan.id, plan);
}

export async function saveSession(session: SessionRecord): Promise<void> {
  sessions.set(session.id, session);
  sessionCreationTimes.set(session.id, new Date().toISOString());
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

/** All saved sessions, newest first. Feeds the archive screen. */
export async function listSessions(): Promise<SessionRecord[]> {
  return [...sessions.entries()]
    .sort(([idA], [idB]) => {
      const createdA = sessionCreationTimes.get(idA) ?? '';
      const createdB = sessionCreationTimes.get(idB) ?? '';
      return createdB.localeCompare(createdA) || idB.localeCompare(idA);
    })
    .map(([, session]) => session);
}

/**
 * Deletes a session, its events, and — only when no other session references
 * it — the experience plan it was generated from.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  sessionEvents = sessionEvents.filter((event) => event.sessionId !== sessionId);
  sessions.delete(sessionId);
  sessionCreationTimes.delete(sessionId);
  if (!session) return;
  const stillReferenced = [...sessions.values()].some(
    (remaining) => remaining.experienceId === session.experienceId,
  );
  if (!stillReferenced) {
    experiences.delete(session.experienceId);
  }
}

/**
 * Exports a session as a denormalized JSON string — { session, experience?,
 * events } — so the record survives even after its plan is deleted.
 */
export async function exportSession(sessionId: string): Promise<string> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session not found.');
  const experience = experiences.get(session.experienceId);
  const events = await getSessionEvents(sessionId);
  return JSON.stringify({ session, experience, events }, null, 2);
}