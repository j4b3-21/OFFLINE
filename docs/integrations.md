# Local integrations

## On-device model

`LocalModel` is the application boundary. It exposes load, generate, stream, unload, metadata, and health without leaking runtime calls into walking or planning code. The model receives compact state and produces bounded text. Route geometry, distance, bearing, movement, and safety remain deterministic.

### Mock planner (default)

The default provider is `MockModel` (`src/ai/mock/mock-model.ts`), selected by `integrationConfig.ai.provider = 'mock'`. It is a deterministic, fully offline planner with no download, no inference, and no network. It consumes the same `LocalModel` interface as the TinyLlama adapter and sits behind the same schema, safety, and constraint validation gates.

Everything the Mock planner produces is derived from real inputs:

- route geometry is generated around the start location for a given duration and seed;
- route distance, walking time, and turn instructions are computed from the generated coordinates (honest geometry, not claims);
- landmarks are attention anchors ("Halfway point", "Quiet stretch") rather than surveyed environmental features;
- missions come from a fixed physical-world pool (no phone-dependent tasks), chosen by the walk mode (see plan variants in `docs/architecture/mvp.md`);
- walking cues are short and deduplicated against recent cue history.

**Plan-aware cue rules.** When the monitor passes a `landmarkAhead` whose title appears in no `recentCueHistory` entry, the cue becomes `"{title} is ahead — {description}"` instead of the ambient pool — once per landmark. Otherwise, when `mission` is present and its prompt appears in no history entry, the cue becomes `"While you walk: {prompt}"` — once per mission. Otherwise the existing movement-state ambient pool is used unchanged. Cue frequency and cadence are unaffected; the dedupe history guarantees each landmark/mission is referenced at most once. The context itself comes from `resolveCueContext` (`src/walking/cue-context.ts`): the nearest landmark within 400 m and the mission matching current route progress. Missing plan, navigation, or location degrades to ambient cues.

### TinyLlama (optional)

The production-grade on-device model is TinyLlama 1.1B Chat, Q4_K_M GGUF, pinned to the repository commit in `src/config/integrations.ts`. The expected artifact is 668,788,096 bytes. `llama.rn` provides the thin native bridge to llama.cpp on iOS and Android. On first use, the app downloads the pinned artifact directly to its private document directory, validates the exact size, and atomically promotes it to the runtime path; the download dialog only appears when `provider = 'tinyllama'`. The model is never bundled into the native application and is not downloaded again after a successful setup. Expo Go is unsupported because it cannot load this project's custom native inference module; use `npx expo run:ios` or `npx expo run:android`.

Known limitation of the TinyLlama path (not exercised by the default Mock planner): plan JSON can exceed the fixed 128-token budget, the adapter has no chat template/JSON grammar, and native init errors surface only in device logs. The walking prompt (`src/ai/prompts.ts`) now carries the same optional landmark/mission context that the mock uses — so the real-model prompt stays aligned with the mock's deterministic rules — but the on-device TinyLlama engine is still **not** the active cue generator; `MockModel` implements these rules today. The Mock planner keeps the MVP end-to-end while these are addressed. Switching providers is `integrationConfig.ai.provider` in `src/config/integrations.ts`.

## Device voice

`SystemVoiceProvider` uses `expo-speech` only. Language, rate, pitch, volume, interruption, and unavailable-device behavior are handled by the system TTS API. No audio artifact, voice ID, proxy, account, or network is involved.

## Spotify

Spotify remains an independent optional handoff through its URI scheme. OFFLINE does not send audio to the model and the walking experience does not require Spotify.

## Limitations

Physical-device benchmarks are required before making claims about latency, RAM, or battery of the TinyLlama path. The web build intentionally reports that the native model is unavailable and renders an explicit cached-route preview instead of live tiles. The model is small and is intended for short walking cues, not general reasoning or safety-critical decisions.

## Development build status

- **Dev build works.** The app runs as an iOS development build on the simulator (iPhone 17 Pro, iOS 26.1, Xcode 27.0, SDK 57). `expo-dev-client` (~57.0.19) is required because the `llama.rn` native module cannot load in Expo Go.
- **Reproduce:** `npx expo install expo-dev-client` → `npx expo prebuild --clean` → `npx expo run:ios` (device variant: `npx expo run:ios --device`). Simulator steps, environment versions, and the manual on-device checklist are recorded in `docs/device-verification.md`.
- **Android:** not buildable on this machine (Android SDK not installed); `npx expo run:android` once the SDK is present.
- **Physical device (BLOCKED, human-in-the-loop):** real GPS, device TTS, and haptics have not yet been verified on hardware. See the checklist in `docs/device-verification.md` — items marked 🔒 (phone away, cues/haptics, return) require a physical iPhone.
- **TinyLlama provider:** the pinned GGUF is downloaded to the app's private document directory on first use (exact-size validated); it is not bundled into the native build. Tested end-to-end only as far as the download flow; on-device inference latency/RAM/battery remains unbenchmarked.
