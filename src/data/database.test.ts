import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePlan, SessionRecord } from '@/domain/experience';
import * as database from '@/data/database';

// A minimal in-memory double for the Expo SQLite driver so the repository
// layer (SQL strings, parameter binding, migration statements) is testable
// in a plain Node environment. vi.mock is hoisted above the imports.
//
// The double stores rows for experiences, sessions, and session events so the
// list/delete/export repository behavior (ordering, cascade delete, orphan
// cleanup, denormalized export) is verified end-to-end against the fake
// driver, not just by asserting SQL strings.
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
    experienceRows: [] as { id: string; plan_json: string }[],
    sessionRows: [] as {
      id: string;
      experience_id: string;
      session_json: string;
      created_at: string;
    }[],
  };
  const db = {
    execAsync: vi.fn(async (sql: string) => {
      state.execLog.push(sql);
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      state.runLog.push({ sql, params });
      if (sql.includes('INSERT OR REPLACE INTO experiences')) {
        state.experienceRows = state.experienceRows.filter((row) => row.id !== params[0]);
        state.experienceRows.push({ id: String(params[0]), plan_json: String(params[3]) });
      } else if (sql.includes('INSERT OR REPLACE INTO sessions')) {
        state.sessionRows = state.sessionRows.filter((row) => row.id !== params[0]);
        state.sessionRows.push({
          id: String(params[0]),
          experience_id: String(params[1]),
          session_json: String(params[3]),
          created_at: String(params[4]),
        });
      } else if (sql.includes('INSERT INTO session_events')) {
        state.eventRows.push({
          id: state.eventRows.length + 1,
          session_id: String(params[0]),
          type: String(params[1]),
          detail: params[2] == null ? null : String(params[2]),
          created_at: String(params[3]),
        });
      } else if (sql.includes('DELETE FROM session_events')) {
        state.eventRows = state.eventRows.filter((row) => row.session_id !== params[0]);
      } else if (sql.includes('DELETE FROM sessions')) {
        state.sessionRows = state.sessionRows.filter((row) => row.id !== params[0]);
      } else if (sql.includes('DELETE FROM experiences')) {
        state.experienceRows = state.experienceRows.filter((row) => row.id !== params[0]);
      }
      // Metrics live inside session_json in this double, so session_metrics
      // deletes are accepted and ignored.
      return { lastInsertRowId: state.runLog.length, changes: 1 };
    }),
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('SELECT plan_json FROM experiences')) {
        if (state.planRow !== undefined) return state.planRow;
        const row = state.experienceRows.find((entry) => entry.id === params[0]);
        return row ? { plan_json: row.plan_json } : undefined;
      }
      if (sql.includes('SELECT session_json FROM sessions WHERE id = ?')) {
        const row = state.sessionRows.find((entry) => entry.id === params[0]);
        return row ? { session_json: row.session_json } : undefined;
      }
      if (sql.includes('SELECT session_json FROM sessions')) {
        if (state.sessionRow !== undefined) return state.sessionRow;
        const open = state.sessionRows
          .filter((row) =>
            ['PLANNED', 'STARTED', 'ACTIVE'].includes(
              (JSON.parse(row.session_json) as SessionRecord).status,
            ),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return open ? { session_json: open.session_json } : undefined;
      }
      if (sql.includes('SELECT experience_id FROM sessions WHERE id = ?')) {
        const row = state.sessionRows.find((entry) => entry.id === params[0]);
        return row ? { experience_id: row.experience_id } : undefined;
      }
      if (sql.includes('SELECT COUNT(*) AS n FROM sessions')) {
        const n = state.sessionRows.filter((row) => row.experience_id === params[0]).length;
        return { n };
      }
      return undefined;
    }),
    getAllAsync: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('FROM session_events')) {
        return state.eventRows
          .filter((row) => row.session_id === params[0])
          .sort((a, b) => a.id - b.id);
      }
      if (sql.includes('SELECT session_json FROM sessions')) {
        return state.sessionRows
          .slice()
          .sort(
            (a, b) =>
              b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
          )
          .map((row) => ({ session_json: row.session_json }));
      }
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
    fake.state.experienceRows = [];
    fake.state.sessionRows = [];
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

  it('lists sessions newest first', async () => {
    fake.state.sessionRows = [
      {
        id: 'session-old',
        experience_id: 'exp-1',
        session_json: JSON.stringify({ ...session, id: 'session-old' }),
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'session-new',
        experience_id: 'exp-1',
        session_json: JSON.stringify({ ...session, id: 'session-new' }),
        created_at: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'session-mid',
        experience_id: 'exp-1',
        session_json: JSON.stringify({ ...session, id: 'session-mid' }),
        created_at: '2026-01-15T00:00:00.000Z',
      },
    ];

    const rows = await database.listSessions();

    expect(rows.map((row) => row.id)).toEqual(['session-new', 'session-mid', 'session-old']);
    // The native implementation must delegate ordering to SQL, not to JS.
    expect(fake.db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
    );
  });

  it('deletes a session, its events, and its orphaned experience', async () => {
    await database.saveExperience(plan);
    await database.saveSession(session);
    await database.recordSessionEvent(session.id, 'SESSION_STARTED');
    await database.recordSessionEvent(session.id, 'SESSION_COMPLETED');

    await database.deleteSession(session.id);

    expect(fake.state.sessionRows).toHaveLength(0);
    expect(fake.state.eventRows).toHaveLength(0);
    expect(fake.state.experienceRows).toHaveLength(0);
  });

  it('keeps an experience that another session still references', async () => {
    await database.saveExperience(plan);
    await database.saveSession(session);
    await database.saveSession({ ...session, id: 'session-2' });

    await database.deleteSession(session.id);

    expect(fake.state.sessionRows.map((row) => row.id)).toEqual(['session-2']);
    expect(fake.state.experienceRows).toHaveLength(1);
  });

  it('exports a denormalized session JSON that survives plan deletion', async () => {
    await database.saveExperience(plan);
    await database.saveSession(session);
    await database.recordSessionEvent(session.id, 'SESSION_STARTED');

    const exported = await database.exportSession(session.id);
    const parsed = JSON.parse(exported) as {
      session: SessionRecord;
      experience: ExperiencePlan;
      events: unknown[];
    };
    expect(Object.keys(parsed).sort()).toEqual(['events', 'experience', 'session']);
    expect(parsed.session).toEqual(session);
    expect(parsed.experience).toEqual(plan);
    expect(parsed.events).toHaveLength(1);

    // The plan is later gone (e.g. the last session referencing it was
    // deleted). The export is denormalized, so the session and its events
    // must survive on their own as valid JSON.
    fake.state.planRow = undefined;
    fake.state.experienceRows = [];
    const exportedAfter = await database.exportSession(session.id);
    const after = JSON.parse(exportedAfter) as {
      session: SessionRecord;
      experience: ExperiencePlan | undefined;
      events: unknown[];
    };
    expect(after.session).toEqual(session);
    expect(after.experience).toBeUndefined();
    expect(after.events).toHaveLength(1);
  });
});