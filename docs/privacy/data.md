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

## Session archive

Finished walks appear under "Past walks" (`/archive`), a local view of the same SQLite stores — this adds no new collection:

- **List** — saved sessions, newest first, with the same metrics the home-screen report shows.
- **Delete** — removes one session, its events, and its metrics row from the device, plus the saved plan only when no other session references it. Confirmed with an alert before anything is deleted.
- **Export** — a user-initiated action that produces a denormalized local JSON file (`{ session, experience?, events }`) via the system share sheet. Nothing is transmitted; the export is the user's own record and survives even after the plan is deleted from the app.

The archive stores only what the walk already recorded (session lifecycle events, mission/route/screen-proxy/AI-interaction metrics) — no raw GPS traces, no audio, no personal-identifying fields beyond what the user entered for the walk.

The web build uses an in-memory repository fallback because Expo SQLite web requires WASM hosting headers. Web data is therefore not durable across a full reload; native SQLite remains the intended persistence path.

Screen metrics are OFFLINE-defined proxies. The app does not claim access to system-wide unlock counts, app switches, or device screen-on time.
