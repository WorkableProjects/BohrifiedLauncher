# Live sessions and Join Whiteboard

A tutor shares their Flow whiteboard with a student on another device:

1. In Flow, the tutor opens **Student view → Start live session** and gets a six-character code (and a link such as `https://your-site/join/K7QX2M`).
2. The student opens Bohrified's **Join Whiteboard** page (`/join`), enters the code or pastes the link, and watches the board live. The student cannot edit.
3. The page shows the connection state (Connecting, Waiting for tutor, Live, Paused, Reconnecting, Session ended), the session code, the tutor's first name and the lesson title, with **Leave** and **Rejoin**.

The tutor can **pause** sharing (students keep their last view and are told it's paused) or **end** the session. A student whose connection drops reconnects on their own and asks for the board again (the same "resync" a new student window uses), so nothing is lost.

## How it works

```
Flow (tutor) ──▶ relay / /api/live ◀── Join Whiteboard ▸ Flow viewer (student)
```

Two interchangeable carriers move the same messages; the app picks one per deployment (`liveBackend()` in `packages/app-sdk/src/live.ts`):

| Where | Carrier | Needs |
|---|---|---|
| **Netlify** (production default) | HTTP: tutor and student poll a Netlify Function at `/api/live/<CODE>` | nothing: deploy and it works |
| **Local** (`npm run dev`) | WebSocket to the relay on `ws://localhost:8787` | nothing |
| Self-hosted | `VITE_LIVE_SESSION_URL` = `wss://…` relay, or `https://…` endpoint | a host running `scripts/session-relay.mjs` |

- Netlify can't hold a WebSocket open, so on the hosted site `netlify/functions/live.mjs` answers short requests instead (`netlify/lib/live-core.mjs`, state in Netlify Blobs). The sender batches messages into one POST (~80 ms); each side polls for what is addressed to it (about every 0.6 s while things change, 1.8 s when idle). Latency is a fraction of a second, fine for a whiteboard; it is not as instant as a socket.
- Neither carrier reads whiteboards. The WebSocket relay stores nothing on disk; the function keeps messages for about a minute and forgets idle sessions after 10 minutes.
- The tutor's first connection creates the room with a random **tutor key** (kept in that browser tab's `sessionStorage`). Anyone else who learns the code can only join as a student. Students can only send `hello` / `viewer` / `bye`.
- The messages are the same ones Flow already uses between a tutor and a student window on one computer (`engine/sync.ts`); only the transport differs (`engine/transport.ts`: `channelTransport`, `socketTransport`, `pollTransport`).
- Limits over HTTP: a single message over ~3.5 MB (a board with very large images) isn't carried; function invocations count against the Netlify plan (each watcher polls, so a class of 30 is roughly 50 requests a second at peak while the tutor draws, far fewer when idle).

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_LIVE_SESSION_URL` | build environment | Optional. `ws(s)://` = WebSocket relay; `http(s)://` = endpoint serving `/api/live`. Unset: local relay in dev, the site's own `/api/live` in production. |
| `PORT`, `HOST` | relay | Listen address (default `0.0.0.0:8787`). |
| `ALLOWED_ORIGINS` | relay | Comma-separated site origins allowed to connect. Set this when self-hosting. |
| `MAX_ROOMS`, `MAX_STUDENTS`, `MAX_MESSAGE_MB`, `ROOM_TTL_MIN` | relay | Limits (defaults 500, 64, 16, 10). |

There are no secrets in the frontend. Session codes and tutor keys are generated in the browser per session.

### Local development

`npm run dev` starts the relay on `ws://localhost:8787` along with the launcher and Flow; no configuration needed. Open `http://localhost:5173`, start a session in Flow, then open `/join` in a second window. Run the relay alone with `npm run relay`. To try the Netlify path locally, run `netlify dev` (serves the function) or set `VITE_LIVE_SESSION_URL=http://localhost:8787` (the relay also answers `/api/live`).

### Production on Netlify

Nothing extra: `netlify.toml` routes `/join` and `/join/*` to the app shell and registers the `netlify/functions` directory; the function stores sessions in Netlify Blobs (included with every site). Deploy and open `/join`. Check `https://your-site.netlify.app/api/live/health` returns `{"ok":true,…}`.

## Tests

`npm run test:relay` exercises the relay (room rules, role filtering, large messages, expiry, origin list, frame parser) and the HTTP protocol (`tests/live-http.test.mjs`). Session code and link parsing is covered in `packages/app-sdk/src/live.test.ts`.
