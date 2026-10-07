import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePlan, SessionRecord } from '@/domain/experience';
import * as database from '@/data/database';

// A minimal in-memory double for the Expo SQLite driver so the repository
// layer (SQL strings, parameter binding, migration statements) is testable
// in a plain Node environment. vi.mock is hoisted above the imports.
const fake = vi.hoisted(() => {
  const state = {
    execLog: [] as string[],
    runLog: [] as { sql: string; params: unknown[] }[],
    planRow: undefined as { plan_json: string } | undefined,
    sessionRow: undefined as { session_json: string } | undefined,
    eventRows: [] as {
      id: number;
      session_id: string;
      type: string;
      detail: string | null;
      created_at: string;
    }[],
  };
  const db = {
    execAsync: vi.fn(async (sql: string) => {
      state.execLog.push(sql);
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      state.runLog.push({ sql, params });
      return { lastInsertRowId: state.runLog.length, changes: 1 };
    }),
    getFirstAsync: vi.fn(async (sql: string) => {
      if (sql.includes('plan_json FROM experiences')) return state.planRow;
      if (sql.includes('session_json FROM sessions')) return state.sessionRow;
      return undefined;
    }),
    getAllAsync: vi.fn(async (sql: string) => {
      if (sql.includes('FROM session_events')) return state.eventRows;
      return [];
    }),
  };
  return { state, db };
});

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => fake.db,
}));

const plan: ExperiencePlan = {
  id: 'exp-1',
  schemaVersion: 'experience.schema.v1',
  durationMinutes: 30,
  route: {
    id: 'route-1',
    summary: 'A quiet loop.',
    points: [
      { latitude: 37.7749, longitude: -122.4194 },
      { latitude: 37.785, longitude: -122.42 },
    ],
    distanceKm: 2.2,
    durationMinutes: 30,
    instructions: ['Start by walking straight for 100 m.'],
  },
  landmarks: [],
  missions: [{ id: 'm1', prompt: 'Listen for three sounds.', estimatedMinutes: 4 }],
  attentionBudget: { maxScreenInteractions: 5, maxScreenSeconds: 90, maxAIInteractions: 3 },
  safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
  offline: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  routeSeed: 1,
};

const session: SessionRecord = {
  id: 'session-1',
  experienceId: plan.id,
  status: 'ACTIVE',
  startedAt: '2026-01-01T00:00:00.000Z',
  metrics: {
    screenInteractions: 2,
    screenSeconds: 41,
    aiInteractions: 3,
    missionCompletions: 1,
    routeCompleted: false,
    uninterruptedMinutes: 28,
  },
};

describe('SQLite repository', () => {
  beforeEach(() => {
    fake.state.execLog = [];
    fake.state.runLog = [];
    fake.state.planRow = undefined;
    fake.state.sessionRow = undefined;
    fake.state.eventRows = [];
    fake.db.execAsync.mockClear();
    fake.db.runAsync.mockClear();
    fake.db.getFirstAsync.mockClear();
    fake.db.getAllAsync.mockClear();
  });

  it('initializes an idempotent schema including session events and migrations 1 and 2', async () => {
    await database.initializeDatabase();
    const exec = fake.state.execLog.join('\n');
    expect(exec).toContain('CREATE TABLE IF NOT EXISTS session_events');
    expect(exec).toContain('CREATE INDEX IF NOT EXISTS idx_session_events_session');
    expect(exec).toContain('VALUES (1,');
    expect(exec).toContain('VALUES (2,');
    expect(fake.db.execAsync).toHaveBeenCalledTimes(2);
  });

  it('persists an experience plan as JSON', async () => {
    await database.saveExperience(plan);
    const insert = fake.state.runLog[0];
    expect(insert.sql).toContain('INSERT OR REPLACE INTO experiences');
    expect(insert.params[0]).toBe(plan.id);
    expect(JSON.parse(String(insert.params[3]))).toEqual(plan);
  });

  it('persists a session plus its metrics row', async () => {
    await database.saveSession(session);
    expect(fake.state.runLog).toHaveLength(2);
    const [sessionInsert, metricsInsert] = fake.state.runLog;
    expect(sessionInsert.sql).toContain('INSERT OR REPLACE INTO sessions');
    expect(JSON.parse(String(sessionInsert.params[3]))).toEqual(session);
    expect(metricsInsert.sql).toContain('INSERT OR REPLACE INTO session_metrics');
    expect(metricsInsert.params).toEqual([
      session.id,
      2,
      41,
      3,
      1,
      0,
      28,
    ]);
  });

  it('round-trips session events', async () => {
    await database.recordSessionEvent('session-1', 'SESSION_STARTED');
    expect(fake.state.runLog[0].sql).toContain('INSERT INTO session_events');
    expect(fake.state.runLog[0].params).toEqual(['session-1', 'SESSION_STARTED', null, expect.any(String)]);

    fake.state.eventRows = [
      { id: 1, session_id: 'session-1', type: 'SESSION_STARTED', detail: null, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 2, session_id: 'session-1', type: 'MISSION_NOTED', detail: 'm1', created_at: '2026-01-01T00:00:00.000Z' },
    ];
    const events = await database.getSessionEvents('session-1');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      id: 1,
      sessionId: 'session-1',
      type: 'SESSION_STARTED',
      detail: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(events[1].detail).toBe('m1');
  });

  it('loads the latest open session and parses experience JSON', async () => {
    fake.state.sessionRow = { session_json: JSON.stringify(session) };
    fake.state.planRow = { plan_json: JSON.stringify(plan) };

    const open = await database.getLatestOpenSession();
    expect(open).toEqual(session);

    const loaded = await database.getExperience(plan.id);
    expect(loaded).toEqual(plan);
  });
});