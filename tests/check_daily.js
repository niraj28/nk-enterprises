// Daily challenge replay checks. Run with macOS JavaScriptCore:
// jsc lineup5/engine.js lineup5/brain.js lineup5/daily.js tests/check_daily.js
const E = globalThis.SeqEngine, B = globalThis.SeqBrain, D = globalThis.SeqDaily;
const out = typeof print === "function" ? print : console.log;
function assert(ok, msg) { if (!ok) throw new Error("FAIL: " + msg); }

// play a daily game the way the page does, recording the human's moves
function playDaily(day, pickHuman) {
  const st = D.newGame(day), moves = [];
  while (st.winner == null && !st.draw) {
    const seat = st.turn;
    E.tradeDeadCard(st, seat);
    if (!E.legalMoves(st, seat).length) { E.pass(st, seat); continue; }
    const m = seat === 0 ? pickHuman(st) : D.aiMove(st, seat);
    if (seat === 0) moves.push({ type: m.type, card: m.card, cell: m.cell });
    E.applyMove(st, seat, m);
  }
  return { moves, result: st.draw ? "draw" : st.winner === 0 ? "win" : "loss", count: st.moveNo };
}

let checked = 0, wins = 0;
for (const day of ["2026-10-23", "2026-10-24", "2026-11-02", "2027-01-15"]) {
  for (const style of ["first", "brain"]) {
    const g = playDaily(day, (st) => style === "first" ? E.legalMoves(st, 0)[0] : B.pick(B.analyse(st, 0, "normal"), 0.5, Math.random, "normal").move);
    const r = D.replay(day, g.moves);
    assert(r.ok && r.result === g.result && r.moves === g.count, `replay matches (${day}, ${style}): ${JSON.stringify(r)} vs ${g.result} ${g.count}`);
    if (g.result === "win") wins++;
    // tampering: a changed move, a missing move, an extra move, another day
    const bad = JSON.parse(JSON.stringify(g.moves)); bad[3].cell = (bad[3].cell + 1) % 100;
    const r2 = D.replay(day, bad);
    assert(!r2.ok || r2.result !== g.result || r2.moves !== g.count, "changed move caught");
    assert(!D.replay(day, g.moves.slice(0, -1)).ok, "missing move caught");
    assert(!D.replay(day, [...g.moves, g.moves[0]]).ok, "extra move caught");
    checked++;
  }
}
assert(!D.replay("not-a-day", []).ok && !D.replay("2026-10-23", "x").ok, "bad input rejected");
assert(D.newGame("2026-10-23").hands[0].join() === D.newGame("2026-10-23").hands[0].join(), "same deal all day");
out(`PASS: daily replay (${checked} games verified, ${wins} wins, tampered, missing and extra moves rejected).`);
