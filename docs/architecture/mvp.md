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
