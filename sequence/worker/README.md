# Sequence game server (Cloudflare Worker)

One small Cloudflare Worker does two jobs for the game at digitallifenotes.blog/sequence/:

- **Online rooms**: friends play from their own phones. Each room is a Durable Object that
  holds the deck and every hand, so no player's browser ever receives another player's cards.
- **AI proxy**: AI seats ask Google Gemini for moves and table talk, in local games (through
  the proxy route) and in online rooms (the room calls Gemini itself). The page can't hold an
  API key, so the key lives only in the Worker as the secret `LLM_API_KEY`. If Gemini is busy,
  slow (12 s in rooms) or over its free limit, the built-in brain plays that turn.

Both fit in Cloudflare's **free plan**. Online rooms don't need a Muse key.

## Deploy (about 5 minutes)

You need Node.js on your computer (for `npx`) and a free Cloudflare account.

1. In this folder:
   ```
   npx wrangler login
   npx wrangler deploy
   ```
   It prints a URL like `https://sequence-game.<you>.workers.dev`.
2. Put that URL in `ROOM_SERVER` (now set to https://sequence-game.sqnce.workers.dev) in `sequence/online.js`, bump `online.js?v=` in
   `sequence/index.html`, and push. The "Play online with friends" button then appears on
   the game page. (It stays hidden on the live site until this is set.)
3. Optional, for Muse: get a key from the Meta Model API (https://ai.developer.meta.com),
   check the base URL and model ID in `wrangler.toml`, then:
   ```
   npx wrangler secret put MUSE_API_KEY
   ```
   and put the same Worker URL in `DEFAULT_PROXY` in `sequence/muse.js`.

To try a deployed Worker before publishing, open the game page and run this in the browser
console: `localStorage.setItem("seq.roomServer", "https://sequence-game.<you>.workers.dev")`.
To test it from your own computer, add `http://localhost:8765` to `ALLOWED_ORIGINS` in
`wrangler.toml` first.

## Quick match and the daily leaderboard

- `POST /match` (Durable Object `Matchmaker`) hands out the code of a public room that's filling
  up. The room starts 20 seconds after the first player sits; empty seats get AI players.
- `GET /daily?day=YYYY-MM-DD` shows the top 10 for a day; `POST` submits a game as the list of the
  player's moves. The `Board` object replays the game (same seeded deal, same Hard brain) and only
  records the result the replay produces, one entry per player, kept for a week.

## How rooms work

- "Play online with friends" asks the Worker for a 5-letter code and opens the lobby.
  Share the link (`/sequence/?room=CODE`) on WhatsApp.
- Friends pick a seat. The host (the room's creator) can fill empty seats with AI players and
  set the AI level. The host role passes to another player if the host leaves.
- If someone drops for a minute, the host can let the AI play their seat. Opening the same
  link again on the same phone gives the seat back.
- Rooms delete themselves after 2 hours without activity.
- On `localhost` without a Worker, rooms run inside the browser tab that created them and
  other tabs join through BroadcastChannel. That's only for testing.

## Free plan limits

- Durable Objects: 100,000 requests a day. Incoming WebSocket messages count 20 to 1,
  so a full game is roughly 10 requests: thousands of games a day.
- If a daily limit is ever hit, new room actions fail until midnight UTC. Nothing is charged.
- Muse calls are separate: each AI turn is one paid call to Meta. The rate limiter allows
  30 a minute per visitor. Also set a monthly spend limit in your Meta account.

## Files

- `index.js`: routes `/room/new`, `/room/CODE/ws` and the Muse proxy.
- `room-do.js`: the Durable Object (WebSocket Hibernation API).
- `../room-core.js`: room rules, shared with the localhost test hub.
- `muse-proxy.js`: calls Muse with your key.

Tests (macOS has JavaScriptCore built in):
```
J=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
$J sequence/engine.js sequence/brain.js sequence/lines.js sequence/muse.js sequence/room-core.js tests/check_room.js
$J sequence/engine.js sequence/brain.js sequence/daily.js tests/check_daily.js
$J -m tests/check_room_do.mjs
```
