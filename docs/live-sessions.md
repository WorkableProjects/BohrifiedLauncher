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
- The tutor's first connection creates the room with a random **tutor key** (kept in that browser tab's `sessionStorage`). Anyone else who learns the code can only join as a student. Students can only send `hello` / `viewer` / `bye` / `edit`; `edit` goes to the tutor only and is applied only if the tutor let that device draw (see [Letting a device draw](#letting-a-device-draw)).
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

### Three ways to share

- **Online** (default): through the hosted Netlify site. Anyone, on any network, joins at `/join/<CODE>`. Uses a little Netlify usage.
- **Same network** (`npm run serve`): your computer serves Bohrified to devices on the same Wi-Fi or hotspot. No internet, no Netlify.
- **Tunnel** (`npm run tunnel`): your computer serves Bohrified and opens a free public Cloudflare link, so people on *other* networks can join without the hosted site. No Netlify usage. See [same-room.md](same-room.md#different-networks-npm-run-tunnel).

Online and Same network are chosen in Flow's Student view; with a tunnel you simply open Flow at the tunnel link (it counts as Online, and runs through your computer).

### Two ways to share, chosen in Flow's Student view

| | **Online** (default) | **Same network** |
|---|---|---|
| For | video calls, people on other networks | people in the same room / on the same Wi-Fi or hotspot |
| Joiners go to | the Bohrified site, `/join/<CODE>` (nothing to type but the code) | `/join` → *In the same room?* → address, port, code (or open the link Flow shows) |
| Runs through | the hosted site's function, even when Flow runs on your own computer | your computer (`npm run serve`) |
| Needs internet | yes | no |

Why two: a page on the hosted `https://` site can't talk to a computer's `http://` address (browsers block it), and a hotspot's address isn't reachable from other networks at all. So **Online** works from anywhere precisely because everyone meets at the hosted site, and **Same network** works by joiners opening your computer's own copy of Bohrified. Flow remembers the choice; a link carries `?via=local` so the joiner's viewer uses the same route as the tutor.

If your hosted site isn't `https://bohrified.netlify.app`, set `VITE_ONLINE_SITE_URL=https://your-site.netlify.app` when building a copy that runs on your own computer, so its **Online** option points at your site.

### Hosting from your own computer (school screens, other devices)

Step-by-step: [same-room.md](same-room.md).

`localhost` only works on the computer running the app. To let other devices reach it, serve it at the computer's network (IP) address:

- **`npm run serve`**: builds if needed and serves the app, the Join page and live sessions from one port (default 8787, or `PORT=9000 npm run serve`). It prints the addresses, e.g. `http://192.168.1.20:8787/`.
- **`npm run dev:host`**: the dev setup (hot reload) listening on the network, at `http://<IP>:5173/`.

Open Flow **at that IP address** on the host computer (not `localhost`) so the link it copies works elsewhere, then students or the school screen open `http://<IP>:8787/join/<CODE>`. If a device can't connect, allow Node through the firewall and check both are on the same network (a guest or school Wi-Fi that isolates devices will block it). The address only works for devices that can reach this computer's network; for devices on other networks, use the Netlify site instead.

### Letting a device draw

Joiners are view-only by default. To write from a second device (say your iPad while the Mac hosts), join from the iPad as usual, then on the host open **Student view → Devices watching** and switch **Can draw** on for that device (they are named by type: "iPad", "Windows PC"…). The iPad gets the drawing tools; what it draws appears on the host board and for everyone watching. Switch it off to make the device view-only again. Notes:

- The host decides: the host's Flow applies edits only from devices it allowed, and each device has a secret the host checks, so another watcher can't impersonate it. The relay only forwards `edit` messages to the host.
- It works over every route (Online, Same network, Tunnel).
- A device that can draw keeps its own view (pan and zoom freely) instead of following the host's camera.
- Permission is held by the host's Flow: if the host reloads, switch the device on again. Ending the session or a device leaving clears it.
- It's a shared board, not separate copies: simultaneous edits to the same object follow last-change-wins.

### Production on Netlify

Nothing extra: `netlify.toml` routes `/join` and `/join/*` to the app shell and registers the `netlify/functions` directory; the function stores sessions in Netlify Blobs (included with every site). Deploy and open `/join`. Check `https://your-site.netlify.app/api/live/health` returns `{"ok":true,…}`.

## Tests

`npm run test:relay` exercises the relay (room rules, role filtering, large messages, expiry, origin list, frame parser) and the HTTP protocol (`tests/live-http.test.mjs`). Session code and link parsing is covered in `packages/app-sdk/src/live.test.ts`.
