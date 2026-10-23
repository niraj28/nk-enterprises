/* Online room logic, shared by the Cloudflare Durable Object and the localhost dev hub.
   The room is the referee: it holds the deck and every hand, and view(seat) only ever
   includes that seat's own cards. No DOM and no Cloudflare APIs, so it runs anywhere. */
(function (root) {
  "use strict";
  const E = root.SeqEngine, B = root.SeqBrain, L = root.SeqLines;

  const AI_NAMES = ["Arya", "Kabir", "Meera", "Dev"];
  const AI_STYLE = [0, 1, 0.5, 0.5];
  const TEAM = ["Blue", "Green", "Red"];
  const LEVELS = ["easy", "normal", "hard"];
  const TAKEOVER_MS = 60 * 1000;
  const AUTOSTART_MS = 20 * 1000; // quick match: start this long after the first player sits
  const REACTIONS = ["👏", "😂", "😮", "🔥", "😅", "🙏"];
  const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const label = (c) => (c[0] === "T" ? "10" : c[0]) + SUIT[c[1]];
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

  function makeToken(rand) {
    const abc = "abcdefghijkmnpqrstuvwxyz23456789";
    let t = "";
    for (let i = 0; i < 20; i++) t += abc[Math.floor(rand() * abc.length)];
    return t;
  }

  class RoomCore {
    constructor(data) {
      Object.assign(this, {
        created: false, code: "", phase: "lobby", level: "normal", mode: "2v2", creator: -1, public: false, autoStartAt: 0, lastReact: {},
        seats: [0, 1, 2, 3].map(() => ({ kind: "empty", name: "", token: "", connected: false, awaySince: 0, takenOver: false })),
        state: null, log: [], logId: 0, gameNo: 0, lastCell: -1, recent: [], lastText: "", lastBanter: -9, lastActive: 0
      }, data || {});
    }
    toJSON() {
      const { created, code, phase, level, mode, creator, public: pub, autoStartAt, lastReact, seats, state, log, logId, gameNo, lastCell, recent, lastText, lastBanter, lastActive } = this;
      return { created, code, phase, level, mode, creator, public: pub, autoStartAt, lastReact, seats, state, log, logId, gameNo, lastCell, recent, lastText, lastBanter, lastActive };
    }

    // ---- who is who ----
    hostSeat() {
      const s = this.seats;
      if (this.creator >= 0 && s[this.creator].kind === "human" && s[this.creator].connected) return this.creator;
      const i = s.findIndex((x) => x.kind === "human" && x.connected);
      return i;
    }
    over() { return !this.state || this.state.winner != null || this.state.draw; }
    aiPending() { return this.phase === "playing" && !this.over() && this.seats[this.state.turn].kind === "ai"; }

    addLog(entry) {
      entry.id = ++this.logId;
      this.log.push(entry);
      if (this.log.length > 120) this.log.shift();
    }

    // ---- message handling: conn = { seat }, mutated when the connection sits or stands ----
    handle(conn, msg, now, rand) {
      const out = { reply: null, changed: false };
      const fail = (m) => { out.reply = { t: "error", msg: m }; return out; };
      if (!msg || typeof msg.t !== "string") return fail("Bad message");
      if (msg.t !== "gone") this.lastActive = now;
      const me = conn.seat;
      const isHost = me >= 0 && me === this.hostSeat();

      switch (msg.t) {
        case "hello": {
          if (msg.create && !this.created) {
            this.created = true; this.code = clean(msg.code, 8);
            if (msg.public) { // quick match room: anyone with the code joins, empty seats go to AI after a short wait
              this.public = true;
              const n = { "1v1": 2, "3p": 3 }[msg.mode];
              if (n) { this.mode = msg.mode; this.seats = this.seats.slice(0, n); }
            }
          }
          if (!this.created) return fail("Room not found. Check the code or start a new room.");
          if (msg.token) {
            const i = this.seats.findIndex((s) => s.token && s.token === msg.token);
            if (i >= 0) {
              const s = this.seats[i];
              s.connected = true; s.awaySince = 0;
              if (s.kind === "ai" && s.takenOver) { // back from a takeover: the seat is yours again
                s.kind = "human"; s.takenOver = false; s.name = s.humanName || s.name;
                this.addLog({ k: "sys", text: `${s.name} is back.` });
              }
              conn.seat = i;
            }
          }
          out.reply = { t: "you", seat: conn.seat, token: conn.seat >= 0 ? this.seats[conn.seat].token : "" };
          out.changed = true;
          return out;
        }
        case "sit": {
          const i = Number(msg.seat);
          if (me >= 0) return fail("You already have a seat.");
          if (this.phase === "playing") return fail("The game has already started.");
          if (!(i >= 0 && i < this.seats.length) || this.seats[i].kind !== "empty") return fail("That seat is taken.");
          const s = this.seats[i];
          Object.assign(s, { kind: "human", name: clean(msg.name, 16) || "Player " + (i + 1), token: makeToken(rand), connected: true, awaySince: 0, takenOver: false });
          if (this.creator < 0 || this.seats[this.creator].kind !== "human") this.creator = i;
          if (this.public && !this.autoStartAt) this.autoStartAt = now + AUTOSTART_MS;
          conn.seat = i;
          out.reply = { t: "you", seat: i, token: s.token };
          out.changed = true;
          return out;
        }
        case "stand": {
          if (me < 0 || this.phase === "playing") return fail("You can't leave your seat now.");
          this.seats[me] = { kind: "empty", name: "", token: "", connected: false, awaySince: 0, takenOver: false };
          conn.seat = -1;
          out.reply = { t: "you", seat: -1, token: "" };
          out.changed = true;
          return out;
        }
        case "name": {
          if (me < 0 || this.seats[me].kind !== "human") return fail("Sit down first.");
          this.seats[me].name = clean(msg.name, 16) || this.seats[me].name;
          out.changed = true;
          return out;
        }
        case "ai": {
          const i = Number(msg.seat);
          if (!isHost) return fail("Only the host can do that.");
          if (!(i >= 0 && i < this.seats.length)) return fail("No such seat.");
          const s = this.seats[i];
          if (this.phase !== "playing") { // lobby, or between games
            if (msg.on && s.kind === "empty") Object.assign(s, { kind: "ai", name: AI_NAMES[i], token: "", takenOver: false });
            else if (!msg.on && s.kind === "ai") Object.assign(s, { kind: "empty", name: "" });
            else return fail("Can't change that seat.");
          } else {
            // during a game: hand a player's seat to the AI once they've been away for a minute
            if (!msg.on || s.kind !== "human" || s.connected || now - s.awaySince < TAKEOVER_MS) return fail("That player isn't away long enough.");
            s.humanName = s.name;
            Object.assign(s, { kind: "ai", takenOver: true, name: s.name + " (AI)" });
            this.addLog({ k: "sys", text: `${s.humanName}'s seat is now played by the AI.` });
          }
          out.changed = true;
          return out;
        }
        case "mode": {
          if (!isHost || this.phase === "playing") return fail("Only the host can change the mode before the game.");
          const want = { "1v1": 2, "3p": 3, "2v2": 4 }[msg.mode];
          if (!want) return fail("Unknown mode.");
          if (msg.mode === this.mode) return out;
          if (this.seats.slice(want).some((s) => s.kind === "human")) return fail(`Seat${this.seats.length - want > 1 ? "s" : ""} ${want + 1}${this.seats.length - want > 1 ? " and up" : ""} ha${this.seats.length - want > 1 ? "ve" : "s"} a player. Ask them to leave their seat first.`);
          this.seats = this.seats.slice(0, want);
          for (let i = this.seats.length; i < want; i++) this.seats.push({ kind: "empty", name: "", token: "", connected: false, awaySince: 0, takenOver: false });
          this.mode = msg.mode;
          out.changed = true;
          return out;
        }
        case "level": {
          if (!isHost || this.phase === "playing") return fail("Only the host can change the level before the game.");
          if (!LEVELS.includes(msg.level)) return fail("Unknown level.");
          this.level = msg.level;
          out.changed = true;
          return out;
        }
        case "start": {
          if (!isHost) return fail("Only the host can start.");
          if (this.phase === "playing" && !this.over()) return fail("Game in progress.");
          if (this.public) this.fillWithAI();
          if (this.seats.some((s) => s.kind === "empty")) return fail("Fill every seat with a friend or an AI first.");
          this.state = E.newGame({ seats: this.seats.length, seed: Math.floor(rand() * 2 ** 31) });
          this.phase = "playing"; this.gameNo++; this.log = []; this.lastCell = -1; this.recent = []; this.lastText = ""; this.lastBanter = -9;
          const sides = this.state.sequences.map((q, t) => `${this.teamNames(t)} (${TEAM[t]})`).join(" vs ");
          this.addLog({ k: "sys", text: `${sides}. AI level: ${this.level}. First to ${this.state.needed} sequence${this.state.needed > 1 ? "s" : ""} wins.` });
          const ais = this.seats.map((s, i) => i).filter((i) => this.seats[i].kind === "ai");
          if (ais.length) this.banter(ais[Math.floor(rand() * ais.length)], "start", null, rand);
          this.prelude();
          out.changed = true;
          return out;
        }
        case "move": {
          if (this.phase !== "playing" || this.over()) return fail("No game in progress.");
          if (me < 0 || this.state.turn !== me || this.seats[me].kind !== "human") return fail("It's not your turn.");
          const move = { type: msg.type === "remove" ? "remove" : "place", card: String(msg.card), cell: Number(msg.cell) };
          const legal = E.legalMoves(this.state, me).find((m) => m.type === move.type && m.card === move.card && m.cell === move.cell);
          if (!legal) return fail("That move isn't allowed.");
          const pick = B.scoreMove(this.state, me, legal, this.level);
          const res = this.play(me, pick);
          this.react(me, pick, res, rand);
          this.prelude();
          out.changed = true;
          return out;
        }
        case "react": {
          if (me < 0 || !REACTIONS.includes(msg.emoji)) return fail("Sit down to react.");
          if (now - (this.lastReact[me] || 0) < 1500) return out; // gentle flood control
          this.lastReact[me] = now;
          this.addLog({ k: "react", seat: me, who: this.seats[me].name, emoji: msg.emoji });
          out.changed = true;
          return out;
        }
        case "chat": {
          const text = clean(msg.text, 120);
          if (me < 0 || !text) return fail("Sit down to chat.");
          this.addLog({ k: "say", seat: me, who: this.seats[me].name, text });
          out.changed = true;
          return out;
        }
        case "gone": {
          if (me >= 0 && this.seats[me].kind === "human") { this.seats[me].connected = false; this.seats[me].awaySince = now; out.changed = true; }
          return out;
        }
        default:
          return fail("Unknown message");
      }
    }

    fillWithAI() {
      this.seats.forEach((s, i) => { if (s.kind === "empty") Object.assign(s, { kind: "ai", name: AI_NAMES[i], token: "", takenOver: false }); });
    }
    // quick match: when the wait is over, fill empty seats with AI and start
    autoStart(now, rand) {
      if (!this.public || this.phase !== "lobby" || !this.autoStartAt || now < this.autoStartAt) return false;
      if (!this.seats.some((s) => s.kind === "human" && s.connected)) return false;
      const host = { seat: this.hostSeat() };
      return !!this.handle(host, { t: "start" }, now, rand).changed;
    }

    teamNames(t) { return this.seats.filter((s, i) => E.teamOf(i, this.seats.length) === t).map((s) => s.name).join(" & "); }

    // start of a turn: swap a dead card, pass if nothing is playable, end the game when it's over
    prelude() {
      for (let guard = 0; guard < 8; guard++) {
        if (this.over()) { this.finish(); return; }
        const seat = this.state.turn, s = this.seats[seat];
        const swapped = E.tradeDeadCard(this.state, seat);
        if (swapped) this.addLog({ k: "sys", text: `${s.name} swapped a dead card.` });
        if (E.legalMoves(this.state, seat).length) return;
        this.addLog({ k: "sys", text: `${s.name} has no playable card and passes.` });
        E.pass(this.state, seat);
      }
    }

    finish() {
      if (this.phase === "over") return;
      this.phase = "over";
      const t = this.state.winner;
      this.addLog({ k: "big", text: this.state.draw ? "It's a draw" : `${TEAM[t]}${this.seats.length === 4 ? " team" : ""} wins! (${this.teamNames(t)})` });
      if (t != null) {
        const win = this.seats.map((s, i) => i).filter((i) => E.teamOf(i, this.seats.length) === t && this.seats[i].kind === "ai");
        const lose = this.seats.map((s, i) => i).filter((i) => E.teamOf(i, this.seats.length) !== t && this.seats[i].kind === "ai");
        if (win.length) this.banter(win[0], "win", null, Math.random);
        if (lose.length) this.banter(lose[0], "lose", null, Math.random);
      }
    }

    play(seat, pick, src) {
      const m = pick.move;
      const res = E.applyMove(this.state, seat, m);
      this.lastCell = m.cell;
      this.recent = [m.cell, ...this.recent.filter((c) => c !== m.cell)].slice(0, 3);
      const note = pick.notes && !["positional", "uses a wild jack"].includes(pick.notes[0]) ? pick.notes[0] : "";
      const entry = { k: "move", seat, type: m.type, card: m.card, cell: m.cell, note };
      if (src) entry.src = src; // "llm" or "brain" for AI moves
      if (m.type === "remove") entry.removedTeam = res.removedTeam;
      this.addLog(entry);
      this.lastText = "";
      if (res.made) {
        this.lastText = `🎉 ${TEAM[res.team]} made a sequence! (${this.state.sequences[res.team].length}/${this.state.needed})`;
        this.addLog({ k: "big", text: this.lastText });
      }
      return res;
    }

    // AI turns come in two steps so the server can ask a language model in between:
    // aiPlan() ranks the moves and picks a fallback; aiApply() plays the chosen one.
    aiPlan(rand) {
      if (!this.aiPending()) return null;
      const seat = this.state.turn;
      const ranked = B.analyse(this.state, seat, this.level);
      return { seat, moveNo: this.state.moveNo, ranked, pick: B.pick(ranked, AI_STYLE[seat], rand, this.level), quiet: !!this.seats[seat].takenOver };
    }
    // the prompt for the model: same one local games use, with only this seat's own cards
    promptFor(plan) {
      const M = root.SeqMuse;
      const players = this.seats.map((s) => ({ name: s.name }));
      const chat = this.log.filter((l) => l.k === "say").slice(-6).map((l) => ({ who: l.who, text: l.text }));
      return M.buildPrompt(this.state, plan.seat, M.PERSONAS[plan.seat], players, plan.ranked.slice(0, 8), chat, this.level);
    }
    // turn the model's reply into a move; null means "use the fallback"
    fromReply(plan, text) {
      const M = root.SeqMuse, shortlist = plan.ranked.slice(0, 8);
      const parsed = M.parseReply(text, shortlist.length);
      if (!parsed) return null;
      let pick = shortlist[parsed.choice];
      const top = plan.ranked[0];
      if (this.level !== "easy" && top.score >= 200 && pick.score < top.score - 150) pick = top; // never miss a win or an open four
      return { pick, say: parsed.say };
    }
    aiApply(plan, pick, say, src, rand) {
      if (!plan || !this.aiPending() || this.state.turn !== plan.seat || this.state.moveNo !== plan.moveNo) return false;
      const seat = plan.seat;
      const res = this.play(seat, pick, src);
      if (plan.quiet) { /* a stand-in AI keeps quiet */ }
      else if (say) { this.addLog({ k: "say", seat, who: this.seats[seat].name, text: say }); this.lastBanter = this.state.moveNo; }
      else this.banter(seat, this.eventFor(pick, res), seat, rand);
      this.react(seat, pick, res, rand);
      this.prelude();
      return true;
    }
    aiMove(rand) {
      const plan = this.aiPlan(rand);
      if (plan) this.aiApply(plan, plan.pick, "", "brain", rand);
    }

    // ---- built-in table talk (same rules as local play) ----
    eventFor(pick, res) {
      if (res.made) return "sequence";
      if (res.type === "remove") return "remove";
      const n = pick.notes.join(" ");
      if (/makes 4|sets up/.test(n)) return "four";
      if (/blocks/.test(n)) return "block";
      if (E.TWO_EYED.has(res.card)) return "wild";
      return "idle";
    }
    banter(seat, event, target, rand) {
      const s = this.seats[seat];
      if (!L || s.kind !== "ai" || s.takenOver) return;
      const forced = ["start", "sequence", "theirSeq", "win", "lose"].includes(event);
      const moveNo = this.state ? this.state.moveNo : 0;
      if (!forced && moveNo - this.lastBanter < 3) return;
      const rivals = this.seats.map((x, i) => i).filter((i) => E.teamOf(i, this.seats.length) !== E.teamOf(seat, this.seats.length));
      const mate = this.seats.find((x, i) => i !== seat && E.teamOf(i, this.seats.length) === E.teamOf(seat, this.seats.length));
      const opp = target != null && E.teamOf(target, this.seats.length) !== E.teamOf(seat, this.seats.length) ? target : rivals[Math.floor(rand() * rivals.length)];
      const text = L.line(AI_NAMES[seat], event, { opp: this.seats[opp].name, mate: mate ? mate.name : "" }, rand);
      if (!text) return;
      this.addLog({ k: "say", seat, who: s.name, text });
      this.lastBanter = moveNo;
    }
    react(mover, pick, res, rand) {
      if (this.over()) return;
      const ev = res.made ? "theirSeq" : res.type === "remove" ? "hit" : /blocks opponents' 4/.test(pick.notes.join(" ")) ? "hit" : "";
      if (!ev) return;
      const rivals = this.seats.map((x, i) => i).filter((i) => E.teamOf(i, this.seats.length) !== E.teamOf(mover, this.seats.length) && this.seats[i].kind === "ai" && !this.seats[i].takenOver);
      if (rivals.length) this.banter(rivals[Math.floor(rand() * rivals.length)], ev, mover, rand);
    }

    // ---- what one connection is allowed to see ----
    view(seat, now) {
      const st = this.state;
      return {
        t: "room", code: this.code, phase: this.phase, level: this.level, mode: this.mode, host: this.hostSeat(), you: seat, gameNo: this.gameNo,
        public: this.public, startsIn: this.public && this.phase === "lobby" && this.autoStartAt ? Math.max(0, this.autoStartAt - (now || Date.now())) : 0,
        seats: this.seats.map((s) => ({ kind: s.kind, name: s.name, connected: s.kind !== "human" || s.connected, awaySince: s.awaySince, takenOver: !!s.takenOver })),
        game: st ? {
          chips: st.chips, seqCells: st.seqCells, sequences: st.sequences, turn: st.turn, moveNo: st.moveNo,
          winner: st.winner, draw: st.draw, needed: st.needed, deckCount: st.deck.length,
          handCounts: st.hands.map((h) => h.length),
          hand: seat >= 0 ? st.hands[seat].slice() : []
        } : null,
        lastCell: this.lastCell, recent: this.recent, lastText: this.lastText,
        log: this.log
      };
    }
  }

  const api = { RoomCore, TAKEOVER_MS, AUTOSTART_MS, REACTIONS, label };
  root.SeqRoom = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
