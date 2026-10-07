import * as SQLite from 'expo-sqlite';

import type { ExperiencePlan, SessionEvent, SessionEventType, SessionRecord } from '@/domain/experience';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync('offline.db');
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY NOT NULL,
      schema_version TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      experience_id TEXT NOT NULL,
      status TEXT NOT NULL,
      session_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_metrics (
      session_id TEXT PRIMARY KEY NOT NULL,
      screen_interactions INTEGER NOT NULL,
      screen_seconds INTEGER NOT NULL,
      ai_interactions INTEGER NOT NULL,
      mission_completions INTEGER NOT NULL,
      route_completed INTEGER NOT NULL,
      uninterrupted_minutes INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, '${now}');
  `);
  // Migration 2: a small, queryable log of session lifecycle events. Additive
  // and idempotent, so pre-existing databases upgrade in place.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events (session_id);
    INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, '${now}');
  `);
}

export async function saveExperience(plan: ExperiencePlan): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO experiences
      (id, schema_version, duration_minutes, plan_json, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    plan.id,
    plan.schemaVersion,
    plan.durationMinutes,
    JSON.stringify(plan),
    plan.createdAt,
  );
}

export async function saveSession(session: SessionRecord): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO sessions
      (id, experience_id, status, session_json, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    session.id,
    session.experienceId,
    session.status,
    JSON.stringify(session),
    new Date().toISOString(),
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO session_metrics
      (session_id, screen_interactions, screen_seconds, ai_interactions,
       mission_completions, route_completed, uninterrupted_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    session.metrics.screenInteractions,
    session.metrics.screenSeconds,
    session.metrics.aiInteractions,
    session.metrics.missionCompletions,
    session.metrics.routeCompleted ? 1 : 0,
    session.metrics.uninterruptedMinutes,
  );
}

export async function getExperience(id: string): Promise<ExperiencePlan | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ plan_json: string }>(
    'SELECT plan_json FROM experiences WHERE id = ?',
    id,
  );
  return row ? (JSON.parse(row.plan_json) as ExperiencePlan) : undefined;
}

export async function getLatestOpenSession(): Promise<SessionRecord | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ session_json: string }>(
    `SELECT session_json FROM sessions
     WHERE status IN ('PLANNED', 'STARTED', 'ACTIVE')
     ORDER BY created_at DESC LIMIT 1`,
  );
  return row ? (JSON.parse(row.session_json) as SessionRecord) : undefined;
}

export async function recordSessionEvent(
  sessionId: string,
  type: SessionEventType,
  detail?: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO session_events (session_id, type, detail, created_at)
     VALUES (?, ?, ?, ?)`,
    sessionId,
    type,
    detail ?? null,
    new Date().toISOString(),
  );
}

export async function getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    session_id: string;
    type: SessionEventType;
    detail: string | null;
    created_at: string;
  }>(
    `SELECT id, session_id, type, detail, created_at
     FROM session_events WHERE session_id = ? ORDER BY id ASC`,
    sessionId,
  );
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  }));
}
