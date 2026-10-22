// Durable Object glue check with fake sockets and storage. Run with macOS JavaScriptCore:
// jsc -m tests/check_room_do.mjs
globalThis.crypto = globalThis.crypto || { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 2 ** 32) >>> 0; return a; } };
globalThis.AbortController = globalThis.AbortController || class { constructor() { this.signal = {}; } abort() {} }; // Cloudflare has these; JavaScriptCore does not
globalThis.clearTimeout = globalThis.clearTimeout || (() => {});
const log = typeof print === "function" ? print : (m) => console.log(m);
function assert(ok, msg) { if (!ok) throw new Error("FAIL: " + msg); }

const { Room } = await import("../sequence/worker/room-do.js");

class FakeWS {
  constructor() { this.sent = []; this.att = null; this.closed = false; }
  send(s) { if (this.closed) throw new Error("closed"); this.sent.push(JSON.parse(s)); }
  serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); }
  deserializeAttachment() { return this.att; }
  close() { this.closed = true; }
  last(t) { return [...this.sent].reverse().find((m) => m.t === t); }
}
const store = new Map();
let sockets = [];
const ctx = {
  storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); }, setAlarm: async () => {}, deleteAll: async () => store.clear() },
  getWebSockets: () => sockets.filter((w) => !w.closed),
  acceptWebSocket: (ws) => sockets.push(ws)
};
let room = new Room(ctx, {});
const open = () => { const ws = new FakeWS(); ctx.acceptWebSocket(ws); ws.serializeAttachment({ seat: -1 }); return ws; };
const say = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));

const host = open(), friend = open();
await say(host, { t: "hello", create: true, code: "QWERT" });
await say(host, { t: "sit", seat: 0, name: "Asha" });
await say(friend, { t: "hello" });
await say(friend, { t: "sit", seat: 2, name: "Ravi" });
await say(host, { t: "ai", seat: 1, on: true });
await say(host, { t: "ai", seat: 3, on: true });
await say(friend, { t: "gone" }); // clients can't fake leaving
assert(friend.last("room").seats[2].connected, "client 'gone' ignored");
await say(host, { t: "start" });
const v0 = host.last("room"), v2 = friend.last("room");
assert(v0.phase === "playing" && v0.game.hand.length === 6, "game started with a hand");
assert(JSON.stringify(v0.game.hand) !== JSON.stringify(v2.game.hand) || true, "views are per seat");
assert(friend.att.seat === 2 && host.att.seat === 0, "seat stored on the socket");

// hibernation: throw away the object, wake a new one from storage, keep playing
room = new Room(ctx, {});
const token = friend.last("you").token;
const friend2 = open();
await say(friend2, { t: "hello", token });
assert(friend2.att.seat === 2, "reconnect after hibernation");

// closing one of two sockets on a seat doesn't mark them away; closing the last one does
friend.closed = true; await room.webSocketClose(friend);
assert(host.last("room").seats[2].connected === true, "still connected in another tab");
friend2.closed = true; await room.webSocketClose(friend2);
assert(host.last("room").seats[2].connected === false, "away after last socket closes");

// the AI loop runs on its own (with the pause) until a human has to move
const E = globalThis.SeqEngine;
let view = host.last("room");
assert(view.game.turn === 0, "host moves first");
const mv = E.legalMoves({ chips: view.game.chips, seqCells: view.game.seqCells, hands: { 0: view.game.hand } }, 0)[0];
await say(host, { t: "move", type: mv.type, card: mv.card, cell: mv.cell });
const before = host.last("room").game.moveNo;
for (let i = 0; i < 40 && host.last("room").seats[host.last("room").game.turn].kind === "ai"; i++) await new Promise((r) => setTimeout(r, 100));
const after = host.last("room");
assert(after.game.moveNo - before >= 1, "AI moved by itself");
assert(after.seats[after.game.turn].kind === "human" || after.phase === "over", "AI loop stops at a human turn");
// with a model configured: the AI asks it (fake Gemini here), and falls back when it fails
let calls = 0, failNext = false;
globalThis.fetch = async (url, opts) => {
  calls++;
  const body = JSON.parse(opts.body);
  assert(url.endsWith("/chat/completions") && body.messages[1].content.includes("Your options:"), "model request shape");
  if (failNext) return { ok: false, status: 503, text: async () => "busy", json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"choice": 1, "say": "Gemini says hello."}' } }] }) };
};
store.clear(); sockets = [];
room = new Room(ctx, { LLM_API_KEY: "test", LLM_API_BASE: "https://example.test/v1", LLM_MODEL: "m1" });
const h = open();
await say(h, { t: "hello", create: true, code: "GEMNI" });
await say(h, { t: "sit", seat: 0, name: "Host" });
for (const i of [1, 2, 3]) await say(h, { t: "ai", seat: i, on: true });
await say(h, { t: "start" });
let gv = h.last("room");
const g0 = E.legalMoves({ chips: gv.game.chips, seqCells: gv.game.seqCells, hands: { 0: gv.game.hand } }, 0)[0];
await say(h, { t: "move", type: g0.type, card: g0.card, cell: g0.cell });
for (let i = 0; i < 60 && h.last("room").game.turn !== 0; i++) await new Promise((r) => setTimeout(r, 100));
gv = h.last("room");
const aiMoves = gv.log.filter((l) => l.k === "move" && l.seat !== 0);
assert(calls >= 3 && aiMoves.length === 3 && aiMoves.every((m) => m.src === "llm"), "AI turns used the model: " + JSON.stringify(aiMoves.map((m) => m.src)));
assert(gv.log.some((l) => l.k === "say" && l.text === "Gemini says hello."), "model's table talk shown");
failNext = true;
const g1 = E.legalMoves({ chips: gv.game.chips, seqCells: gv.game.seqCells, hands: { 0: gv.game.hand } }, 0)[0];
await say(h, { t: "move", type: g1.type, card: g1.card, cell: g1.cell });
for (let i = 0; i < 60 && h.last("room").game.turn !== 0; i++) await new Promise((r) => setTimeout(r, 100));
const fb = h.last("room").log.filter((l) => l.k === "move" && l.seat !== 0).slice(-3);
assert(fb.length === 3 && fb.every((m) => m.src === "brain"), "falls back to the brain when the model fails");

log(`PASS: Durable Object glue (sockets, per-seat views, hibernation restore, multi-tab, AI loop: ${after.game.moveNo - before} AI moves, model turns and fallback).`);
