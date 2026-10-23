// Durable Object: quick match. Hands out the code of the room that is currently filling up for
// each mode; a new room is opened when it fills or its join window closes (the room itself starts
// on its own and gives empty seats to AI players).
const WINDOW_MS = 18 * 1000;
const SEATS = { "1v1": 2, "2v2": 4 };
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_ABC[b % CODE_ABC.length]).join("");

export class Matchmaker {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    let body = {};
    try { body = await request.json(); } catch { /* default mode */ }
    const mode = body.mode === "1v1" ? "1v1" : "2v2", now = Date.now();
    const open = (await this.ctx.storage.get(mode)) || null;
    if (open && now - open.at < WINDOW_MS && open.joined < SEATS[mode]) {
      open.joined++;
      await this.ctx.storage.put(mode, open);
      return Response.json({ code: open.code, mode, joined: open.joined });
    }
    const fresh = { code: newCode(), at: now, joined: 1 };
    await this.ctx.storage.put(mode, fresh);
    return Response.json({ code: fresh.code, mode, joined: 1 });
  }
}
