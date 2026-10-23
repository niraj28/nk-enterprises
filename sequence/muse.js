/* AI agents: each AI seat asks a language model (Google Gemini, through the site's Worker) to
   pick from the brain's shortlist and to say something at the table. If it can't be reached,
   or answers with something unusable, the seat quietly falls back to the built-in brain. */
(function (root) {
  "use strict";
  const E = root.SeqEngine, B = root.SeqBrain;

  // Set this to your deployed Worker URL (see sequence/worker/README.md). Empty = offline brain.
  const DEFAULT_PROXY = "https://sequence-game.sqnce.workers.dev";

  const PERSONAS = [
    { name: "Arya", style: 0, voice: "a calm, precise strategist who explains plans in one crisp line" },
    { name: "Kabir", style: 1, voice: "a bold attacker who loves risky long lines and teases opponents playfully" },
    { name: "Meera", style: 0.5, voice: "a witty trash-talker with Bollywood one-liners, always friendly" },
    { name: "Dev", style: 0.5, voice: "a careful defender who celebrates every block like a cricket wicket" }
  ];

  function proxyUrl() {
    try { return localStorage.getItem("seq.museProxy") || DEFAULT_PROXY; } catch (e) { return DEFAULT_PROXY; }
  }

  const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const label = (c) => (c === "FREE" ? "free" : (c[0] === "T" ? "10" : c[0]) + SUIT[c[1]]);

  function boardText(state) {
    const rows = ["    " + Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2)).join(" ")];
    for (let r = 0; r < 10; r++) {
      let line = "ABCDEFGHIJ"[r] + "   ";
      for (let c = 0; c < 10; c++) {
        const i = r * 10 + c, t = state.chips[i];
        let ch = E.CORNERS.has(i) ? "*" : t === -1 ? "." : "bgr"[t];
        if (t !== -1 && E.isLocked(state, i)) ch = ch.toUpperCase();
        line += " " + ch + " ";
      }
      rows.push(line.trimEnd());
    }
    return rows.join("\n");
  }

  const LEVEL_HINT = {
    easy: "You are playing casually against a beginner: you often pick a fun move rather than the strongest one.",
    normal: "Play well, but you don't need to be perfect.",
    hard: "Play to win: pick the strongest move every time."
  };

  function buildPrompt(state, seat, persona, players, shortlist, chat, level) {
    const team = E.teamOf(seat, state.seats), teamName = ["Blue", "Green", "Red"][team];
    const mate = players.find((p, i) => i !== seat && E.teamOf(i, state.seats) === team);
    const system =
      (state.seats === 3
        ? `You are ${persona.name}, an AI player in a 3-player Sequence board game, everyone for themselves. Your personality: ${persona.voice}. You play ${teamName}. `
        : state.seats === 2
        ? `You are ${persona.name}, an AI player in a 1-vs-1 Sequence board game. Your personality: ${persona.voice}. You play ${teamName}. `
        : `You are ${persona.name}, an AI player in a 4-player Sequence board game (two teams of two). ` +
          `Your personality: ${persona.voice}. You are on team ${teamName} with ${mate ? mate.name : "a partner"}. `) +
      `Win by making ${state.needed} line${state.needed > 1 ? "s" : ""} of 5 chips. Corners (*) count for everyone. ` +
      `Pick ONE move from the numbered options. Prefer completing or blocking 4-in-a-row, save wild jacks for when they matter. ` +
      `${LEVEL_HINT[level] || LEVEL_HINT.normal} ` +
      `Then say one short table-talk line (max 18 words). Never name or hint at the cards in your hand, and never say which move number you chose. ` +
      `Reply with only JSON: {"choice": <option number>, "say": "<line>"}`;
    const options = shortlist.map((s, n) =>
      `${n + 1}. ${s.move.type === "remove" ? "Remove opponent chip at" : "Place chip at"} ${E.cellName(s.move.cell)} using ${label(s.move.card)} - ${s.notes.join(", ")} (engine score ${s.score})`
    ).join("\n");
    const user =
      `Board (b = Blue, g = Green${state.seats === 3 ? ", r = Red" : ""}, capitals = locked in a finished sequence, * = free corner, rows A-J, columns 1-10):\n${boardText(state)}\n\n` +
      `Sequences: ${state.sequences.map((q, t) => ["Blue", "Green", "Red"][t] + " " + q.length).join(", ")}. Cards left in deck: ${state.deck.length}.\n` +
      `Your hand: ${state.hands[seat].map(label).join(" ")}\n` +
      (chat.length ? `Recent table talk:\n${chat.map((m) => `${m.who}: ${m.text}`).join("\n")}\n` : "") +
      `\nYour options:\n${options}`;
    return { system, user };
  }

  // Table talk must not reveal a hand (that would be signalling to the partner), so drop any
  // line that names a card, a suit or a jack.
  const CARD_TALK = /[♠♥♦♣]|\b(hearts?|spades?|diamonds?|clubs?|jacks?|one[- ]eyed|two[- ]eyed|in my hand|i (have|hold|got)|holding)\b|\b(10|[2-9]|[AKQJ])\s*(of|[SHDC]\b)/i;
  const cleanSay = (say) => (CARD_TALK.test(say) ? "" : say);

  function parseReply(text, n) {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const j = JSON.parse(m[0]);
      const choice = Number(j.choice);
      if (!Number.isInteger(choice) || choice < 1 || choice > n) return null;
      return { choice: choice - 1, say: typeof j.say === "string" ? cleanSay(j.say.slice(0, 160)) : "" };
    } catch (e) { return null; }
  }

  // Circuit breaker: after 3 failures in a row (say the free quota is used up), stop asking
  // for 2 minutes, so AI turns don't each wait for a request that will fail.
  let failStreak = 0, pausedUntil = 0;

  // Returns { ranked entry, say, source: "muse" | "brain", error? }
  async function choose(state, seat, persona, players, chat, level) {
    const ranked = B.analyse(state, seat, level);
    if (!ranked.length) return null;
    const fallback = () => ({ pick: B.pick(ranked, persona.style, Math.random, level), say: "", source: "brain" });
    const url = proxyUrl();
    if (!url || Date.now() < pausedUntil) return fallback();
    if (ranked[0].score >= 200) return fallback(); // a win to take or a four to block: no need to wait for the model
    const shortlist = ranked.slice(0, 8);
    const prompt = buildPrompt(state, seat, persona, players, shortlist, chat.slice(-6), level);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prompt),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const parsed = parseReply(data.text, shortlist.length);
      if (!parsed) throw new Error("Unusable reply");
      let pick = shortlist[parsed.choice];
      // guard rails: take the win, and don't ignore an opponent's open 4
      if (level !== "easy" && ranked[0].score >= 200 && pick.score < ranked[0].score - 150) pick = ranked[0];
      failStreak = 0;
      return { pick, say: parsed.say, source: "muse" };
    } catch (err) {
      if (++failStreak >= 3) { pausedUntil = Date.now() + 120000; failStreak = 0; }
      return Object.assign(fallback(), { error: err.name === "AbortError" ? "timeout" : err.message });
    } finally {
      clearTimeout(timer);
    }
  }

  root.SeqMuse = { PERSONAS, choose, proxyUrl, buildPrompt, parseReply, cleanSay, label };
})(typeof window !== "undefined" ? window : globalThis);
