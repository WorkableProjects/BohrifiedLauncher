# Live sessions and Join Whiteboard

A tutor shares their Flow whiteboard with a student on another device:

1. In Flow, the tutor opens **Student view → Start live session** and gets a six-character code (and a link such as `https://your-site/join/K7QX2M`).
2. The student opens Bohrified's **Join Whiteboard** page (`/join`), enters the code or pastes the link, and watches the board live. The student cannot edit.
3. The page shows the connection state (Connecting, Waiting for tutor, Live, Paused, Reconnecting, Session ended), the session code, the tutor's first name and the lesson title, with **Leave** and **Rejoin**.

The tutor can **pause** sharing (students keep their last view and are told it's paused) or **end** the session. A student whose connection drops reconnects on their own and asks for the board again (the same "resync" a new student window uses), so nothing is lost.

## How it works

```
Flow (tutor) ──ws──▶ relay ◀──ws── Join Whiteboard ▸ Flow viewer (student)
```

- Both sides connect to a **relay**: a small WebSocket server that passes messages for a session code. It stores nothing on disk and never reads whiteboards.
- The tutor's first connection creates the room with a random **tutor key** (kept in that browser tab's `sessionStorage`). Anyone else who learns the code can only join as a student. Students can only send `hello` / `viewer` / `bye`.
- The messages are the same ones Flow already uses between a tutor and a student window on one computer (`engine/sync.ts`); only the transport differs (`engine/transport.ts`).

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_LIVE_SESSION_URL` | build environment (Netlify → Site configuration → Environment variables) | The relay's `wss://` address. Unset = live sessions are off (the Join page and Flow say so). |
| `PORT`, `HOST` | relay | Listen address (default `0.0.0.0:8787`). |
| `ALLOWED_ORIGINS` | relay | Comma-separated site origins allowed to connect, e.g. `https://bohrified.example`. Set this in production. |
| `MAX_ROOMS`, `MAX_STUDENTS`, `MAX_MESSAGE_MB`, `ROOM_TTL_MIN` | relay | Limits (defaults 500, 64, 16, 10). |

There are no secrets in the frontend: the build only contains the relay's public address. Session codes and tutor keys are generated in the browser per session.

### Local development

`npm run dev` starts the relay on `ws://localhost:8787` along with the launcher and Flow; no configuration needed. Open `http://localhost:5173`, start a session in Flow, then open `/join` in a second window. Run the relay alone with `npm run relay`.

### Production on Netlify

Netlify hosts the static site (and redirects `/join` and `/join/*` to the app shell, see `netlify.toml`), but it **cannot run WebSocket servers**. Deploy `scripts/session-relay.mjs` (Node 20+, no dependencies) to any WebSocket-capable host (a small VM, Fly.io, Render, Railway…), put it behind TLS, then:

1. Set `VITE_LIVE_SESSION_URL=wss://live.your-domain.example` in Netlify's environment variables and redeploy.
2. Set `ALLOWED_ORIGINS=https://your-site.netlify.app` (and any custom domain) on the relay.
3. Check `https://live.your-domain.example/health` returns `{"ok":true,…}`.

Any server that implements the protocol in the header of `scripts/session-relay.mjs` works in place of the reference relay.

## Tests

`npm run test:relay` exercises the relay (room rules, role filtering, large messages, expiry, origin list, frame parser). Session code and link parsing is covered in `packages/app-sdk/src/live.test.ts`.
