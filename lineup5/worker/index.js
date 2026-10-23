// One Cloudflare Worker for the Sequence game:
//   POST /              -> Muse proxy (AI moves and table talk)
//   POST /room/new      -> a fresh 5-letter room code
//   GET  /room/CODE/ws  -> WebSocket into that room's Durable Object
//   POST /match         -> quick match: the code of a room that's filling up
//   GET  /daily?day=    -> daily challenge leaderboard; POST verifies and records a game
import { handleMuse } from "./muse-proxy.js";
export { Room } from "./room-do.js";
export { Board } from "./board-do.js";
export { Matchmaker } from "./match-do.js";

const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const CODE_RE = /^\/room\/([A-HJ-NP-Z]{5})\/ws$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://digitallifenotes.blog,https://www.digitallifenotes.blog").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return reply({ error: "origin not allowed" }, 403);

    // WebSocket into a room (no rate limit here: one connection per player)
    const m = url.pathname.match(CODE_RE);
    if (m) {
      if (request.headers.get("Upgrade") !== "websocket") return reply({ error: "WebSocket only" }, 426);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(request);
    }

    // daily leaderboard: reading is free, posting is rate-limited below
    if (url.pathname === "/daily" && request.method === "GET") {
      const day = url.searchParams.get("day") || "";
      const res = await env.BOARDS.get(env.BOARDS.idFromName("daily-" + day)).fetch(request);
      return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (request.method !== "POST") return reply({ error: "POST only" }, 405);
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return reply({ error: "slow down" }, 429);
    }

    if (url.pathname === "/daily") {
      const day = url.searchParams.get("day") || "";
      const res = await env.BOARDS.get(env.BOARDS.idFromName("daily-" + day)).fetch(request);
      return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/match") {
      const res = await env.MATCH.get(env.MATCH.idFromName("global")).fetch(request);
      return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/room/new") {
      const bytes = crypto.getRandomValues(new Uint8Array(5));
      const code = Array.from(bytes, (b) => CODE_ABC[b % CODE_ABC.length]).join("");
      return reply({ code });
    }
    return handleMuse(request, env, reply);
  }
};
