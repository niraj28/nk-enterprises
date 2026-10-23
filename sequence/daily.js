/* Daily challenge: one seeded deal per day, you against the Hard brain. Because the deal and the
   Hard brain are both deterministic, the server can replay a submitted game from the player's
   moves alone and check the result, so the daily leaderboard can't be faked by posting a number. */
(function (root) {
  "use strict";
  const E = root.SeqEngine, B = root.SeqBrain;
  const LAUNCH = Date.UTC(2026, 9, 23); // Daily challenge #1

  const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day);
  function dailyNo(day) {
    const [y, m, d] = day.split("-").map(Number);
    return Math.floor((Date.UTC(y, m - 1, d) - LAUNCH) / 86400000) + 1;
  }
  function dailySeed(day) {
    let h = 2166136261;
    for (const ch of "sequence-daily-" + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const newGame = (day) => E.newGame({ seats: 2, seed: dailySeed(day) });
  // the AI's move in the daily challenge: always the Hard brain's top choice
  const aiMove = (state, seat) => B.pick(B.analyse(state, seat, "hard"), 0, Math.random, "hard").move;

  // Replays a daily game from the human's moves. Returns { ok, result, moves } or { ok: false, why }.
  function replay(day, humanMoves) {
    if (!validDay(day) || !Array.isArray(humanMoves) || humanMoves.length > 200) return { ok: false, why: "bad input" };
    const state = newGame(day);
    let next = 0;
    for (let guard = 0; guard < 700 && state.winner == null && !state.draw; guard++) {
      const seat = state.turn;
      E.tradeDeadCard(state, seat);
      if (!E.legalMoves(state, seat).length) { E.pass(state, seat); continue; }
      let move;
      if (seat === 0) {
        const m = humanMoves[next++];
        if (!m) return { ok: false, why: "game not finished" };
        move = { type: m.type === "remove" ? "remove" : "place", card: String(m.card), cell: Number(m.cell) };
      } else move = aiMove(state, seat);
      try { E.applyMove(state, seat, move); } catch (e) { return { ok: false, why: "illegal move " + next }; }
    }
    if (next !== humanMoves.length) return { ok: false, why: "extra moves" };
    if (state.winner == null && !state.draw) return { ok: false, why: "game not finished" };
    return { ok: true, result: state.draw ? "draw" : state.winner === 0 ? "win" : "loss", moves: state.moveNo };
  }

  const api = { dailyNo, dailySeed, newGame, aiMove, replay, validDay };
  root.SeqDaily = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
