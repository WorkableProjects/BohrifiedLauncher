# Live sessions and Join Whiteboard

A tutor shares their Flow whiteboard with a student on another device:

1. In Flow, the tutor opens **Student view → Start live session** and gets a six-character code (and a link such as `https://workableprojects.github.io/BohrifiedLauncher/join/K7QX2M`).
2. The student opens Bohrified's **Join Whiteboard** page (`/join`), enters the code or pastes the link, and watches the board live. The student cannot edit.
3. The page shows the connection state (Connecting, Waiting for tutor, Live, Paused, Reconnecting, Session ended), the session code, the tutor's first name and the lesson title, with **Leave** and **Rejoin**.

The tutor can **pause** sharing (students keep their last view and are told it's paused) or **end** the session. A student whose connection drops reconnects on their own and asks for the board again (the same "resync" a new student window uses), so nothing is lost.

## How it works

```
Online:  Flow (tutor) ══ WebRTC (PeerJS) ══ Flow viewer (student) on Join Whiteboard
Local:   Flow (tutor) ──▶ relay /session/<CODE> ◀── Flow viewer (student)
```

The app picks the carrier per deployment (`liveBackend()` in `packages/app-sdk/src/live.ts`):

| Where | Carrier | Needs |
|---|---|---|
| **Online** (hosted site, default) | Peer-to-peer WebRTC through PeerJS. The tutor's browser hosts the session under the PeerJS id `bohrified-live-<CODE>`; students connect to it directly | nothing: static hosting (GitHub Pages) is enough |
| **Local** (`npm run dev`, `npm run serve`) | WebSocket to the relay (`ws://localhost:8787` in dev, `<origin>/api/live` when served by `npm run serve`) | nothing |
| Override | `VITE_LIVE_SESSION_URL` = `wss://…` relay, or `https://…` endpoint serving `/api/live` | a host running `scripts/session-relay.mjs` |

- **Online is peer-to-peer.** PeerJS is lazy-loaded by Flow only when a session starts (`peerTransport` in `engine/transport.ts`, `lazyPeer` in `state/live.ts`). The free public PeerJS server (`0.peerjs.com`) only does signalling; after that, messages travel directly between the tutor and each student. PeerJS's public STUN/TURN servers help with NAT traversal. Messages larger than 60,000 characters are split into chunks and reassembled.
- **Limits of peer-to-peer.** A few strict networks (some school or corporate firewalls) block WebRTC entirely. For those, use **Same network** or `npm run tunnel`. If the tutor reloads, its browser retries claiming the session id for up to 2 minutes, so students get the board back without a new code.
- **The tutor enforces the rules.** Students can only send `hello` / `viewer` / `bye` / `edit`, at most 64 students join a session, and the tutor reports the number of connected devices (`peers`) to the room. Anyone who learns the code can only join as a student. `edit` messages are applied only if the tutor let that device draw (see [Letting a device draw](#letting-a-device-draw)).
- The messages are the same ones Flow already uses between a tutor and a student window on one computer (`engine/sync.ts`); only the transport differs. Transports in `engine/transport.ts`: `channelTransport` (same computer), `socketTransport` (local relay), `pollTransport` (an HTTP endpoint set with `VITE_LIVE_SESSION_URL`), and `peerTransport` (Online).
- Nothing reads or stores whiteboards on a server. Peer-to-peer sessions have no server copy: the board lives in the tutor's browser tab. The local relay keeps rooms in memory only and forgets idle sessions after `ROOM_TTL_MIN` minutes (default 10).

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_LIVE_SESSION_URL` | build environment | Optional. `ws(s)://` = WebSocket relay; `http(s)://` = endpoint serving `/api/live`. Unset: Online uses peer-to-peer; local copies use their own relay. |
| `VITE_ONLINE_SITE_URL` | build environment | Optional. The hosted site that **Online** points joiners to, for a copy running on your own computer. Default `https://workableprojects.github.io/BohrifiedLauncher` (`DEFAULT_ONLINE_SITE`). |
| `PORT`, `HOST` | relay | Listen address (default `0.0.0.0:8787`). |
| `ALLOWED_ORIGINS` | relay | Comma-separated site origins allowed to connect. Set this when self-hosting. |
| `MAX_ROOMS`, `MAX_STUDENTS`, `MAX_MESSAGE_MB`, `ROOM_TTL_MIN` | relay | Limits (defaults 500, 64, 16, 10). |

There are no secrets in the frontend. Session codes and tutor keys are generated in the browser per session.

### Local development

`npm run dev` starts the relay on `ws://localhost:8787` along with the launcher and Flow; no configuration needed. Open `http://localhost:5173`, start a session in Flow, then open `/join` in a second window. Run the relay alone with `npm run relay`. To test the HTTP endpoint path locally, set `VITE_LIVE_SESSION_URL=http://localhost:8787` (the relay also answers `/api/live`).

### Three ways to share

- **Online** (default): through the hosted site (GitHub Pages). Anyone, on any network, joins at `/join/<CODE>`. Peer-to-peer; no server carries the board.
- **Same network** (`npm run serve`): your computer serves Bohrified to devices on the same Wi-Fi or hotspot. No internet needed. Not available on the hosted site (only on a copy served from your computer).
- **Tunnel** (`npm run tunnel`): your computer serves Bohrified and opens a free public Cloudflare link, so people on *other* networks can join without the hosted site. See [same-room.md](same-room.md#different-networks-npm-run-tunnel).

Online and Same network are chosen in Flow's Student view; with a tunnel you simply open Flow at the tunnel link (it counts as Online, and runs through your computer).

### Two ways to share, chosen in Flow's Student view

| | **Online** (default) | **Same network** |
|---|---|---|
| For | video calls, people on other networks | people in the same room / on the same Wi-Fi or hotspot |
| Joiners go to | the Bohrified site, `/join/<CODE>` (nothing to type but the code) | `/join` → *In the same room?* → address, port, code (or open the link Flow shows) |
| Runs through | the tutor's browser (WebRTC), even when Flow runs on your own computer | your computer (`npm run serve`) |
| Needs internet | yes | no |

Why two: a page on the hosted `https://` site can't talk to a computer's `http://` address (browsers block it), and a hotspot's address isn't reachable from other networks at all. So **Online** works from anywhere precisely because everyone meets at the hosted site, and **Same network** works by joiners opening your computer's own copy of Bohrified. Flow remembers the choice; a link carries `?via=local` so the joiner's viewer uses the same route as the tutor.

The default hosted site is `https://workableprojects.github.io/BohrifiedLauncher`. If yours is different, set `VITE_ONLINE_SITE_URL=https://your-site.example/BohrifiedLauncher` when building a copy that runs on your own computer, so its **Online** option points at your site.

### Hosting from your own computer (school screens, other devices)

Step-by-step: [same-room.md](same-room.md).

`localhost` only works on the computer running the app. To let other devices reach it, serve it at the computer's network (IP) address:

- **`npm run serve`**: builds if needed and serves the app, the Join page and live sessions from one port (default 8787, or `PORT=9000 npm run serve`). It prints the addresses, e.g. `http://192.168.1.20:8787/`.
- **`npm run dev:host`**: the dev setup (hot reload) listening on the network, at `http://<IP>:5173/`.

Open Flow **at that IP address** on the host computer (not `localhost`) so the link it copies works elsewhere, then students or the school screen open `http://<IP>:8787/join/<CODE>`. If a device can't connect, allow Node through the firewall and check both are on the same network (a guest or school Wi-Fi that isolates devices will block it). The address only works for devices that can reach this computer's network; for devices on other networks, use **Online** (the hosted site) instead.

### Letting a device draw

Joiners are view-only by default. To write from a second device (say your iPad while the Mac hosts), join from the iPad as usual, then on the host open **Student view → Devices watching** and switch **Can draw** on for that device (they are named by type: "iPad", "Windows PC"…). The iPad gets the drawing tools; what it draws appears on the host board and for everyone watching. Switch it off to make the device view-only again. Notes:

- The host decides: the host's Flow applies edits only from devices it allowed, and each device has a secret the host checks, so another watcher can't impersonate it. The relay only forwards `edit` messages to the host.
- It works over every route (Online, Same network, Tunnel).
- A device that can draw keeps its own view (pan and zoom freely) instead of following the host's camera.
- Permission is held by the host's Flow: if the host reloads, switch the device on again. Ending the session or a device leaving clears it.
- It's a shared board, not separate copies: simultaneous edits to the same object follow last-change-wins.

### Production on GitHub Pages

The hosted site is built and deployed by `.github/workflows/pages.yml` on every push to `main`. It runs `BASE_PATH=/BohrifiedLauncher/ npm run build` (`scripts/build.mjs`), which also writes `dist/404.html` (so deep links such as `/join/<CODE>` and `/app/*` load through the single-page fallback) and `dist/.nojekyll`.

One-time setup: in the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. Then open `https://workableprojects.github.io/BohrifiedLauncher/join`. There is no server or function to run: Online sessions are peer-to-peer.

## Tests

`npm run test:relay` exercises the relay (room rules, role filtering, large messages, expiry, origin list, frame parser) and the HTTP protocol (`tests/live-http.test.mjs`). Session code and link parsing is covered in `packages/app-sdk/src/live.test.ts`. The peer-to-peer transport is covered in `apps/flow/src/engine/peerTransport.test.ts`.
