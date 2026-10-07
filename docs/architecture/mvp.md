# MVP architecture

OFFLINE is a local-first vertical slice:

```text
React Native UI
  -> ExperienceEngine + SessionEngine
  -> typed domain validation + deterministic SafetyEngine
  -> SQLite repositories
  -> LocalModel, LocationProvider, AudioGuidance, Haptics
```

## Route and map behavior

The experience pack stores route geometry, instructions, and landmark coordinates before a session starts. Native builds render that geometry with `react-native-maps`; the web build renders an explicit cached-route preview. Map tiles are a supporting interface, not a requirement for the outdoor session.

The planner is the `LocalModel` behind `src/ai/active-model.ts`: `MockModel` by default, `TinyLlama` when `integrationConfig.ai.provider = 'tinyllama'`. Output is always schema- and safety-validated before a session may start. If location is unavailable, the app cannot claim a safe personalized route; the saved experience remains the source of truth. This is not a live routing service and must not be presented as one.

## Navigation

`navigation-engine.ts` calculates nearest route point, route progress, approaching-instruction state, completion, and a configurable off-route state. It does not use the model for navigation decisions. `safety-engine.ts` validates the experience and instructions independently. Consecutive GPS samples are validated (`isReasonableLocationSample`) so a sensor jump is treated as no movement instead of motion or an off-route event; the walking guide remains re-connectable after an interrupted session ("Reconnect GPS guide").

## Plan-aware cues (plan → monitor → model)

Cue generation knows the walk it guides, without changing cue cadence:

```text
ExperiencePlan + NavigationState + Location
  -> resolveCueContext()            (src/walking/cue-context.ts)
       -> PlanCueContext            { landmarkAhead?, mission? }
  -> WalkingMonitor.runCheck        (dependencies.cueContext())
       -> WalkingState              { landmarkAhead?, mission? }
  -> MockModel.walkingCue           (plan-aware cue replaces ambient, once)
```

`resolveCueContext(plan, navigation, location)` returns only what the walk can honestly claim: the nearest landmark whose coordinate is within `LANDMARK_CUE_RADIUS_METERS` (400 m, inclusive-in), and the mission whose progress bracket the route currently passes through. Any missing input (no plan, no navigation, no location) resolves to an empty context, so a walk that never had location degrades to ambient cues — it never claims plan knowledge it does not have. The mission index is a deterministic function of route progress, never a wall-clock read.

The walking monitor requires `dependencies.cueContext()` and populates `WalkingState.landmarkAhead`/`mission` on every check. The mock's `walkingCue` replaces the ambient cue at most once per landmark or mission (deduplicated against `recentCueHistory`); otherwise the existing movement-state ambient pool is used unchanged. Frequency and cadence of cues are unaffected. See `docs/integrations.md` for the exact cue rules.

## Plan variants (modes + time)

`resolvePlanVariant(mode, hourOfDay)` (`src/experience/plan-variants.ts`) is pure and deterministic: the same (mode, hourOfDay) always yields the same route jitter, mission pool, and AI-interaction budget.

| Mode | Route jitter | Mission pool | maxAIInteractions |
|---|---|---|---|
| `quiet` (default) | 0.15 | `m-no-phone`, `m-look-up`, `m-texture` | 3 |
| `curious` | 0.3 | quiet pool plus leaf-shapes, three-sounds, older-than-you, brightest-colour | 3 |
| `explore` | 0.45 | furthest-thing, water, moving-thing | 4 |

During evening hours (18:00–22:00, inclusive) one light-aware mission is added to any pool: `m-light` — "Notice the fading light."

The mock planner's `buildPlan` defaults to `'quiet'` and hour 12 when the caller does not pass a mode or hour, so a plan never depends on the wall clock at cue time. `mode` and `hourOfDay` are stored as optional `routePreferences` fields; `experience.schema.v1` is unchanged. The home screen exposes a one-row Quiet / Curious / Explore new area picker at Prepare; the hour is captured at generation time only.

## Session archive (list, delete, export)

Completed sessions are listed, deletable, and exportable from `/archive` (a second screen behind a quiet "Past walks" link on the home screen). All archive behavior sits on the SQLite repositories; the web in-memory double mirrors it.

- `listSessions()` returns saved sessions, newest first.
- `deleteSession(id)` removes the session, its events, and its metrics row, plus the experience plan only when no other session still references it.
- `exportSession(id)` returns a denormalized JSON string — `{ session, experience?, events }` — so the record survives even after the plan has been deleted. Export is the user's own local take-away (`Share.share`); nothing is sent anywhere.

Archive rows show the same honest metric shape as the home-screen report (duration, date, missions N/M, route completed, DIS/PES/ADR) and are derived from the recorded session and plan — a row without a plan shows "—" instead of inventing values. Empty state: "No past walks yet — plan one on the home screen."

## Recovery

Experiences, sessions, and session metrics are stored locally, along with a small lifecycle event log (migration 2 in `src/data/database.ts`). On launch, the latest open session is recovered from SQLite so an interrupted app does not silently discard the prepared walk.

## Session metrics are honest

The report derives from measured, in-app values only:

- outdoor time and uninterrupted time come from session `startedAt`/`completedAt` minus accumulated paused time;
- screen checks and screen seconds come from `AppState` foreground transitions while the session is ACTIVE — app-local proxies, explicitly labeled, never claimed as system-wide unlock counts;
- AI interactions are the one planning interaction plus each spoken walking cue;
- route completion comes from the deterministic navigation engine;
- missions are marked by the user after the walk ("Which did you notice?"), never auto-completed.

Scores (DIS, PES, ADR) are experimental project metrics and are not clinically validated.