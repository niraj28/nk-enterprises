// Durable Object: one per room. It is the referee (deck and hands live only here) and relays
// each player's private view over WebSockets. Uses the WebSocket Hibernation API, so an idle
// room costs nothing while people think.
import "../engine.js";
import "../brain.js";
import "../lines.js";
import "../muse.js";
import "../room-core.js";
import { callLLM, llmConfigured } from "./muse-proxy.js";

const { RoomCore } = globalThis.SeqRoom;
const IDLE_MS = 2 * 60 * 60 * 1000; // rooms are deleted after 2 hours without activity
const AI_DELAY_MS = 900;
const LLM_TIMEOUT_MS = 12000; // after this the built-in brain plays the turn
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = null;
    this.running = false;
  }

  async load() {
    if (!this.core) this.core = new RoomCore((await this.ctx.storage.get("room")) || undefined);
    return this.core;
  }
  async save() {
    await this.ctx.storage.put("room", this.core.toJSON());
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket only", { status: 426 });
    if (this.ctx.getWebSockets().length >= 16) return new Response("Room is full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: -1 });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > 2000) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg && msg.t === "gone") return; // only the server decides who has left
    const core = await this.load();
    const conn = { seat: (ws.deserializeAttachment() || {}).seat ?? -1 };
    const out = core.handle(conn, msg, Date.now(), rand);
    ws.serializeAttachment({ seat: conn.seat });
    if (out.reply) ws.send(JSON.stringify(out.reply));
    if (out.changed) {
      await this.save();
      this.broadcast();
    }
    this.runAI();
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    await this.left(ws);
  }
  async webSocketError(ws) { await this.left(ws); }

  async left(ws) {
    const seat = (ws.deserializeAttachment() || {}).seat ?? -1;
    if (seat < 0) return;
    // still connected from another tab? then they haven't left
    const others = this.ctx.getWebSockets().filter((w) => w !== ws && (w.deserializeAttachment() || {}).seat === seat);
    if (others.length) return;
    const core = await this.load();
    const out = core.handle({ seat }, { t: "gone" }, Date.now(), rand);
    if (out.changed) { await this.save(); this.broadcast(); }
  }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const seat = (ws.deserializeAttachment() || {}).seat ?? -1;
      try { ws.send(JSON.stringify(this.core.view(seat))); } catch { /* closing */ }
    }
  }

  // AI seats move one at a time with a short pause, so people can follow along. Each AI turn
  // asks the language model (Gemini) to choose from the brain's shortlist and say something;
  // if it is slow or fails, the brain's own pick is played.
  async runAI() {
    if (this.running) return;
    this.running = true;
    try {
      const core = await this.load();
      while (core.aiPending()) {
        const started = Date.now();
        const plan = core.aiPlan(rand);
        let pick = plan.pick, say = "", src = "brain";
        if (!plan.quiet && llmConfigured(this.env)) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
          try {
            const prompt = core.promptFor(plan);
            const r = await callLLM(this.env, prompt.system, prompt.user, ctrl.signal);
            const chosen = r.ok ? core.fromReply(plan, r.text) : null;
            if (chosen) { pick = chosen.pick; say = chosen.say; src = "llm"; }
          } catch { /* timeout or network: keep the brain's pick */ }
          finally { clearTimeout(timer); }
        }
        const wait = AI_DELAY_MS - (Date.now() - started);
        if (wait > 0) await sleep(wait);
        if (core.aiApply(plan, pick, say, src, rand)) {
          await this.save();
          this.broadcast();
        }
      }
    } finally {
      this.running = false;
    }
  }

  async alarm() {
    const core = await this.load();
    if (Date.now() - core.lastActive >= IDLE_MS - 60 * 1000) {
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, "Room closed after 2 hours idle"); } catch { /* ignore */ } }
      await this.ctx.storage.deleteAll();
      this.core = null;
    } else {
      await this.ctx.storage.setAlarm(core.lastActive + IDLE_MS);
    }
  }
}
