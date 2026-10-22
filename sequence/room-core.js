/* Online room logic, shared by the Cloudflare Durable Object and the localhost dev hub.
   The room is the referee: it holds the deck and every hand, and view(seat) only ever
   includes that seat's own cards. No DOM and no Cloudflare APIs, so it runs anywhere. */
(function (root) {
  "use strict";
  const E = root.SeqEngine, B = root.SeqBrain, L = root.SeqLines;

  const AI_NAMES = ["Arya", "Kabir", "Meera", "Dev"];
  const AI_STYLE = [0, 1, 0.5, 0.5];
  const TEAM = ["Blue", "Green"];
  const LEVELS = ["easy", "normal", "hard"];
  const TAKEOVER_MS = 60 * 1000;
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
        created: false, code: "", phase: "lobby", level: "normal", creator: -1,
        seats: [0, 1, 2, 3].map(() => ({ kind: "empty", name: "", token: "", connected: false, awaySince: 0, takenOver: false })),
        state: null, log: [], logId: 0, gameNo: 0, lastCell: -1, recent: [], lastText: "", lastBanter: -9, lastActive: 0
      }, data || {});
    }
    toJSON() {
      const { created, code, phase, level, creator, seats, state, log, logId, gameNo, lastCell, recent, lastText, lastBanter, lastActive } = this;
      return { created, code, phase, level, creator, seats, state, log, logId, gameNo, lastCell, recent, lastText, lastBanter, lastActive };
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
          if (msg.create && !this.created) { this.created = true; this.code = clean(msg.code, 8); }
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
          if (this.phase !== "lobby") return fail("The game has already started.");
          if (!(i >= 0 && i < 4) || this.seats[i].kind !== "empty") return fail("That seat is taken.");
          const s = this.seats[i];
          Object.assign(s, { kind: "human", name: clean(msg.name, 16) || "Player " + (i + 1), token: makeToken(rand), connected: true, awaySince: 0, takenOver: false });
          if (this.creator < 0 || this.seats[this.creator].kind !== "human") this.creator = i;
          conn.seat = i;
          out.reply = { t: "you", seat: i, token: s.token };
          out.changed = true;
          return out;
        }
        case "stand": {
          if (me < 0 || this.phase !== "lobby") return fail("You can't leave your seat now.");
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
          if (!(i >= 0 && i < 4)) return fail("No such seat.");
          const s = this.seats[i];
          if (this.phase === "lobby") {
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
          if (this.seats.some((s) => s.kind === "empty")) return fail("Fill every seat with a friend or an AI first.");
          this.state = E.newGame({ seats: 4, seed: Math.floor(rand() * 2 ** 31) });
          this.phase = "playing"; this.gameNo++; this.log = []; this.lastCell = -1; this.recent = []; this.lastText = ""; this.lastBanter = -9;
          this.addLog({ k: "sys", text: `${this.teamNames(0)} (Blue) vs ${this.teamNames(1)} (Green). AI level: ${this.level}. First to 2 sequences wins.` });
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

    teamNames(t) { return this.seats.filter((s, i) => E.teamOf(i) === t).map((s) => s.name).join(" & "); }

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
      this.addLog({ k: "big", text: this.state.draw ? "It's a draw" : `${TEAM[t]} team wins! (${this.teamNames(t)})` });
      if (t != null) {
        const win = this.seats.map((s, i) => i).filter((i) => E.teamOf(i) === t && this.seats[i].kind === "ai");
        const lose = this.seats.map((s, i) => i).filter((i) => E.teamOf(i) !== t && this.seats[i].kind === "ai");
        if (win.length) this.banter(win[0], "win", null, Math.random);
        if (lose.length) this.banter(lose[0], "lose", null, Math.random);
      }
    }

    play(seat, pick) {
      const m = pick.move;
      const res = E.applyMove(this.state, seat, m);
      this.lastCell = m.cell;
      this.recent = [m.cell, ...this.recent.filter((c) => c !== m.cell)].slice(0, 3);
      const note = pick.notes && !["positional", "uses a wild jack"].includes(pick.notes[0]) ? pick.notes[0] : "";
      const entry = { k: "move", seat, type: m.type, card: m.card, cell: m.cell, note };
      if (m.type === "remove") entry.removedTeam = res.removedTeam;
      this.addLog(entry);
      this.lastText = "";
      if (res.made) {
        this.addLog({ k: "big", text: `🎉 ${TEAM[res.team]} made a sequence! (${this.state.sequences[res.team].length}/2)` });
        this.lastText = `🎉 ${TEAM[res.team]} made a sequence! (${this.state.sequences[res.team].length}/2)`;
      }
      return res;
    }

    aiMove(rand) {
      if (!this.aiPending()) return;
      const seat = this.state.turn;
      const ranked = B.analyse(this.state, seat, this.level);
      const pick = B.pick(ranked, AI_STYLE[seat], rand, this.level);
      const res = this.play(seat, pick);
      if (this.seats[seat].takenOver) { /* a stand-in AI keeps quiet */ }
      else this.banter(seat, this.eventFor(pick, res), seat, rand);
      this.react(seat, pick, res, rand);
      this.prelude();
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
      const rivals = [0, 1, 2, 3].filter((i) => E.teamOf(i) !== E.teamOf(seat));
      const mate = this.seats.find((x, i) => i !== seat && E.teamOf(i) === E.teamOf(seat));
      const opp = target != null && E.teamOf(target) !== E.teamOf(seat) ? target : rivals[Math.floor(rand() * rivals.length)];
      const text = L.line(AI_NAMES[seat], event, { opp: this.seats[opp].name, mate: mate ? mate.name : "" }, rand);
      if (!text) return;
      this.addLog({ k: "say", seat, who: s.name, text });
      this.lastBanter = moveNo;
    }
    react(mover, pick, res, rand) {
      if (this.over()) return;
      const ev = res.made ? "theirSeq" : res.type === "remove" ? "hit" : /blocks opponents' 4/.test(pick.notes.join(" ")) ? "hit" : "";
      if (!ev) return;
      const rivals = [0, 1, 2, 3].filter((i) => E.teamOf(i) !== E.teamOf(mover) && this.seats[i].kind === "ai" && !this.seats[i].takenOver);
      if (rivals.length) this.banter(rivals[Math.floor(rand() * rivals.length)], ev, mover, rand);
    }

    // ---- what one connection is allowed to see ----
    view(seat) {
      const st = this.state;
      return {
        t: "room", code: this.code, phase: this.phase, level: this.level, host: this.hostSeat(), you: seat, gameNo: this.gameNo,
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

  const api = { RoomCore, TAKEOVER_MS, label };
  root.SeqRoom = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
