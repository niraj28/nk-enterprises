// Durable Object: the daily challenge leaderboard, one per day. A submission is the player's
// moves; the board replays the whole game (same seeded deal, same Hard brain) and only records
// the result the replay produces, so a made-up score can't get in.
import "../engine.js";
import "../brain.js";
import "../daily.js";

const { replay, validDay } = globalThis.SeqDaily;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const RANK = { win: 0, draw: 1, loss: 2 };
const order = (a, b) => RANK[a.result] - RANK[b.result] || (a.result === "win" ? a.moves - b.moves : b.moves - a.moves) || a.at - b.at;
const publicRow = (e) => ({ name: e.name, result: e.result, moves: e.moves });

export class Board {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    const day = url.searchParams.get("day") || "";
    if (!validDay(day)) return Response.json({ error: "bad day" }, { status: 400 });
    let entries = (await this.ctx.storage.get("entries")) || [];

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
      const player = clean(body.player, 40), name = clean(body.name, 16);
      if (!player || !name) return Response.json({ error: "name required" }, { status: 400 });
      const mine = entries.find((e) => e.player === player);
      if (!mine) {
        const r = replay(day, body.moves);
        if (!r.ok) return Response.json({ error: "Couldn't verify that game (" + r.why + ")." }, { status: 422 });
        entries.push({ player, name, result: r.result, moves: r.moves, at: Date.now() });
        entries.sort(order);
        if (entries.length > 500) entries = entries.slice(0, 500);
        await this.ctx.storage.put("entries", entries);
        await this.ctx.storage.setAlarm(Date.now() + 8 * 86400000); // keep a week of boards
      }
      const rank = entries.findIndex((e) => e.player === player) + 1;
      return Response.json({ rank, total: entries.length, top: entries.slice(0, 10).map(publicRow), already: !!mine });
    }
    return Response.json({ total: entries.length, top: entries.slice(0, 10).map(publicRow) });
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}
