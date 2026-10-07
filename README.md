# OFFLINE

OFFLINE is an offline-first AI walking companion: it prepares a short route locally, gives occasional spoken cues, and then gets out of the way.

> An AI whose success is measured by how little you need it.

## What works today (MVP)

The full pre-walk → walk → report loop runs on a device:

1. Enter how much time you have.
2. Pick a walk mode — **Quiet**, **Curious**, or **Explore new area** — and OFFLINE plans a loop near your location (route, landmarks, missions, attention budget) using the **Mock planner** — a deterministic, fully offline planner built on real inputs (duration, seed, mode, start location) with honest geometry. In the evening it adds one light-aware mission.
3. Review the route on the map, then **Start**.
4. The phone becomes secondary: occasional spoken cues and haptics only at meaningful moments (turn, off-route, recovery, mission pacing). Cues know the plan — a planned landmark ("Halfway point is ahead") or active mission ("While you walk: …") replaces the ambient cue at most once each, no extra chatter.
5. Complete the walk, note which missions you noticed, and get a **story report** — an honest written account of the walk with a one-tap audible "Read my debrief": outdoor time, uninterrupted time, route completion, missions noticed, digital intrusion score, physical engagement score, AI disappearance rate.
6. Past walks stay available under **"Past walks"** (`/archive`): list, export any session as local JSON, or delete it.

Scores and screen values are OFFLINE-defined experimental metrics, measured inside the app only. The app does not claim system-wide unlock counts or screen-on time.

## Architecture

```text
React Native + Expo
  -> SQLite (experiences, sessions, metrics, session events)
  -> GPS and deterministic route/safety logic
  -> LocalModel abstraction (Mock planner by default, TinyLlama optional)
  -> device text-to-speech
```

`LocalModel` is the application boundary. The default is `MockModel` (deterministic, no download, no inference). The on-device TinyLlama path remains available by setting `integrationConfig.ai.provider = 'tinyllama'` in `src/config/integrations.ts` — see `docs/integrations.md`. Plan-aware cues come from `resolveCueContext` (plan → monitor → model), walk modes come from a pure `plan-variants` module, and the session archive (`/archive`) lives on SQLite list/delete/export queries — see `docs/architecture/mvp.md`.

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

The first native run needs a development build (the `llama.rn` native module cannot load in Expo Go): `npx expo install expo-dev-client` → `npx expo prebuild --clean` → `npx expo run:ios` (or `npm run ios`). The iOS simulator build is verified; physical-device GPS/TTS/haptics checks are still human-in-the-loop — see `docs/device-verification.md`.

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