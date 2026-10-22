// Sequence engine checks. Run with Node:  node tests/check_sequence.js
// or with macOS JavaScriptCore:  jsc sequence/engine.js sequence/brain.js sequence/lines.js sequence/muse.js tests/check_sequence.js
const hasRequire = typeof require !== "undefined";
const E = hasRequire ? require("../sequence/engine.js") : globalThis.SeqEngine;
const B = hasRequire ? require("../sequence/brain.js") : globalThis.SeqBrain;
const out = typeof console !== "undefined" ? (m) => console.log(m) : print;
function assert(ok, msg) { if (!ok) throw new Error("FAIL: " + (msg || "assertion")); }
assert.strictEqual = (a, b, msg) => assert(a === b, (msg || "") + ` expected ${b}, got ${a}`);
assert.deepStrictEqual = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), (msg || "") + ` expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
assert.throws = (fn, re) => { try { fn(); } catch (e) { assert(re.test(e.message), "wrong error " + e.message); return; } assert(false, "expected a throw"); };

// board: 96 cards, each twice, plus 4 corners
const counts = {};
E.BOARD.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
assert.strictEqual(counts.FREE, 4);
assert.strictEqual(Object.keys(counts).length, 49);
assert(Object.entries(counts).every(([c, n]) => c === "FREE" || n === 2));
assert(!E.BOARD.some((c) => c[0] === "J"));

// a row using a corner completes a sequence
let s = E.newGame({ seed: 1 });
[1, 2, 3, 4].forEach((i) => (s.chips[i] = 0));
assert.strictEqual(E.checkSequences(s, 0, 4), 1);
// a second sequence may share one chip but not two
[5, 6, 7, 8].forEach((i) => (s.chips[i] = 0));
assert.strictEqual(E.checkSequences(s, 0, 8), 1, "shares cell 4 only");
s = E.newGame({ seed: 1 });
[1, 2, 3, 4, 5, 6].forEach((i) => (s.chips[i] = 0));
E.checkSequences(s, 0, 4);
assert.strictEqual(E.checkSequences(s, 0, 6), 0, "would reuse two cells");

// one-eyed jack can't remove a locked chip; two-eyed jack can go anywhere open
s = E.newGame({ seed: 2 });
s.hands[0] = ["JS", "JD"];
[1, 2, 3, 4].forEach((i) => (s.chips[i] = 1));
E.checkSequences(s, 1, 4);
s.chips[55] = 1;
const removes = E.legalMoves(s, 0).filter((m) => m.type === "remove").map((m) => m.cell);
assert.deepStrictEqual(removes, [55]);
assert.strictEqual(E.legalMoves(s, 0).filter((m) => m.card === "JD").length, 100 - 4 - 5);

// illegal moves throw
s = E.newGame({ seed: 3 });
assert.throws(() => E.applyMove(s, 1, E.legalMoves(s, 1)[0]), /turn/);
assert.throws(() => E.applyMove(s, 0, { type: "place", card: "XX", cell: 5 }), /Illegal/);

// full games with the built-in brain end with a winner and keep the deck consistent
let wins = 0, moves = 0;
for (let g = 0; g < 40; g++) {
  const st = E.newGame({ seed: 100 + g });
  while (st.winner == null && !st.draw) {
    E.tradeDeadCard(st, st.turn);
    const ranked = B.analyse(st, st.turn);
    if (!ranked.length) { E.pass(st, st.turn); continue; }
    E.applyMove(st, st.turn, B.pick(ranked, 0.5).move);
    const total = st.deck.length + st.discard.length + st.hands.flat().length;
    assert.strictEqual(total, 104, "card count");
  }
  if (st.winner != null) wins++;
  moves += st.moveNo;
}
assert(wins >= 38, "games should finish with a winner: " + wins);

// brain: completes 5 when it can
s = E.newGame({ seed: 5 });
const card = E.BOARD[13];
[10, 11, 12, 14].forEach((i) => (s.chips[i] = 0));
s.hands[0] = [card, "2C", "3C"];
assert.strictEqual(B.analyse(s, 0)[0].move.cell, 13);
// brain: blocks the opponents' open four (cells 21-24, gap at 25)
s = E.newGame({ seed: 6 });
[21, 22, 23, 24].forEach((i) => (s.chips[i] = 1));
s.chips[20] = 0; // other end already blocked
s.hands[0] = [E.BOARD[25], "KS"];
assert.strictEqual(B.analyse(s, 0)[0].move.cell, 25, "block");

// dead cards: only one swap per turn
s = E.newGame({ seed: 7 });
const dead = E.BOARD[1];
E.CELLS_FOR[dead].forEach((i) => (s.chips[i] = 1));
s.hands[0] = [dead, dead, "2C"];
assert(E.tradeDeadCard(s, 0) === dead && E.tradeDeadCard(s, 0) === null, "one dead-card swap per turn");

// levels: hard always takes a sure win; easy is allowed to wander
s = E.newGame({ seed: 8 });
[10, 11, 12, 14].forEach((i) => (s.chips[i] = 0));
s.sequences[0].push([50, 51, 52, 53, 54]); // already one sequence, so 13 wins
s.hands[0] = [E.BOARD[13], "2C", "3C"];
assert(B.pick(B.analyse(s, 0, "hard"), 0, Math.random, "hard").move.cell === 13, "hard takes the win");
let easyMissed = 0;
const r8 = E.rng(8);
for (let k = 0; k < 200; k++) if (B.pick(B.analyse(s, 0, "easy"), 0.5, r8, "easy").move.cell !== 13) easyMissed++;
assert(easyMissed > 10 && easyMissed < 120, "easy sometimes misses a win: " + easyMissed);

// built-in table talk exists for every persona and event, fills names, never names a card
if (globalThis.SeqLines) {
  const Lx = globalThis.SeqLines;
  for (const [who, events] of Object.entries(Lx.LINES)) {
    for (const ev of ["start", "four", "sequence", "block", "remove", "wild", "hit", "theirSeq", "idle", "win", "lose"]) {
      assert(events[ev] && events[ev].length >= 2, who + " " + ev);
      for (const t of events[ev]) assert(!/[♠♥♦♣]/.test(t), "line mentions a card: " + t);
    }
  }
  const t = Lx.line("Kabir", "block", { opp: "Asha", mate: "Dev" }, () => 0);
  assert(t.includes("Asha") && !/[{}]/.test(t), "placeholders filled: " + t);
}

// fair play: the AI's choice must not depend on hidden information (other hands, deck order)
let fairChecks = 0;
for (let g = 0; g < 50; g++) {
  const st = E.newGame({ seed: 9000 + g });
  for (let t = 0; t < 40 && st.winner == null && !st.draw; t++) {
    const seat = st.turn;
    E.tradeDeadCard(st, seat);
    if (!E.legalMoves(st, seat).length) { E.pass(st, seat); continue; }
    // scramble everything this seat can't see, keeping card counts the same
    const hidden = E.clone(st), rs = E.rng(g * 100 + t);
    const pool = [...hidden.deck, ...hidden.hands.filter((h, i) => i !== seat).flat()];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    hidden.hands.forEach((h, i) => { if (i !== seat) hidden.hands[i] = pool.splice(0, h.length); });
    hidden.deck = pool;
    for (const lv of ["easy", "normal", "hard"]) {
      const a = JSON.stringify(B.analyse(st, seat, lv)), b = JSON.stringify(B.analyse(hidden, seat, lv));
      assert(a === b, `AI used hidden info at level ${lv}`);
      fairChecks++;
    }
    if (globalThis.SeqMuse) {
      const shortlist = B.analyse(st, seat, "normal").slice(0, 8), pl = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];
      const pa = globalThis.SeqMuse.buildPrompt(st, seat, globalThis.SeqMuse.PERSONAS[seat], pl, shortlist, [], "normal");
      const pb = globalThis.SeqMuse.buildPrompt(hidden, seat, globalThis.SeqMuse.PERSONAS[seat], pl, shortlist, [], "normal");
      assert(JSON.stringify(pa) === JSON.stringify(pb), "Muse prompt leaks hidden info");
    }
    E.applyMove(st, seat, B.pick(B.analyse(st, seat, "normal"), 0.5, rs, "normal").move);
  }
}

if (globalThis.SeqMuse) {
  const c = globalThis.SeqMuse.cleanSay;
  for (const bad of ["I have the queen of hearts", "Got a jack, partner!", "Holding 7♦ for you", "Need a K of spades", "I hold two 9s", "one-eyed trouble coming"])
    assert(c(bad) === "", "card talk not filtered: " + bad);
  for (const ok of ["Watch this diagonal, friends.", "Howzat! Line blocked.", "Picture abhi baaki hai!", "Top 3 rows are mine."])
    assert(c(ok) === ok, "clean line dropped: " + ok);
}

out(`PASS: no hidden-information use in ${fairChecks} AI decisions. Board, sequence and jack rules, ${wins}/40 brain games won (avg ${Math.round(moves / 40)} moves).`);
