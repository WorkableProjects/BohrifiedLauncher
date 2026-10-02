# Same-room hosting and joining

Use this when everyone is in the same room (or on the same Wi-Fi or hotspot) and Bohrified is installed on the **host's computer**. It works without internet. For video calls or people on other networks, use **Online** instead (the default): joiners just visit the Bohrified site and enter the code, see [live-sessions.md](live-sessions.md).

## Before you start

- Node 20.19 or newer, and the repository installed (`npm install`).
- The host computer and the joining devices are on the **same network**. A guest or school Wi-Fi that isolates devices will block this; a phone hotspot that the other devices join works.
- A hotspot's address is not reachable from other networks, so this mode can't reach people elsewhere.

## Host

1. In the repository folder, run:
   ```
   npm run serve
   ```
   It builds Bohrified the first time and again whenever the code is newer than the last build (`npm run serve -- --build` forces it), then prints the addresses, for example:
   ```
   http://192.168.1.20:8787/
   Students join at http://192.168.1.20:8787/join/<CODE>
   ```
   Use `PORT=9000 npm run serve` for a different port. (While developing, `npm run dev -- --host` does the same with hot reload, on port 5173.)
2. On the host computer, open Flow at **that address** (`http://192.168.1.20:8787/`), not `localhost`, so the link Flow copies works on other devices.
3. In Flow, open **Student view**, choose **Same network**, and press **Start live session**.
4. Flow shows the **address**, **port** and **code**, and a link. Tell people those three things, or share the link.
5. To stop, use **Pause** or **End session** in Student view. Stop the server with Ctrl+C.

## Join

On any device on the same network, the easiest way is to **open just the host's address** (`http://192.168.1.20:8787/`). The Bohrified home screen shows a green **“A live whiteboard is being shared here”** bubble while a session is running; tap it to join, no code needed. (The bubble only appears on the host's own copy, never on the hosted site.) Or either:

- **Open the link** Flow shows, such as `http://192.168.1.20:8787/join/K7QX2M?via=local`; or
- Go to the Join Whiteboard page, open **In the same room? Join with an address**, enter the **Address**, **Port** and **Code**, and press **Join this address**. The Join page can be the Bohrified site or the host's own copy: the form opens the host's computer directly.

Joiners can watch and pan or zoom, but can't edit. If the board doesn't appear straight away it shows "Waiting for tutor" until the host starts sharing.

## Projecting to a school screen

Open the link in the screen's browser, or use the address form on its Join page. The screen has to be on the same network as the host computer.

## Troubleshooting

**Start here:** on the joining device, open `http://<address>:<port>/health` (for example `http://192.168.4.76:8787/health`). If it shows `{"ok":true,…}`, the network is fine and the problem is the session (code, or Online vs Same network). If it just spins or times out, the device can't reach the host: see the first two rows.

| Problem | What to try |
|---|---|
| `/health` spins forever on the other device | The network is blocking it. On a Mac, open System Settings → Network → Firewall: turn it off for the session, or allow incoming connections for Node. Some hotspots (many Android phones, some carriers) isolate devices from each other: turn that off in the hotspot settings, or use a different network or your iPhone's hotspot. Also confirm the address is the Mac's current one (`npm run serve` prints it; VPNs add extra addresses, use the one on the hotspot's range). |
| The page won't load on another device | Check both are on the same network, the address and port match what `npm run serve` printed, and the host's firewall allows Node (allow it when your OS asks, or add it in the firewall settings). |
| Flow shows "Couldn't find this computer's network address" | Open Flow at the IP address instead of `localhost`; make sure the host is on Wi-Fi or Ethernet. |
| The link opens but says "Session not found" | The code is wrong or the session ended. Start a new one and use the new code. |
| It worked, then stopped | The host computer slept or changed networks. Its address may have changed: start the server again and use the new address. |
| The code works on the host but not elsewhere | The host chose **Online** instead of **Same network**, or the joiner opened a link without `?via=local`. Use the link or the address form. |
| You see an error about mixed content or a blocked request | Open the host's own address (`http://<IP>:<port>/`) rather than the `https://` site; browsers block the hosted site from reaching a computer's address. |

## How it differs from Online

|  | Online (default) | Same network |
|---|---|---|
| For | video calls, other networks | same room / same Wi-Fi or hotspot |
| Joiners enter | the code, at the Bohrified site | address, port and code (or open the link) |
| Runs through | the hosted site | the host's computer |
| Needs internet | yes | no |
