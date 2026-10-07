# Local data and privacy

OFFLINE does not require an account, cloud AI, remote analytics, or a network connection to start a prepared experience.

The native app stores:

- the versioned experience pack and route geometry;
- session lifecycle state;
- mission, route, screen-proxy, and AI-interaction metrics;
- a normalized session metrics row for future reporting;
- a small session-event log (session created / started, experience generated,
  off-route and recovery, missions noted, session completed) — explicit
  lifecycle events only, never raw GPS traces.

Location is requested only when planning or starting an experience and remains in process memory for navigation. It is not uploaded by this MVP. Raw audio is never recorded.

The web build uses an in-memory repository fallback because Expo SQLite web requires WASM hosting headers. Web data is therefore not durable across a full reload; native SQLite remains the intended persistence path.

Screen metrics are OFFLINE-defined proxies. The app does not claim access to system-wide unlock counts, app switches, or device screen-on time.
