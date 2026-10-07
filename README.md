# OFFLINE

OFFLINE is an offline-first AI walking companion: it prepares a short route locally, gives occasional spoken cues, and then gets out of the way.

> An AI whose success is measured by how little you need it.

## What works today (MVP)

The full pre-walk → walk → report loop runs on a device:

1. Enter how much time you have.
2. OFFLINE plans a quiet loop near your location (route, landmarks, missions, attention budget) using the **Mock planner** — a deterministic, fully offline planner built on real inputs (duration, seed, start location) with honest geometry.
3. Review the route on the map, then **Start**.
4. The phone becomes secondary: occasional spoken cues and haptics only at meaningful moments (turn, off-route, recovery, mission pacing).
5. Complete the walk, note which missions you noticed, and get a report: outdoor time, uninterrupted time, route completion, missions noticed, digital intrusion score, physical engagement score, AI disappearance rate.

Scores and screen values are OFFLINE-defined experimental metrics, measured inside the app only. The app does not claim system-wide unlock counts or screen-on time.

## Architecture

```text
React Native + Expo
  -> SQLite (experiences, sessions, metrics, session events)
  -> GPS and deterministic route/safety logic
  -> LocalModel abstraction (Mock planner by default, TinyLlama optional)
  -> device text-to-speech
```

`LocalModel` is the application boundary. The default is `MockModel` (deterministic, no download, no inference). The on-device TinyLlama path remains available by setting `integrationConfig.ai.provider = 'tinyllama'` in `src/config/integrations.ts` — see `docs/integrations.md`.

## Development

```bash
npm install
npx expo start
```

Build the native development app normally:

```bash
npm run ios
npm run android
```

Native builds use `react-native-maps` (Apple/Google tiles) for planning preview and fallback navigation. The web build renders an explicit cached-route preview. A network connection is not required to start a prepared experience; GPS is, for live navigation — with a clear fallback when it is unavailable.

The TinyLlama native module (`llama.rn`) requires an Expo development or release build; it is not used by the default Mock planner.

## Testing

```bash
npx tsc --noEmit
npx expo lint
npm test
```

Tests cover the Mock planner (schema/safety validation, determinism, cue rules), experience validation, navigation, safety, audio-priority, and the SQLite repository (schema migration 1–2, persistence, session events) against an in-memory SQLite double.

## Product boundaries

Route geometry and safety decisions are deterministic; the model layer only writes short natural-language cues and experience text. Voice is always the device's system TTS. SQLite, random route generation, configurable movement checks, and optional Spotify handoff remain independent local walking features.

Project metrics are experimental and not clinically validated. OFFLINE is a behavioral research prototype, not a medical product.