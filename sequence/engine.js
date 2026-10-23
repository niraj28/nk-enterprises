/* Sequence-style game rules. Pure logic, no DOM: runs in the browser and in Node tests. */
(function (root) {
  "use strict";

  const SUITS = ["S", "H", "D", "C"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "Q", "K"]; // no jacks on the board
  const ONE_EYED = new Set(["JS", "JH"]); // remove an opponent chip
  const TWO_EYED = new Set(["JD", "JC"]); // wild: place anywhere open
  const CORNERS = new Set([0, 9, 90, 99]);
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const SIZE = 10;

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Fixed board: every non-jack card twice, four free corners.
  const BOARD = (function () {
    const cards = [];
    for (let copy = 0; copy < 2; copy++) for (const s of SUITS) for (const r of RANKS) cards.push(r + s);
    shuffle(cards, rng(2026));
    const board = [];
    for (let i = 0; i < 100; i++) board.push(CORNERS.has(i) ? "FREE" : cards.pop());
    return board;
  })();
  const CELLS_FOR = {};
  BOARD.forEach((c, i) => { if (c !== "FREE") (CELLS_FOR[c] = CELLS_FOR[c] || []).push(i); });

  const isJack = (c) => c[0] === "J";
  // 2 or 4 seats: two teams (seats alternate). 3 seats: everyone for themselves.
  const teamCount = (seats) => (seats === 3 ? 3 : 2);
  const teamOf = (seat, seats) => seat % teamCount(seats || 2);
  const cellName = (i) => "ABCDEFGHIJ"[Math.floor(i / SIZE)] + ((i % SIZE) + 1);

  function newDeck(rand) {
    const deck = [];
    for (let copy = 0; copy < 2; copy++) for (const s of SUITS) for (const r of [...RANKS, "J"]) deck.push(r + s);
    return shuffle(deck, rand);
  }

  function newGame(opts) {
    opts = opts || {};
    const seats = opts.seats || 4;
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    const rand = rng(seed);
    const handSize = { 2: 7, 3: 6, 4: 6, 6: 5, 8: 4 }[seats] || 6;
    const teams = teamCount(seats);
    const state = {
      seed, seats, teams, needed: teams === 3 ? 1 : 2, // official rules: 3 teams need one sequence
      chips: new Array(100).fill(-1),         // team index per cell, -1 empty
      seqCells: Array.from({ length: teams }, () => []), // cells locked in a completed sequence, per team
      sequences: Array.from({ length: teams }, () => []), // list of 5-cell arrays, per team
      deck: newDeck(rand), discard: [],
      hands: [], turn: 0, moveNo: 0, winner: null, draw: false,
      _rand: seed ^ 0x9e3779b9
    };
    for (let s = 0; s < seats; s++) state.hands.push(state.deck.splice(0, handSize));
    return state;
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }

  function owns(state, i, team) { return CORNERS.has(i) || state.chips[i] === team; }
  function isLocked(state, i) { return state.seqCells.some((cells) => cells.includes(i)); }

  function isDead(state, card) {
    if (isJack(card)) return false;
    return CELLS_FOR[card].every((i) => state.chips[i] !== -1);
  }

  function legalMoves(state, seat) {
    const team = teamOf(seat, state.seats), moves = [], seen = new Set();
    state.hands[seat].forEach((card, hand) => {
      if (seen.has(card)) return; // identical cards give identical moves
      seen.add(card);
      if (TWO_EYED.has(card)) {
        for (let i = 0; i < 100; i++) if (!CORNERS.has(i) && state.chips[i] === -1) moves.push({ type: "place", hand, card, cell: i });
      } else if (ONE_EYED.has(card)) {
        for (let i = 0; i < 100; i++) if (state.chips[i] !== -1 && state.chips[i] !== team && !isLocked(state, i)) moves.push({ type: "remove", hand, card, cell: i });
      } else {
        for (const i of CELLS_FOR[card]) if (state.chips[i] === -1) moves.push({ type: "place", hand, card, cell: i });
      }
    });
    return moves;
  }

  function draw(state) {
    if (!state.deck.length) {
      if (!state.discard.length) return null;
      const rand = rng(state._rand = (state._rand * 31 + 7) >>> 0);
      state.deck = shuffle(state.discard.splice(0), rand);
    }
    return state.deck.pop();
  }

  // Lines of 5 through `cell` that the team fully owns and that reuse at most one cell of an
  // earlier sequence of the same team. Marks each one found and returns how many were made.
  function checkSequences(state, team, cell) {
    let made = 0;
    const r0 = Math.floor(cell / SIZE), c0 = cell % SIZE;
    for (const [dr, dc] of DIRS) {
      const line = [];
      for (let k = -9; k <= 9; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) line.push(r * SIZE + c);
      }
      for (let s = 0; s + 5 <= line.length; s++) {
        const win = line.slice(s, s + 5);
        if (!win.includes(cell) || !win.every((i) => owns(state, i, team))) continue;
        const reused = win.filter((i) => state.seqCells[team].includes(i) && !CORNERS.has(i)).length;
        if (reused > 1) continue;
        state.sequences[team].push(win);
        for (const i of win) if (!state.seqCells[team].includes(i)) state.seqCells[team].push(i);
        made++;
      }
    }
    return made;
  }

  // At the start of a turn a player may swap one dead card. Returns the swapped card or null.
  function tradeDeadCard(state, seat) {
    if (state.tradedAt === state.moveNo) return null; // only once per turn, even after a reload
    const hand = state.hands[seat];
    const h = hand.findIndex((c) => isDead(state, c));
    if (h < 0) return null;
    const card = hand.splice(h, 1)[0];
    state.tradedAt = state.moveNo;
    state.discard.push(card);
    const next = draw(state);
    if (next) hand.push(next);
    return card;
  }

  function applyMove(state, seat, move) {
    if (state.winner != null || state.draw) throw new Error("Game is over");
    if (seat !== state.turn) throw new Error("Not this seat's turn");
    const legal = legalMoves(state, seat).find((m) => m.type === move.type && m.cell === move.cell && m.card === move.card);
    if (!legal) throw new Error("Illegal move");
    const team = teamOf(seat, state.seats), hand = state.hands[seat];
    hand.splice(hand.indexOf(move.card), 1);
    state.discard.push(move.card);
    const result = { seat, team, type: move.type, card: move.card, cell: move.cell, made: 0 };
    if (move.type === "remove") {
      result.removedTeam = state.chips[move.cell];
      state.chips[move.cell] = -1;
    } else {
      state.chips[move.cell] = team;
      result.made = checkSequences(state, team, move.cell);
      if (state.sequences[team].length >= state.needed) state.winner = team;
    }
    const next = draw(state);
    if (next) hand.push(next);
    state.moveNo++;
    advance(state);
    return result;
  }

  function pass(state, seat) {
    if (seat !== state.turn) throw new Error("Not this seat's turn");
    state.moveNo++;
    advance(state);
  }

  function advance(state) {
    if (state.winner != null) return;
    state.turn = (state.turn + 1) % state.seats;
    if (state.moveNo > 600 || state.hands.every((h) => !h.length)) state.draw = true;
  }

  const api = {
    BOARD, CELLS_FOR, CORNERS, DIRS, SIZE, ONE_EYED, TWO_EYED, teamCount,
    newGame, clone, legalMoves, applyMove, pass, tradeDeadCard, isDead, isJack, isLocked,
    owns, teamOf, cellName, checkSequences, rng
  };
  root.SeqEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
