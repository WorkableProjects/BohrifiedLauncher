# Flow Spectator Join Whiteboard Plan

## Objective

Add a no-setup, Netlify-hosted spectator mode for Flow so a user can join a whiteboard with a short code, view the live board, and never edit it.

This should feel like a simple Flow feature, not a separate app or infrastructure project. The intention is: user opens Flow, shares a session code, someone else visits `/join/<CODE>`, and they see the live board in read-only mode.

---

## Core concept

- The tutor/author creates a live whiteboard session.
- The app generates a short code such as `ABC123`.
- The spectator opens `https://bohrified.netlify.app/join/ABC123`.
- The app resolves the code to the active Flow session.
- The spectator connects to the live relay and sees the board in real time.
- The spectator cannot draw, edit, move objects, undo, or change tools.

This is a “join code + read-only view” flow, not a collaborative edit model.

---

## Design constraints

- Zero local setup for the end user.
- Everything hosted on Netlify.
- Minimal new infrastructure: use Netlify Functions and the existing relay/service pattern.
- Keep code generation short and easy to share.
- Limit editing capabilities to the host session owner only.
- Use the same Flow render engine so the spectator view looks identical to the live board.

---

## Target user flow

### Tutor side

1. Open Flow whiteboard.
2. Click “Share / Join Code” or “Share for spectators”.
3. Choose “Create spectator link”.
4. Flow generates a 6-character code.
5. The app copies either:
   - a short link like `https://bohrified.netlify.app/join/ABC123`
   - or a direct session code `ABC123`
6. The tutor begins teaching and the board updates live.

### Spectator side

1. Visit `/join` or `/join/ABC123`.
2. The app validates the code.
3. The page shows the board title, tutor name, and a waiting/loading state.
4. Once connected, the spectator sees the current live whiteboard.
5. Spectator can pan/zoom the board for viewing, but cannot draw or edit.

---

## Architecture plan

### 1) Session code generation

Add a short-lived code registry that maps:

- `code -> session metadata`
- `session -> connected spectators`

Recommended format:

- 6 characters
- Base62: `0-9a-zA-Z`
- Example: `F7Q2K3`

This is easy to type, share, and remember.

Implementation idea:

- Netlify Function: `POST /session-code`
- Generates code + sessionId
- Stores the mapping in an ephemeral in-memory registry or a small Netlify-backed store
- Uses TTL expiration (for example, 12–24 hours)

This keeps the feature simple and does not require a full database setup.

---

### 2) Relay and session topology

The repo already has a relay concept via:

- `npm run relay`
- `scripts/session-relay.mjs`

Extend that relay to support spectator sockets.

Add these data structures:

```ts
const sessionCodes = new Map<string, { sessionId: string; expiresAt: number }>();
const sessionSpectators = new Map<string, Set<WebSocket>>();
```

When the host starts a shared board:

- create live session metadata
- assign a code
- register the code with the relay
- mark the host as the only writer

When a spectator connects:

- they send the code in the connection payload
- relay resolves `code -> sessionId`
- relay subscribes them to the host’s updates only
- spectator receives board operations, but never sends edit operations back

---

### 3) Read-only mode UI

The spectator flow should reuse the Flow board renderer, but disable all editing affordances.

Add a dedicated “spectator” board mode:

```ts
type BoardMode = "host" | "spectator";
```

When `mode === "spectator"`:

- remove tool palette
- disable pointer drawing
- disable shape creation, text tools, laser pointer, etc.
- disable selection and manipulation
- disable page creation, page reorder, undo/redo, export actions
- leave zoom and pan enabled for viewing

The board should still render all existing strokes and assets exactly as the host sees them.

This is not a separate authoring engine; it is the same board model with restrictions.

---

### 4) Join page route

Routes already exist in `netlify.toml` for `/join` and `/join/*`, which is ideal.

Add a route handler equivalent to:

- `/join` → code entry input page
- `/join/<CODE>` → direct join page and live session

Page behavior:

1. If user enters a code manually, validate it.
2. Fetch session metadata from the Netlify function or relay.
3. If valid, display a “Join as spectator” button.
4. Open the board in a read-only spectator view.

The route should be lightweight and load quickly.

---

### 5) Netlify hosting approach

This should be “easy as Claude hooking it up” and “all done”:

- Netlify static hosting for the app shell and frontend
- Netlify Functions for code generation and validation
- Existing relay for live session traffic
- No custom VM, no Docker, no external database required for MVP

This fits the repo’s current Netlify config well.

---

## Recommended implementation order

### Phase 1: Minimal v1

- Add spectator session code generation
- Add `/join/<CODE>` route
- Add a read-only board mode
- Connect spectator clients to the relay
- Allow viewing only; no editing

This is the base functionality.

### Phase 2: Product polish

- Add QR code support for easy sharing
- Add code expiration cleanup
- Add “link copied” and “code copied” feedback
- Add loading/error states
- Improve join page copy and mobile usability

### Phase 3: Optional enhancements

- “View as guest” mode with no account
- Copyable join URL shortener
- Show active participant count
- Auto-refresh expired sessions
- Better security around session validity

---

## API and service structure

### Netlify function examples

- `POST /api/session-code`
  - generates a code for the given board/session
- `GET /api/session-code/:code`
  - resolves the code to the session info
- `DELETE /api/session-code/:code`
  - removes expired/inactive session

The relay can also expose a small websocket handshake:

- `ws://.../relay?code=ABC123`
- server validates code
- server attaches connection to the board session

---

## Data model

```ts
type SessionCodeRecord = {
  code: string;
  sessionId: string;
  expiresAt: number;
  boardId?: string;
  tutorId?: string;
};
```

```ts
type SpectatorConnection = {
  sessionId: string;
  code: string;
  socket: WebSocket;
};
```

---

## Security / access model

This is intentionally read-only, so restrictions are simple:

- If code is valid and active, spectator can subscribe.
- If code is invalid/expired, disconnect and show error.
- Host retains write permissions only.
- Spectators cannot send board operations back to the host.

This is enough for a teaching demo or live classroom view without needing sign-in or authorization.

---

## Why this is the right fit for this repo

The project already has the necessary foundations:

- Flow is a real whiteboard app with a store and render pipeline.
- Netlify is already configured in the repo.
- The relay and live session concept already exists in the codebase.
- `/join` routes are already set up in `netlify.toml`.

This means the feature is a natural extension rather than a separate system.

---

## Practical implementation notes

### Keep it simple

Use the smallest working path:

- No authentication
- No external database for the first version
- No complicated multiplayer infrastructure
- Just a validated join code + live board feed

### Reuse Flow’s board state

Instead of inventing a separate viewer app, use Flow’s own board state model and gating logic.

### Make the spectator mode explicit

A read-only board should still feel like Flow:

- same rendering
- same page structure
- same zoom/pan affordances
- but no editing controls

---

## Implementation checklist

- [ ] Add spectator share button in Flow
- [ ] Generate short join code
- [ ] Register code in Netlify function/relay
- [ ] Add `/join` and `/join/<CODE>` frontend routes
- [ ] Resolve code to live session
- [ ] Establish spectator websocket connection
- [ ] Subscribe to board updates only
- [ ] Disable editing in spectator mode
- [ ] Add copy/share link UI
- [ ] Add expired-code and invalid-code states
- [ ] Deploy to Netlify

---

## Final recommendation

The cleanest version is:

- Netlify-hosted frontend
- Netlify Functions for code lookup
- Existing relay for live whiteboard updates
- Flow spectator mode that reuses the same board render path but disables all authoring actions

This is the fastest path to a useful feature with minimal setup and maximum compatibility with the Actively existing Bohrified/Flow architecture.

This gives the product exactly what is needed:

- host shares a code
- spectator joins by code
- board updates live
- spectator can view but cannot edit

That is the right product fit for a whiteboard teaching workflow and aligns with the repo’s Netlify deployment strategy.

---

## Summary

This feature does not require a new backend stack or heavy setup. It is a focused extension of the existing Flow + relay + Netlify architecture.

The implementation is straightforward:

1. create a code
2. register it to the live board session
3. resolve the code on join
4. connect the spectator to the session
5. render the live board in read-only mode

That produces the exact behavior requested: users can join a whiteboard with a code, watch edits, and cannot edit the board.

