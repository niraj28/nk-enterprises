// Online room checks. Run with macOS JavaScriptCore:
// jsc sequence/engine.js sequence/brain.js sequence/lines.js sequence/muse.js sequence/room-core.js tests/check_room.js
const E = globalThis.SeqEngine, R = globalThis.SeqRoom;
const out = typeof console !== "undefined" ? (m) => console.log(m) : print;
function assert(ok, msg) { if (!ok) throw new Error("FAIL: " + (msg || "assertion")); }
const rand = E.rng(42);
let now = 1000;

const room = new R.RoomCore();
const a = { seat: -1 }, b = { seat: -1 }, c = { seat: -1 }, spy = { seat: -1 };
const send = (conn, msg) => room.handle(conn, msg, now, rand);

// joining a room that was never created fails; creating works
assert(send(b, { t: "hello" }).reply.t === "error", "unknown room rejected");
assert(send(a, { t: "hello", create: true, code: "ABCDE" }).reply.t === "you", "create");
send(b, { t: "hello" }); send(c, { t: "hello" }); send(spy, { t: "hello" });

// seats
const ta = send(a, { t: "sit", seat: 0, name: "Asha" }).reply.token;
assert(ta && a.seat === 0 && room.hostSeat() === 0, "creator is host");
assert(send(b, { t: "sit", seat: 0, name: "Bob" }).reply.t === "error", "taken seat rejected");
const tb = send(b, { t: "sit", seat: 1, name: "<b>Bob</b>" }).reply.token;
assert(room.seats[1].name === "bBob/b", "names are sanitised: " + room.seats[1].name);
send(c, { t: "sit", seat: 2, name: "Chitra" });
assert(send(b, { t: "ai", seat: 3, on: true }).reply.t === "error", "only host adds AI");
assert(send(a, { t: "start" }).reply.t === "error", "can't start with an empty seat");
send(a, { t: "ai", seat: 3, on: true });
assert(room.seats[3].kind === "ai" && room.seats[3].name === "Dev", "AI seat");
assert(send(b, { t: "level", level: "hard" }).reply.t === "error", "only host sets level");
send(a, { t: "level", level: "hard" });
assert(send(a, { t: "start" }).changed && room.phase === "playing", "start");

// nobody ever sees someone else's hand
function checkViews() {
  for (let s = -1; s < 4; s++) {
    const v = room.view(s), json = JSON.stringify(v);
    assert(!("deck" in v.game) && !("hands" in v.game) && !("discard" in v.game), "no deck/hands/discard in view");
    assert(JSON.stringify(v.game.hand) === JSON.stringify(s >= 0 ? room.state.hands[s] : []), "own hand only");
    for (let o = 0; o < 4; o++) {
      if (o === s) continue;
      // the exact other hand must not appear anywhere in the payload
      assert(!json.includes(JSON.stringify(room.state.hands[o])), `seat ${s} can see seat ${o}'s hand`);
    }
  }
}
checkViews();

// turns: wrong player and illegal moves are rejected
const turn = room.state.turn;
const other = [a, b, c].find((x) => x.seat !== turn && x.seat >= 0);
const m0 = E.legalMoves(room.state, turn)[0];
assert(send(other, { t: "move", ...m0 }).reply.t === "error", "out-of-turn move rejected");
assert(send(spy, { t: "move", ...m0 }).reply.t === "error", "spectator can't move");
const conns = [a, b, c];
const connFor = (seat) => conns.find((x) => x.seat === seat);
assert(send(connFor(turn), { t: "move", type: "place", card: "ZZ", cell: 3 }).reply.t === "error", "illegal move rejected");

// a player drops; the host can hand the seat to the AI only after a minute; they can come back
send(b, { t: "gone" });
assert(room.view(0).seats[1].connected === false, "shows away");
assert(send(a, { t: "ai", seat: 1, on: true }).reply.t === "error", "too early for takeover");
now += R.TAKEOVER_MS + 1;
send(a, { t: "ai", seat: 1, on: true });
assert(room.seats[1].kind === "ai" && room.seats[1].takenOver, "takeover");
const b2 = { seat: -1 };
send(b2, { t: "hello", token: tb });
assert(b2.seat === 1 && room.seats[1].kind === "human" && room.seats[1].name === "bBob/b", "player reclaims seat with token");

// host leaves: hosting passes to a connected human
send(a, { t: "gone" });
assert(room.hostSeat() === 1, "host passes on: " + room.hostSeat());
send(a, { t: "hello", token: ta });
assert(room.hostSeat() === 0, "creator is host again after reconnecting");

// play the game to the end: humans play the first legal move, the AI plays itself
const live = { 0: a, 1: b2, 2: c };
let steps = 0;
while (room.phase === "playing" && steps++ < 600) {
  if (room.aiPending()) { room.aiMove(rand); continue; }
  const t = room.state.turn, mv = E.legalMoves(room.state, t)[0];
  const r = send(live[t], { t: "move", ...mv });
  assert(!r.reply, "legal move accepted: " + JSON.stringify(r.reply));
  if (steps % 7 === 0) checkViews();
}
assert(room.phase === "over", "game finished");
assert(room.log.some((l) => l.k === "say" && l.seat === 3), "AI talks in online rooms");

// save/restore through JSON (what the Durable Object stores)
const copy = new R.RoomCore(JSON.parse(JSON.stringify(room.toJSON())));
assert(JSON.stringify(copy.view(2)) === JSON.stringify(room.view(2)), "room survives a save and reload");

// AI turns through a language model: the prompt holds only the AI seat's own cards,
// a good reply picks from the shortlist, a bad reply falls back, and a stale plan is ignored
if (globalThis.SeqMuse) {
  const r2 = new R.RoomCore(), h = { seat: -1 };
  r2.handle(h, { t: "hello", create: true, code: "LLMAI" }, now, rand);
  r2.handle(h, { t: "sit", seat: 0, name: "Host" }, now, rand);
  [1, 2, 3].forEach((i) => r2.handle(h, { t: "ai", seat: i, on: true }, now, rand));
  r2.handle(h, { t: "start" }, now, rand);
  r2.handle(h, { t: "move", ...E.legalMoves(r2.state, 0)[0] }, now, rand);
  const plan = r2.aiPlan(rand);
  assert(plan && plan.seat === 1, "AI seat 1 to move");
  const prompt = r2.promptFor(plan);
  for (let o = 0; o < 4; o++) {
    if (o === 1) continue;
    const other = r2.state.hands[o].map(globalThis.SeqMuse.label).join(" ");
    assert(!prompt.user.includes("Your hand: " + other), "prompt leaks seat " + o);
  }
  assert(r2.fromReply(plan, "nonsense") === null, "bad reply falls back");
  const chosen = r2.fromReply(plan, '{"choice": 2, "say": "Watch this, friends."}');
  assert(chosen && chosen.say === "Watch this, friends.", "good reply used");
  assert(r2.fromReply(plan, '{"choice": 1, "say": "I have the queen of hearts"}').say === "", "card talk filtered");
  const stale = r2.aiPlan(rand);
  assert(r2.aiApply(plan, chosen.pick, chosen.say, "llm", rand), "apply chosen move");
  assert(!r2.aiApply(stale, stale.pick, "", "brain", rand), "stale plan ignored");
  const mv = r2.log.filter((l) => l.k === "move").pop(), sayLine = r2.log.filter((l) => l.k === "say").pop();
  assert(mv.src === "llm" && sayLine.text === "Watch this, friends." && sayLine.seat === 1, "model's move and line logged");
}

// 1 vs 1 rooms: the host switches mode; it's refused while a player sits in seat 3 or 4
{
  const r3 = new R.RoomCore(), host = { seat: -1 }, guest = { seat: -1 }, far = { seat: -1 };
  r3.handle(host, { t: "hello", create: true, code: "ONEV1" }, now, rand);
  r3.handle(guest, { t: "hello" }, now, rand); r3.handle(far, { t: "hello" }, now, rand);
  r3.handle(host, { t: "sit", seat: 0, name: "Host" }, now, rand);
  r3.handle(far, { t: "sit", seat: 3, name: "Far" }, now, rand);
  assert(r3.handle(host, { t: "mode", mode: "1v1" }, now, rand).reply.t === "error", "1v1 refused with a player in seat 4");
  r3.handle(far, { t: "stand" }, now, rand);
  assert(r3.handle(guest, { t: "mode", mode: "1v1" }, now, rand).reply.t === "error", "only host changes mode");
  r3.handle(host, { t: "mode", mode: "1v1" }, now, rand);
  assert(r3.seats.length === 2 && r3.view(0).mode === "1v1", "room is 1v1");
  assert(r3.handle(far, { t: "sit", seat: 3, name: "Far" }, now, rand).reply.t === "error", "no seat 4 in 1v1");
  r3.handle(guest, { t: "sit", seat: 1, name: "Guest" }, now, rand);
  r3.handle(host, { t: "start" }, now, rand);
  assert(r3.state.seats === 2 && r3.view(0).game.hand.length === 7, "1v1 game with 7 cards");
  let n = 0;
  while (r3.phase === "playing" && n++ < 400) {
    const t = r3.state.turn, mv = E.legalMoves(r3.state, t)[0];
    const res = r3.handle(t === 0 ? host : guest, { t: "move", ...mv }, now, rand);
    assert(!res.reply, "1v1 move accepted");
    const v = r3.view(t === 0 ? 1 : 0);
    assert(!JSON.stringify(v).includes(JSON.stringify(r3.state.hands[t])), "1v1 hands stay private");
  }
  assert(r3.phase === "over", "1v1 room game finished");
  r3.handle(host, { t: "mode", mode: "2v2" }, now, rand);
  assert(r3.seats.length === 4 && r3.seats[2].kind === "empty", "back to 2v2 adds empty seats");
}

// chat and play again
send(c, { t: "chat", text: "gg <script>" });
assert(room.log[room.log.length - 1].text === "gg script", "chat sanitised");
assert(send(c, { t: "start" }).reply.t === "error", "only host restarts");
send(a, { t: "start" });
assert(room.phase === "playing" && room.gameNo === 2, "play again");

out(`PASS: rooms (1v1 and 2v2, create, seats, host, AI fill-in, takeover and return, ${steps} turns, private hands, save/restore, chat).`);
