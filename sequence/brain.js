/* Built-in move analysis. It scores every legal move and plays offline when Muse isn't reachable,
   and the same short list of scored moves is what the Muse agents choose from. */
(function (root) {
  "use strict";
  const E = root.SeqEngine || require("./engine.js");

  const ATTACK = [0, 1, 4, 12, 40, 0];  // by own chips in a 5-window after the move
  const BLOCK = [0, 0.5, 2, 9, 220];    // by opponent chips in a 5-window that has none of ours
  const HARD = { attack: ATTACK.slice(), block: BLOCK.slice() };

  function windowsThrough(cell) {
    const out = [], r0 = Math.floor(cell / 10), c0 = cell % 10;
    for (const [dr, dc] of E.DIRS) {
      for (let back = 0; back < 5; back++) {
        const win = [];
        for (let k = 0; k < 5; k++) {
          const r = r0 + dr * (k - back), c = c0 + dc * (k - back);
          if (r < 0 || r > 9 || c < 0 || c > 9) break;
          win.push(r * 10 + c);
        }
        if (win.length === 5) out.push(win);
      }
    }
    return out;
  }
  const WINDOWS = Array.from({ length: 100 }, (_, i) => windowsThrough(i));

  function count(state, win, team, skip) {
    let own = 0, opp = 0;
    for (const i of win) {
      if (i === skip) continue;
      if (E.CORNERS.has(i)) { own++; opp++; continue; }
      const t = state.chips[i];
      if (t === team) own++; else if (t !== -1) opp++;
    }
    return { own, opp };
  }

  function scoreMove(state, seat, move, level) {
    const team = E.teamOf(seat, state.seats), notes = [], hard = level === "hard";
    const opps = [];
    for (let t = 0; t < state.sequences.length; t++) if (t !== team) opps.push(t);
    const ATK = hard ? HARD.attack : ATTACK, BLK = hard ? HARD.block : BLOCK;
    let score = 0, bestOwn = 0, bestBlock = 0, fours = 0, sure = false;
    // Hard only: card counting from public info (discard pile) and our own hand
    const hand = state.hands[seat].slice();
    hand.splice(hand.indexOf(move.card), 1);
    const holdWild = hand.some((c) => E.TWO_EYED.has(c));
    const gone = (card) => state.discard.filter((c) => c === card).length + state.hands[seat].filter((c) => c === card).length;
    if (move.type === "place") {
      for (const win of WINDOWS[move.cell]) {
        const a = count(state, win, team, move.cell);
        if (a.opp - countCorners(win) <= 0) {
          const n = a.own + 1; score += ATK[n]; bestOwn = Math.max(bestOwn, n);
          if (n === 4) {
            fours++;
            const gap = win.find((i) => i !== move.cell && state.chips[i] === -1 && !E.CORNERS.has(i));
            if (hard && gap != null && (holdWild || hand.includes(E.BOARD[gap]))) sure = true;
          }
        }
        for (const opp of opps) { // lines only that rival owns (with corners) that this chip would cut
          const b = count(state, win, opp, move.cell);
          if (b.opp - countCorners(win) <= 0) {
            let w = BLK[b.own];
            if (hard && b.own === 4 && gone(E.BOARD[move.cell]) >= 2) w -= 150; // they'd need a wild jack
            score += w; bestBlock = Math.max(bestBlock, b.own);
          }
        }
      }
      if (sure) score += 250;
      const sim = E.clone(state);
      sim.chips[move.cell] = team;
      const made = E.checkSequences(sim, team, move.cell);
      if (made) {
        score += 1000 * made;
        notes.push(sim.sequences[team].length >= state.needed ? "WINS THE GAME" : "completes a sequence");
      } else if (hard && fours >= 2) { score += 160; notes.push("sets up two threats at once"); }
      else if (sure) notes.push("sets up a line it can finish next turn");
      else if (bestOwn === 4) notes.push("makes 4 in a row");
      else if (bestOwn === 3) notes.push("builds 3 in a row");
      if (bestBlock >= 4) notes.push("blocks opponents' 4 in a row");
      else if (bestBlock === 3) notes.push("blocks opponents' 3");
      if (E.TWO_EYED.has(move.card)) { score -= made ? 0 : hard ? 70 : 35; notes.push("uses a wild jack"); }
    } else {
      let lost = 0, breaks4 = false;
      const opp = state.chips[move.cell]; // the rival whose chip comes off
      for (const win of WINDOWS[move.cell]) {
        const b = count(state, win, opp, -1);
        if (b.opp - countCorners(win) <= 0) { lost += ATK[b.own]; if (b.own >= 4) breaks4 = true; }
      }
      score += lost * 1.1 - (hard ? 70 : 45) + (breaks4 ? 260 : 0);
      notes.push(breaks4 ? "removes a chip from opponents' 4 in a row" : "removes an opponent chip");
    }
    const r = Math.floor(move.cell / 10), c = move.cell % 10;
    score += 1.5 - (Math.abs(r - 4.5) + Math.abs(c - 4.5)) * 0.15; // small pull to the centre
    if (!notes.length) notes.push("positional");
    return { move, score: Math.round(score * 10) / 10, notes };
  }
  function countCorners(win) { let n = 0; for (const i of win) if (E.CORNERS.has(i)) n++; return n; }

  function analyse(state, seat, level) {
    return E.legalMoves(state, seat).map((m) => scoreMove(state, seat, m, level)).sort((a, b) => b.score - a.score);
  }

  // level: "easy" | "normal" | "hard". style: 0 = precise, larger = more random (personality flavour)
  function pick(ranked, style, rand, level) {
    rand = rand || Math.random;
    if (!ranked.length) return null;
    if (level === "hard") return ranked[0];
    if (level === "easy") {
      // misses some wins and blocks, otherwise plays any decent move
      if (ranked[0].score >= 1000 && rand() < 0.75) return ranked[0];
      if (ranked[0].score >= 200 && rand() < 0.4) return ranked[0];
      const pool = ranked.slice(0, 6);
      return pool[Math.floor(rand() * pool.length)];
    }
    // normal: always takes wins and blocks 4s, but is loose about everything else
    if (ranked[0].score >= 200 || (!style && rand() < 0.5)) return ranked[0];
    const pool = ranked.slice(0, 4).filter((x) => x.score >= ranked[0].score - 25 * Math.max(style, 0.5));
    return pool[Math.floor(rand() * pool.length)];
  }

  const api = { analyse, pick, scoreMove, HARD };
  root.SeqBrain = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
