/* Sequence table UI: seats, board, hands, turn loop and table talk. */
(function () {
  "use strict";
  const E = window.SeqEngine, B = window.SeqBrain, M = window.SeqMuse, L = window.SeqLines, O = window.SeqOnline;
  const P = window.SeqProgress, D = window.SeqDaily;
  const S = window.SeqSound || { play() {}, enabled: () => false, toggle: () => false };
  const $ = (id) => document.getElementById(id);
  const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const TEAM = ["Blue", "Green", "Red"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const label = (c) => (c[0] === "T" ? "10" : c[0]) + SUIT[c[1]];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const teamOf = (i) => E.teamOf(i, players.length || seatCount());
  const teamWord = (n) => (n === 4 ? " team" : ""); // "Blue team" only when there are partners
  const avatar = (p, i, n) => `<span class="avatar t${E.teamOf(i, n || players.length || seatCount())}${p.mode === "muse" ? " ai" : ""}" aria-hidden="true">${esc((p.name || "?").trim()[0] || "?").toUpperCase()}</span>`;

  // ---- Seats ----
  let seats = store.get("seq.seats", null);
  if (!Array.isArray(seats) || seats.length !== 4) {
    seats = M.PERSONAS.map((p, i) => ({ name: i === 0 ? "You" : p.name, mode: i === 0 ? "human" : "muse" }));
  }

  const SEATS_FOR = { "1v1": 2, "3p": 3, "2v2": 4 };
  let mode = SEATS_FOR[store.get("seq.mode", "2v2")] ? store.get("seq.mode", "2v2") : "2v2";
  const seatCount = () => SEATS_FOR[mode];
  function renderMode() {
    document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === mode)));
    $("modeHint").textContent = { "1v1": "You against one opponent. 7 cards each, first to 2 lines.", "3p": "Three players, everyone for themselves. 6 cards each, first to 1 line.", "2v2": "Two teams of two. 6 cards each, first to 2 lines." }[mode];
    $("watchBtn").textContent = `👀 Watch ${seatCount()} AI agents`;
  }
  document.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.v; store.set("seq.mode", mode); renderMode(); renderSeats();
  }));

  function renderSeats() {
    $("seats").innerHTML = "";
    seats.slice(0, seatCount()).forEach((s, i) => {
      const p = M.PERSONAS[i], el = document.createElement("li");
      el.className = "seat";
      el.innerHTML =
        avatar(s, i, seatCount()) +
        `<div class="who"><input aria-label="Seat ${i + 1} name" maxlength="16"><span class="persona"></span></div>` +
        `<div class="mode" role="group" aria-label="Seat ${i + 1} player">` +
        `<button type="button" data-m="muse">AI</button><button type="button" data-m="human">Human</button></div>`;
      const input = el.querySelector("input");
      input.value = s.name;
      input.addEventListener("input", () => {
        s.name = input.value.trim() || (s.mode === "muse" ? p.name : "Player " + (i + 1));
        el.querySelector(".avatar").textContent = s.name[0].toUpperCase();
        store.set("seq.seats", seats);
      });
      el.querySelectorAll(".mode button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.m === s.mode));
        b.addEventListener("click", () => {
          if (s.mode === b.dataset.m) return;
          s.mode = b.dataset.m;
          if (s.mode === "muse" && /^(You|Player \d)$/.test(s.name)) s.name = p.name;
          if (s.mode === "human" && s.name === p.name) s.name = i === 0 ? "You" : "Player " + (i + 1);
          store.set("seq.seats", seats);
          renderSeats();
        });
      });
      el.querySelector(".persona").textContent = `${TEAM[E.teamOf(i, seatCount())]}${teamWord(seatCount())} · ` +
        (s.mode === "muse" ? p.voice.replace(/^an? /, "") : "plays on this device");
      $("seats").appendChild(el);
    });
    const h = seats.slice(0, seatCount()).filter((s) => s.mode === "human").length;
    $("startBtn").textContent = h === 0 ? "▶ Start (AI only)" : h === 1 ? "▶ Play now" : `▶ Play now (${h} players, 1 phone)`;
  }

  // ---- AI level ----
  let level = store.get("seq.level", "normal");
  function renderLevel() {
    document.querySelectorAll("#levels button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.l === level)));
    $("levelHint").textContent = { easy: "Relaxed AI that misses things. Good for learning.", normal: "Solid players that block your fours.", hard: "Counts played cards and saves its jacks." }[level];
  }
  document.querySelectorAll("#levels button").forEach((b) => b.addEventListener("click", () => { level = b.dataset.l; store.set("seq.level", level); renderLevel(); }));

  function renderMuseStatus() {
    const url = M.proxyUrl(), el = $("museStatus");
    el.className = "muse-status" + (url ? " on" : "");
    el.textContent = url ? "AI players think with Google Gemini." : "AI seats use the built-in brain.";
    $("proxyInput").value = url;
  }
  $("proxySave").addEventListener("click", () => {
    const v = $("proxyInput").value.trim();
    try { v ? localStorage.setItem("seq.museProxy", v) : localStorage.removeItem("seq.museProxy"); } catch (e) { /* ignore */ }
    renderMuseStatus();
  });

  // ---- Game state ----
  let state = null, players = [], token = 0, selected = null, revealed = -1, lastCell = -1, flashCell = -1, recent = [];
  let paused = false, chat = [], museWarned = false, lastAllAi = false, lastText = "", bubbleTimer = 0;
  let feedLog = [], lastBanter = -9, gameLevel = "normal";
  let gameDaily = null, dailyPractice = false, seqSeen = 0, dailyMoves = []; // daily challenge date, replay flag, sequences already highlighted
  let online = null; // { code, conn, you, view, status, gameNo, logShown, awaySeen, winShown }
  const humans = () => players.filter((p) => p.mode === "human").length;
  const over = () => state.winner != null || state.draw;

  function start(allAi, daily) {
    lastAllAi = allAi;
    gameDaily = daily ? P.today() : null;
    dailyPractice = !!(daily && P.load().daily[gameDaily]);
    if (daily) {
      // the daily challenge: the same deal for everyone, you against the Hard brain (no Gemini, so it's fair)
      const me = seats[0].mode === "human" ? seats[0].name : "You";
      players = [{ name: me, mode: "human", persona: M.PERSONAS[0] }, { name: "Arya", mode: "muse", persona: M.PERSONAS[0] }];
      state = D.newGame(gameDaily);
      gameLevel = "hard";
    } else {
      const cfg = (allAi ? M.PERSONAS.map((p) => ({ name: p.name, mode: "muse" })) : seats).slice(0, seatCount());
      if (!allAi) store.set("seq.seats", seats);
      players = cfg.map((s, i) => ({ name: s.name || M.PERSONAS[i].name, mode: s.mode, persona: M.PERSONAS[i] }));
      state = E.newGame({ seats: players.length });
      gameLevel = level;
    }
    seqSeen = 0; dailyMoves = [];
    token++; selected = null; revealed = -1; lastCell = -1; recent = []; paused = false; chat = []; museWarned = false; lastText = "";
    feedLog = []; lastBanter = -9;
    $("feed").innerHTML = ""; $("bubble").hidden = true;
    showTable();
    if (gameDaily) log("sys", `Daily challenge #${P.dailyNo(gameDaily)}${dailyPractice ? " (practice: today's result is already saved)" : ""}. Same deal for everyone today, against the Hard AI. First to 2 lines wins.`);
    else log("sys", `${state.sequences.map((q, t) => `${teamNames(t)} (${TEAM[t]})`).join(" vs ")}. AI level: ${gameLevel}. First to ${state.needed} line${state.needed > 1 ? "s" : ""} wins.`);
    if (humans() > 0 && !store.get("seq.tutorial", false)) { $("tutorial").hidden = false; $("tutBtn").focus(); }
    const ais = players.map((p, i) => i).filter((i) => players[i].mode === "muse");
    if (ais.length) { const my = token, sp = ais[Math.floor(Math.random() * ais.length)]; setTimeout(() => my === token && banter(sp, "start"), 500); }
    step();
  }

  function showTable() {
    document.body.classList.add("playing");
    $("setup").hidden = true; $("table").hidden = false; $("winSheet").hidden = true;
    $("chatForm").hidden = online ? false : humans() === 0;
    $("pauseBtn").hidden = !!online || humans() > 0;
    $("speed").parentElement.hidden = !!online;
    $("reactions").hidden = !online || online.you < 0;
    setPause(false);
    window.scrollTo(0, 0);
  }
  const teamNames = (t) => players.filter((p, i) => teamOf(i) === t).map((p) => p.name).join(" & ");

  function exit() {
    if (online) {
      if (online.view && online.view.phase === "playing" && !confirm("Leave this online game? You can rejoin with the same link.")) return;
      return leaveRoom();
    }
    if (state && !over() && humans() > 0 && state.moveNo > 0 && !confirm("Leave this game?")) return;
    token++; state = null;
    try { localStorage.removeItem("seq.save"); } catch (e) { /* ignore */ }
    document.body.classList.remove("playing");
    $("table").hidden = true; $("setup").hidden = false; $("cover").hidden = true; $("winSheet").hidden = true;
    renderSeats();
    renderResume();
    renderRecord();
  }

  function step() {
    const my = token;
    if (over()) return finish();
    save();
    const seat = state.turn, p = players[seat];
    const swapped = E.tradeDeadCard(state, seat);
    if (swapped) log("sys", `${p.name} swapped a dead card${p.mode === "human" && viewerSeat() === seat ? " (" + label(swapped) + ")" : ""}.`);
    if (!E.legalMoves(state, seat).length) {
      log("sys", `${p.name} has no playable card and passes.`);
      E.pass(state, seat);
      return setTimeout(() => my === token && step(), 400);
    }
    if (p.mode === "human") {
      selected = null;
      if (humans() > 1 && revealed !== seat) showCover(seat);
      render();
      return;
    }
    render();
    aiTurn(seat, my);
  }

  async function aiTurn(seat, my) {
    const p = players[seat], started = Date.now();
    const out = gameDaily
      ? { pick: B.scoreMove(state, seat, D.aiMove(state, seat), "hard"), say: "", source: "brain" }
      : await M.choose(state, seat, p.persona, players, chat, gameLevel);
    const wait = Math.max(0, Number($("speed").value) - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    while (paused && my === token) await new Promise((r) => setTimeout(r, 200));
    if (my !== token) return;
    if (out.error && !museWarned) { museWarned = true; log("sys", `Gemini didn't answer (${out.error}), so the built-in brain is filling in.`); }
    const res = play(seat, out.pick, out.source);
    if (out.say) { say(seat, out.say); lastBanter = state.moveNo; }
    else banter(seat, eventFor(out.pick, res), seat);
    react(seat, out.pick, res);
    step();
  }

  function describe(p, m, res, pick, you) {
    const who = you ? "You" : p.name;
    const what = m.type === "remove"
      ? `${who} removed a ${TEAM[res.removedTeam]} chip at ${E.cellName(m.cell)} (${label(m.card)})`
      : `${who} played ${label(m.card)} on ${E.cellName(m.cell)}`;
    const note = pick.notes && pick.notes[0] !== "positional" && pick.notes[0] !== "uses a wild jack" ? pick.notes[0] : "";
    return { what, note };
  }

  function play(seat, pick, source) {
    const p = players[seat], m = pick.move;
    const res = E.applyMove(state, seat, m);
    S.play(res.made ? "sequence" : m.type === "remove" ? "remove" : "place");
    lastCell = m.cell; flashCell = m.type === "place" ? m.cell : -1;
    recent = [m.cell, ...recent.filter((c) => c !== m.cell)].slice(0, 3);
    const d = describe(p, m, res, pick, p.mode === "human" && humans() === 1);
    lastText = d.what + (d.note ? " · " + d.note : "");
    log("move", `<b>${esc(d.what)}</b>${d.note ? " · " + esc(d.note) : ""}` + (source ? `<span class="src">${source === "muse" ? "Gemini" : "brain"}</span>` : ""));
    if (res.made) {
      const msg = `🎉 ${TEAM[res.team]} made a line! (${state.sequences[res.team].length}/${state.needed})`;
      log("big", msg);
      lastText = msg;
    }
    return res;
  }

  // ---- Built-in table talk ----
  function eventFor(pick, res) {
    if (res.made) return "sequence";
    if (res.type === "remove") return "remove";
    const n = pick.notes.join(" ");
    if (/makes 4|sets up/.test(n)) return "four";
    if (/blocks/.test(n)) return "block";
    if (E.TWO_EYED.has(res.card)) return "wild";
    return "idle";
  }
  function ctxFor(seat, target) {
    const rivals = players.map((p, i) => i).filter((i) => teamOf(i) !== teamOf(seat));
    const mate = players.find((p, i) => i !== seat && teamOf(i) === teamOf(seat));
    const opp = target != null && teamOf(target) !== teamOf(seat) ? target : rivals[Math.floor(Math.random() * rivals.length)];
    // the default human name "You" reads oddly when addressed, so use a nickname instead
    const call = (n, alt) => (/^you$/i.test(n) ? alt : n);
    return { opp: call(players[opp].name, "champ"), mate: mate ? call(mate.name, "partner") : "" };
  }
  const FORCED = new Set(["start", "sequence", "theirSeq", "win", "lose"]);
  function banter(seat, event, target) {
    const p = players[seat];
    if (!p || p.mode !== "muse") return false;
    if (!FORCED.has(event) && state && state.moveNo - lastBanter < 3) return false; // don't chatter every move
    const text = L.line(p.persona.name, event, ctxFor(seat, target));
    if (!text) return false;
    say(seat, text);
    if (state) lastBanter = state.moveNo;
    return true;
  }
  // a rival AI reacts to a sequence, block or removal against their team
  function react(mover, pick, res) {
    if (over()) return;
    const ev = res.made ? "theirSeq" : res.type === "remove" ? "hit" : /blocks opponents' 4/.test(pick.notes.join(" ")) ? "hit" : "";
    if (!ev) return;
    const rivals = players.map((p, i) => i).filter((i) => teamOf(i) !== teamOf(mover) && players[i].mode === "muse");
    if (!rivals.length) return;
    const my = token, who = rivals[Math.floor(Math.random() * rivals.length)];
    setTimeout(() => my === token && !over() && banter(who, ev, mover), 700);
  }

  function finish() {
    render();
    const t = state.winner, h = players.map((p, i) => (p.mode === "human" ? i : -1)).filter((i) => i >= 0);
    const youWon = h.length === 1 && teamOf(h[0]) === t;
    const youLost = h.length === 1 && t != null && !youWon;
    $("winTitle").textContent = state.draw ? "It's a draw" : youWon ? "You win! 🎉" : youLost ? `${TEAM[t]} wins this time` : `${TEAM[t]}${teamWord(players.length)} wins!`;
    $("winText").textContent = state.draw ? "The deck ran dry with no winner." : `${teamNames(t)} made ${state.needed} line${state.needed > 1 ? "s" : ""} in ${state.moveNo} moves.`;
    document.querySelector(".trophy").textContent = youLost ? "🤝" : "🏆";
    $("againBtn").disabled = false; $("againBtn").textContent = "Play again";
    S.play(youLost ? "lose" : "win");
    log("big", $("winTitle").textContent);
    try { localStorage.removeItem("seq.save"); } catch (e) { /* ignore */ }
    if (t != null) {
      const winAi = players.map((p, i) => i).filter((i) => teamOf(i) === t && players[i].mode === "muse");
      const loseAi = players.map((p, i) => i).filter((i) => teamOf(i) !== t && players[i].mode === "muse");
      if (winAi.length) banter(winAi[0], "win");
      const my = token;
      if (loseAi.length) setTimeout(() => my === token && banter(loseAi[0], "lose"), 900);
    }
    $("winExtra").innerHTML = "";
    if (h.length === 1) {
      const result = state.draw ? "draw" : youWon ? "win" : "loss";
      const rec = P.record({ result, mode: players.length === 2 ? "1v1" : players.length === 3 ? "3p" : "2v2", level: gameLevel, moves: state.moveNo, daily: gameDaily && !dailyPractice ? gameDaily : null });
      showWinExtras(rec, result, state.moveNo);
      if (gameDaily) showDailyBoard(result);
      if (youWon) confetti();
    }
    $("againBtn").textContent = gameDaily ? "Play a normal game" : "Play again";
    $("winSheet").hidden = false;
    $("againBtn").focus();
  }

  // ---- Human input ----
  function viewerSeat() {
    if (online) return online.you;
    const h = players.map((p, i) => (p.mode === "human" ? i : -1)).filter((i) => i >= 0);
    if (h.length === 1) return h[0];
    if (h.length === 0) return state.turn; // spectating: follow the agent whose turn it is
    return players[state.turn].mode === "human" && revealed === state.turn ? state.turn : -1;
  }
  const myTurn = () => online
    ? online.view && online.view.phase === "playing" && !over() && state.turn === online.you
    : !over() && players[state.turn].mode === "human" && viewerSeat() === state.turn;

  function showCover(seat) {
    const p = players[seat];
    $("coverAvatar").className = "avatar big t" + teamOf(seat);
    $("coverAvatar").textContent = p.name[0].toUpperCase();
    $("coverTitle").textContent = `${p.name}'s turn`;
    $("coverText").textContent = `Pass the phone to ${p.name} (${TEAM[teamOf(seat)]}${teamWord(players.length)}). Everyone else, no peeking!`;
    $("cover").hidden = false;
    $("coverBtn").focus();
    S.play("turn");
    buzz(35);
  }
  $("coverBtn").addEventListener("click", () => { revealed = state.turn; $("cover").hidden = true; render(); });

  $("hand").addEventListener("click", (e) => {
    const b = e.target.closest(".card");
    if (!b || !myTurn()) return;
    selected = selected === b.dataset.card ? null : b.dataset.card;
    if (selected) S.play("select");
    render();
    // on phones, make sure the glowing spaces are in view
    if (selected && $("board").getBoundingClientRect().top < 0) $("banner").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // desktop: hovering a card previews where it can go
  $("hand").addEventListener("mouseover", (e) => {
    const b = e.target.closest(".card");
    if (!b || !myTurn() || selected) return;
    const cells = new Set(E.legalMoves(state, state.turn).filter((m) => m.card === b.dataset.card).map((m) => m.cell));
    if (cells.size > 8) return;
    cellEls.forEach((c, i) => c.classList.toggle("peek", cells.has(i)));
  });
  $("hand").addEventListener("mouseleave", () => cellEls.forEach((c) => c.classList.remove("peek")));

  $("board").addEventListener("click", (e) => {
    const c = e.target.closest(".cell");
    if (!c || !myTurn()) return;
    if (!c.classList.contains("legal")) { if (selected) { selected = null; render(); } return; }
    const seat = state.turn, cell = Number(c.dataset.i);
    const move = E.legalMoves(state, seat).find((m) => m.card === selected && m.cell === cell);
    if (!move) return;
    if (online) {
      online.conn.send({ t: "move", type: move.type, card: move.card, cell: move.cell });
      selected = null;
      render();
      return;
    }
    const pick = B.scoreMove(state, seat, move);
    if (gameDaily) dailyMoves.push({ type: move.type, card: move.card, cell: move.cell }); // replayed by the leaderboard
    const res = play(seat, pick, null);
    react(seat, pick, res);
    selected = null;
    if (humans() > 1) revealed = -1;
    step();
  });
  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("chatInput").value.trim();
    if (!v) return;
    if (online) { online.conn.send({ t: "chat", text: v }); $("chatInput").value = ""; return; }
    const s = viewerSeat();
    say(s >= 0 && players[s].mode === "human" ? s : players.findIndex((p) => p.mode === "human"), v);
    $("chatInput").value = "";
  });

  // ---- Rendering ----
  const cellEls = [];
  E.BOARD.forEach((card, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.i = i;
    b.setAttribute("role", "gridcell");
    if (card === "FREE") { b.className = "cell free"; b.innerHTML = "★"; b.setAttribute("aria-label", `${E.cellName(i)} free corner`); }
    else {
      b.className = "cell" + ("HD".includes(card[1]) ? " red" : "");
      b.innerHTML = `<span>${card[0] === "T" ? "10" : card[0]}</span><span class="s">${SUIT[card[1]]}</span>`;
    }
    cellEls.push(b);
    $("board").appendChild(b);
  });

  function render() {
    if (!state) return;
    const seat = state.turn, mine = myTurn();
    const legal = mine && selected ? E.legalMoves(state, seat).filter((m) => m.card === selected) : [];
    const legalSet = new Map(legal.map((m) => [m.cell, m.type]));
    $("board").classList.toggle("picking", legalSet.size > 0);
    $("board").classList.toggle("few", legalSet.size > 0 && legalSet.size <= 6);
    cellEls.forEach((b, i) => {
      const t = state.chips[i], card = E.BOARD[i];
      b.classList.toggle("legal", legalSet.has(i));
      b.classList.toggle("remove", legalSet.get(i) === "remove");
      b.classList.toggle("locked", t !== -1 && E.isLocked(state, i));
      b.classList.toggle("last", i === lastCell);
      b.classList.toggle("recent", i !== lastCell && recent.includes(i));
      b.classList.toggle("flash", i === flashCell);
      b.classList.remove("peek");
      b.tabIndex = legalSet.has(i) ? 0 : -1;
      let chip = b.querySelector(".chip");
      if (t === -1 && chip) chip.remove();
      if (t !== -1) {
        if (!chip) { chip = document.createElement("span"); b.appendChild(chip); }
        chip.className = "chip t" + t;
      }
      if (card !== "FREE") b.setAttribute("aria-label", `${E.cellName(i)} ${label(card)}${t !== -1 ? ", " + TEAM[t] + " chip" : ""}`);
    });
    flashCell = -1;
    const seqNow = state.sequences.reduce((n, q) => n + q.length, 0);
    if (seqNow > seqSeen) {
      // glow the line that was just completed
      const newest = state.sequences.flat().slice(-1)[0] || []; // only one sequence lands per move, so the last added is new
      const ownTeam = viewerSeat() >= 0 && state.sequences[teamOf(viewerSeat())].some((q) => q === newest);
      newest.forEach((i) => { cellEls[i].classList.remove("seqflash"); void cellEls[i].offsetWidth; cellEls[i].classList.add("seqflash"); });
      setTimeout(() => newest.forEach((i) => cellEls[i].classList.remove("seqflash")), 1700);
      if (ownTeam) buzz([30, 40, 30]);
    }
    seqSeen = seqNow;
    $("scoreBlue").textContent = state.sequences[0].length;
    $("scoreGreen").textContent = state.sequences[1].length;
    $("scoreRedWrap").hidden = state.sequences.length < 3;
    if (state.sequences.length > 2) $("scoreRed").textContent = state.sequences[2].length;
    document.querySelectorAll(".score .need").forEach((el) => { el.textContent = state.needed; });

    // banner: what to do now, plus what just happened
    const p = players[seat];
    let main;
    if (over()) main = "Game over";
    else if (mine) {
      if (!selected) main = humans() > 1 && !online ? `${p.name}, pick a card` : "Your turn: pick a card";
      else if (E.TWO_EYED.has(selected)) main = "Wild jack: tap any open space";
      else if (E.ONE_EYED.has(selected)) main = legalSet.size ? "Tap an opponent chip to remove it" : "No chip to remove: pick another card";
      else main = `Tap a glowing space for ${label(selected)}`;
    } else if (p.mode === "human") main = `${p.name}'s turn`;
    else main = paused ? "Paused" : `${p.name} is thinking…`;
    if (online && !over() && p.mode === "human" && p.away && !mine) main = `Waiting for ${p.name} to reconnect…`;
    if (online && online.status === "offline") main = "Reconnecting…";
    $("turnText").textContent = main;
    $("lastText").textContent = lastText;
    $("banner").classList.toggle("mine", mine);

    // hand
    const vs = viewerSeat(), hand = $("hand");
    hand.classList.toggle("waiting", !mine);
    if (vs < 0) {
      hand.innerHTML = '<span class="card back" aria-hidden="true"></span>'.repeat(6);
    } else {
      hand.setAttribute("aria-label", players[vs].mode === "human" ? "Your cards" : `${players[vs].name}'s cards`);
      hand.innerHTML = state.hands[vs].map((c) => {
        const tag = E.TWO_EYED.has(c) ? "<small>wild</small>" : E.ONE_EYED.has(c) ? "<small>take</small>" : E.isDead(state, c) ? '<small class="dead">dead</small>' : "";
        return `<button type="button" class="card${"HD".includes(c[1]) ? " red" : ""}" data-card="${c}" aria-pressed="${selected === c}" ${mine ? "" : "disabled"} aria-label="${label(c)}${tag ? " " + tag.replace(/<[^>]+>/g, "") : ""}">${label(c)}${tag}</button>`;
      }).join("");
    }

    // player strip
    const me = online ? online.you : humans() === 1 ? viewerSeat() : -1;
    const iHost = online && online.view && online.view.host === online.you && online.you >= 0;
    $("players").style.setProperty("--n", players.length);
    $("players").innerHTML = players.map((pl, i) => {
      const now = i === seat && !over();
      let status = now ? (pl.mode === "muse" ? '<small class="dots">thinking</small>' : "<small>to play</small>")
        : `<small>${me < 0 ? TEAM[teamOf(i)] : i === me ? "you" : teamOf(i) === teamOf(me) ? "partner" : "rival"}</small>`;
      if (pl.away) {
        status = "<small>away</small>";
        const since = online && online.awaySeen[i];
        if (iHost && since && Date.now() - since >= 60000 && !over()) status += `<button type="button" class="take" data-take="${i}">AI plays</button>`;
      }
      return `<li class="${now ? "now" : ""}${pl.away ? " away" : ""}">${avatar(pl, i)}<span class="meta"><b>${esc(pl.name)}</b>${status}</span></li>`;
    }).join("");
  }

  function log(kind, html, restoring) {
    if (!restoring) { feedLog.push([kind, html]); if (feedLog.length > 150) feedLog.shift(); }
    const li = document.createElement("li");
    li.className = kind;
    li.innerHTML = kind === "sys" || kind === "big" ? esc(html) : html;
    const feed = $("feed");
    feed.appendChild(li);
    while (feed.children.length > 150) feed.firstChild.remove();
    feed.scrollTop = feed.scrollHeight;
  }
  function say(seat, text) {
    const who = players[seat].name;
    chat.push({ who, text });
    if (chat.length > 30) chat.shift();
    log("say", `<b>${esc(who)}:</b> ${esc(text)}`);
    showBubble(seat, who, text);
    S.play("chat");
  }
  // speech bubble under the speaker's seat
  function showBubble(seat, who, text) {
    const bubble = $("bubble");
    bubble.innerHTML = `<b>${esc(who)}:</b> ${esc(text)}`;
    bubble.style.setProperty("--x", `${(seat + 0.5) * 100 / Math.max(players.length, 1)}%`);
    bubble.hidden = false;
    bubble.style.animation = "none"; void bubble.offsetWidth; bubble.style.animation = "";
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 4500);
  }
  $("bubble").addEventListener("click", () => { $("bubble").hidden = true; });

  // ---- Save and resume (survives a refresh) ----
  function save() {
    if (!state || over()) return;
    store.set("seq.save", {
      v: 1, state, level: gameLevel, lastAllAi, chat, feedLog, lastText, recent, lastCell, gameDaily, dailyPractice, dailyMoves,
      players: players.map((p) => ({ name: p.name, mode: p.mode }))
    });
  }
  function loadSave() {
    const s = store.get("seq.save", null);
    return s && s.v === 1 && s.state && Array.isArray(s.players) && (s.players.length === 2 || s.players.length === 4) && s.state.seats === s.players.length && s.state.winner == null && !s.state.draw ? s : null;
  }
  function renderResume() {
    const s = loadSave();
    $("resume").hidden = !s;
    if (!s) return;
    const sq = s.state.sequences;
    $("resumeText").textContent = `Blue ${sq[0].length} – Green ${sq[1].length} · move ${s.state.moveNo} · ${s.level} AI`;
  }
  function resume() {
    const s = loadSave();
    if (!s) return renderResume();
    state = s.state; gameLevel = s.level || "normal"; lastAllAi = !!s.lastAllAi;
    gameDaily = s.gameDaily || null; dailyPractice = !!s.dailyPractice; dailyMoves = s.dailyMoves || []; seqSeen = state.sequences.reduce((n, q) => n + q.length, 0);
    players = s.players.map((p, i) => ({ name: p.name, mode: p.mode, persona: M.PERSONAS[i] }));
    chat = s.chat || []; feedLog = s.feedLog || []; lastText = s.lastText || ""; recent = s.recent || []; lastCell = s.lastCell != null ? s.lastCell : -1;
    token++; selected = null; revealed = -1; paused = false; museWarned = false; lastBanter = state.moveNo;
    $("feed").innerHTML = ""; $("bubble").hidden = true;
    feedLog.forEach(([k, h]) => log(k, h, true));
    showTable();
    log("sys", "Welcome back. Game resumed.");
    step();
  }
  $("resumeBtn").addEventListener("click", resume);
  $("discardBtn").addEventListener("click", () => { try { localStorage.removeItem("seq.save"); } catch (e) { /* ignore */ } renderResume(); });

  // ---- Online rooms ----
  const toast = (msg) => {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
  };
  const myName = () => (store.get("seq.name", "") || "").slice(0, 16);
  const roomLink = (code) => location.origin + location.pathname + "?room=" + code;

  async function createRoom() {
    try {
      $("onlineBtn").disabled = true;
      openRoom(await O.newCode(), true);
    } catch (e) {
      toast(e.message || "Couldn't create a room. Try again.");
    } finally {
      $("onlineBtn").disabled = false;
    }
  }

  async function quickMatch() {
    try {
      $("quickBtn").disabled = true;
      const m = await O.quickMatch(mode);
      openRoom(m.code, true, { public: true, mode });
    } catch (e) {
      toast(e.message || "Couldn't find a match. Try again.");
    } finally {
      $("quickBtn").disabled = false;
    }
  }

  function openRoom(code, create, extra) {
    if (online) online.conn.close();
    token++; state = null;
    online = { code, you: -1, view: null, status: "connecting", gameNo: -1, logShown: 0, awaySeen: {}, winShown: -1, autoSit: !!(extra && extra.public) };
    history.replaceState(null, "", "?room=" + code);
    document.body.classList.add("in-lobby");
    document.body.classList.remove("playing");
    $("setup").hidden = true; $("table").hidden = true; $("lobby").hidden = false;
    $("roomCode").textContent = code;
    $("myName").value = myName();
    $("lobbySeats").innerHTML = "";
    $("lobbyStatus").textContent = "Connecting…";
    const text = `Join my Line Up 5 game! Room ${code}: ${roomLink(code)}`;
    $("shareWa").href = "https://wa.me/?text=" + encodeURIComponent(text);
    online.conn = O.connect(code, { create, hello: extra || null, onMessage, onStatus });
  }

  function leaveRoom() {
    if (online) online.conn.close();
    online = null; state = null; token++;
    history.replaceState(null, "", location.pathname);
    document.body.classList.remove("in-lobby", "playing");
    $("lobby").hidden = true; $("table").hidden = true; $("winSheet").hidden = true; $("setup").hidden = false;
    renderSeats(); renderResume(); renderRecord();
  }

  function onStatus(status) {
    if (!online) return;
    online.status = status;
    const el = $("netStatus");
    el.className = "net " + status;
    el.textContent = { connecting: "Connecting…", online: "● Connected", offline: "Reconnecting…" }[status];
    if (state) render();
  }

  function onMessage(m) {
    if (!online) return;
    if (m.t === "you") {
      online.you = m.seat;
      O.setToken(online.code, m.token);
      if (online.view) applyView(online.view);
    } else if (m.t === "error") {
      if (!online.view && /not found/i.test(m.msg)) {
        $("lobbyStatus").textContent = m.msg;
        $("lobbySeats").innerHTML = "";
        $("lobbyStart").hidden = true;
        return;
      }
      toast(m.msg);
    } else if (m.t === "room") {
      online.view = m;
      applyView(m);
    }
  }

  function applyView(v) {
    // quick match: take the first free seat straight away
    if (online.autoSit && v.you < 0 && v.phase === "lobby") {
      const free = v.seats.findIndex((s) => s.kind === "empty");
      if (free >= 0) {
        online.autoSit = false;
        const name = myName() || "Guest " + (100 + Math.floor(Math.random() * 900));
        store.set("seq.name", name);
        online.conn.send({ t: "sit", seat: free, name });
      }
    }
    v.seats.forEach((s, i) => {
      if (s.kind === "human" && !s.connected) { if (!online.awaySeen[i]) online.awaySeen[i] = Date.now(); }
      else delete online.awaySeen[i];
    });
    if (v.phase === "lobby" || !v.game) {
      document.body.classList.remove("playing");
      document.body.classList.add("in-lobby");
      $("table").hidden = true; $("lobby").hidden = false; $("winSheet").hidden = true;
      return renderLobby(v);
    }
    // game view: rebuild a client-side state from what the server lets this seat see
    const g = v.game, hands = v.seats.map(() => []);
    if (v.you >= 0) hands[v.you] = g.hand;
    const prevTurn = state ? state.turn : -1, prevMove = state ? state.moveNo : -1;
    state = { chips: g.chips, seqCells: g.seqCells, sequences: g.sequences, turn: g.turn, moveNo: g.moveNo, winner: g.winner, draw: g.draw, needed: g.needed, hands, deck: { length: g.deckCount }, seats: v.seats.length };
    players = v.seats.map((s, i) => ({ name: s.name || "Empty", mode: s.kind === "ai" ? "muse" : "human", persona: M.PERSONAS[i], away: s.kind === "human" && !s.connected }));
    if (g.moveNo !== prevMove && v.lastCell !== lastCell) flashCell = v.lastCell;
    lastCell = v.lastCell; recent = v.recent || [];
    online.turnEnds = v.turnEndsIn ? Date.now() + v.turnEndsIn : 0;
    tickClock();
    if (selected && (prevTurn !== g.turn || !g.hand.includes(selected))) selected = null;
    if (prevTurn !== -1 && prevTurn !== g.turn && g.turn === v.you && v.phase === "playing" && !(g.winner != null || g.draw)) setTimeout(() => { S.play("turn"); buzz(35); }, 350);
    if ($("table").hidden) { document.body.classList.remove("in-lobby"); $("lobby").hidden = true; showTable(); }
    syncFeed(v);
    render();
    if (v.phase === "over" && online.winShown !== v.gameNo) { online.winShown = v.gameNo; showOnlineWin(v); }
    if (v.phase === "playing") $("winSheet").hidden = true;
  }

  function syncFeed(v) {
    const first = online.gameNo !== v.gameNo;
    if (first) { online.gameNo = v.gameNo; online.logShown = 0; $("feed").innerHTML = ""; }
    let latestMove = null, sfx = "";
    const rank = { place: 1, remove: 2, sequence: 3 };
    const want = (n) => { if (!first && (!sfx || rank[n] > rank[sfx])) sfx = n; };
    for (const e of v.log) {
      if (e.id <= online.logShown) continue;
      online.logShown = e.id;
      if (e.k === "move") {
        const who = e.seat === online.you ? "You" : players[e.seat].name;
        const what = e.type === "remove"
          ? `${who} removed a ${TEAM[e.removedTeam]} chip at ${E.cellName(e.cell)} (${label(e.card)})`
          : `${who} played ${label(e.card)} on ${E.cellName(e.cell)}`;
        const tag = e.src ? `<span class="src">${e.src === "llm" ? "Gemini" : e.src === "timeout" ? "auto" : "brain"}</span>` : "";
        log("move", `<b>${esc(what)}</b>${e.note ? " · " + esc(e.note) : ""}${tag}`, true);
        latestMove = what + (e.note ? " · " + e.note : "");
        want(e.type === "remove" ? "remove" : "place");
      } else if (e.k === "react") {
        if (!first) { floatEmoji(e.seat, e.emoji); if (!sfx) S.play("chat"); }
      } else if (e.k === "say") {
        log("say", `<b>${esc(e.who)}:</b> ${esc(e.text)}`, true);
        if (!first) { showBubble(e.seat, e.who, e.text); if (!sfx) S.play("chat"); }
      } else {
        log(e.k, e.text, true);
        if (e.k === "big" && /made a (line|sequence)/.test(e.text)) want("sequence");
      }
    }
    if (sfx) S.play(sfx);
    if (latestMove) lastText = latestMove;
    if (v.lastText) lastText = v.lastText;
  }

  function showOnlineWin(v) {
    const t = state.winner, mine = v.you >= 0 ? teamOf(v.you) : -1;
    const iHost = v.host === v.you && v.you >= 0;
    $("winTitle").textContent = state.draw ? "It's a draw" : mine === t ? "You win! 🎉" : mine >= 0 ? `${TEAM[t]} wins this time` : `${TEAM[t]}${teamWord(v.seats.length)} wins!`;
    $("winText").textContent = state.draw ? "The deck ran dry with no winner." : `${teamNames(t)} made ${state.needed} line${state.needed > 1 ? "s" : ""} in ${state.moveNo} moves.`;
    document.querySelector(".trophy").textContent = mine >= 0 && mine !== t ? "🤝" : "🏆";
    $("againBtn").disabled = !iHost;
    S.play(mine >= 0 && mine !== t ? "lose" : "win");
    $("againBtn").textContent = iHost ? "Play again" : "Waiting for host…";
    $("winExtra").innerHTML = "";
    if (mine >= 0) {
      const result = state.draw ? "draw" : mine === t ? "win" : "loss";
      const rec = P.record({ result, mode: v.seats.length === 2 ? "1v1" : v.seats.length === 3 ? "3p" : "2v2", level: v.level, moves: state.moveNo, online: true });
      showWinExtras(rec, result, state.moveNo);
      if (result === "win") confetti();
    }
    $("winSheet").hidden = false;
  }

  function renderLobby(v) {
    const you = online.you, iHost = v.host === you && you >= 0;
    const filled = v.seats.filter((s) => s.kind !== "empty").length, total = v.seats.length;
    const ol = $("lobbySeats");
    ol.innerHTML = v.seats.map((s, i) => {
      const team = TEAM[E.teamOf(i, v.seats.length)] + teamWord(v.seats.length);
      let name, sub, actions = "";
      if (s.kind === "empty") {
        name = "Empty seat"; sub = team;
        if (you < 0) actions += `<button type="button" class="btn btn-blue btn-small" data-sit="${i}">Sit here</button>`;
        if (iHost) actions += `<button type="button" class="btn btn-line btn-small" data-ai="${i}">+ AI</button>`;
      } else if (s.kind === "ai") {
        name = s.name; sub = `${team} · AI player`;
        if (iHost) actions += `<button type="button" class="btn btn-line btn-small" data-noai="${i}">Remove</button>`;
      } else {
        name = esc(s.name) + (i === you ? " (you)" : "") + (i === v.host ? '<span class="tag-host">host</span>' : "");
        sub = `${team} · ${s.connected ? "online" : "away"}`;
        if (i === you) actions += `<button type="button" class="btn btn-line btn-small" data-stand="1">Leave seat</button>`;
      }
      const av = s.kind === "empty" ? `<span class="avatar" aria-hidden="true">${i + 1}</span>` : avatar({ name: s.name, mode: s.kind === "ai" ? "muse" : "human" }, i, v.seats.length);
      return `<li class="seat${s.kind === "empty" ? " empty" : ""}">${av}<div class="who"><b>${s.kind === "human" ? name : esc(name)}</b><span class="persona">${esc(sub)}</span></div><div class="seat-actions">${actions}</div></li>`;
    }).join("");
    document.querySelectorAll("#lobbyModes button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.v === (v.mode || "2v2")));
      b.disabled = !iHost;
    });
    document.querySelectorAll("#lobbyLevels button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.l === v.level));
      b.disabled = !iHost;
    });
    const start = $("lobbyStart");
    start.hidden = !iHost;
    start.disabled = filled < total && !v.public;
    start.textContent = v.public ? "▶ Start now" : "▶ Start game";
    $("lobbyTitle").textContent = v.public ? "⚡ Quick match" : "Online room";
    clearInterval(online.countdown);
    if (v.public) {
      const ends = Date.now() + (v.startsIn || 0);
      const tick = () => {
        const secs = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
        $("lobbyStatus").textContent = !v.startsIn ? "Finding players…"
          : secs > 0 ? `Finding players… starting in ${secs}s. Empty seats get AI players.` : "Starting…";
      };
      tick();
      online.countdown = setInterval(tick, 1000);
      return;
    }
    $("lobbyStatus").textContent =
      you < 0 ? (total === 2 ? "Type your name and pick a seat. Blue plays Green, 1 vs 1." : total === 3 ? "Type your name and pick a seat. Three players, everyone for themselves." : "Type your name and pick a seat. Blue (seats 1, 3) plays Green (seats 2, 4).")
      : iHost ? (filled < total ? "Invite friends with the link, or tap + AI to fill empty seats. Then start." : "Everyone's seated. Start when ready!")
      : "Waiting for the host to start the game…";
  }

  $("lobbySeats").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !online) return;
    if (b.dataset.sit) {
      const name = $("myName").value.trim();
      if (!name) { $("myName").focus(); return toast("Type your name first."); }
      store.set("seq.name", name);
      online.conn.send({ t: "sit", seat: Number(b.dataset.sit), name });
    } else if (b.dataset.ai) online.conn.send({ t: "ai", seat: Number(b.dataset.ai), on: true });
    else if (b.dataset.noai) online.conn.send({ t: "ai", seat: Number(b.dataset.noai), on: false });
    else if (b.dataset.stand) online.conn.send({ t: "stand" });
  });
  $("myName").addEventListener("change", () => {
    const name = $("myName").value.trim();
    if (!name) return;
    store.set("seq.name", name);
    if (online && online.you >= 0) online.conn.send({ t: "name", name });
  });
  document.querySelectorAll("#lobbyModes button").forEach((b) => b.addEventListener("click", () => online && online.conn.send({ t: "mode", mode: b.dataset.v })));
  document.querySelectorAll("#lobbyLevels button").forEach((b) => b.addEventListener("click", () => online && online.conn.send({ t: "level", level: b.dataset.l })));
  $("lobbyStart").addEventListener("click", () => online && online.conn.send({ t: "start" }));
  $("lobbyExit").addEventListener("click", leaveRoom);
  $("copyLink").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(roomLink(online.code)); toast("Link copied. Paste it to your friends."); }
    catch (e) { toast(roomLink(online.code)); }
  });
  $("players").addEventListener("click", (e) => {
    const b = e.target.closest("[data-take]");
    if (b && online) online.conn.send({ t: "ai", seat: Number(b.dataset.take), on: true });
  });
  // the "AI plays" button appears a minute after someone drops, so re-check now and then
  setInterval(() => { if (online && state && Object.keys(online.awaySeen).length) render(); }, 5000);

  $("onlineBtn").addEventListener("click", createRoom);
  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = $("joinCode").value.trim().toUpperCase();
    if (!O.validCode(code)) return toast("Room codes are 5 letters, like QWERT.");
    openRoom(code, false);
  });

  // ---- Online turn clock (60 s, then the AI plays one move for that player) ----
  function tickClock() {
    const el = $("turnClock");
    if (!online || !online.turnEnds || !state || over()) { el.hidden = true; return; }
    const secs = Math.max(0, Math.ceil((online.turnEnds - Date.now()) / 1000));
    el.hidden = false;
    el.textContent = secs + "s";
    el.classList.toggle("low", secs <= 10);
    if (secs === 10 && myTurn() && online.warned !== online.turnEnds) { online.warned = online.turnEnds; S.play("turn"); buzz([20, 60, 20]); }
  }
  setInterval(tickClock, 1000);

  // ---- Reactions (online) ----
  function floatEmoji(seat, emoji) {
    const li = $("players").children[seat];
    if (!li) return;
    const r = li.getBoundingClientRect(), el = document.createElement("span");
    el.className = "float-emoji";
    el.textContent = emoji;
    el.style.left = r.left + r.width / 2 + "px";
    el.style.top = r.top + window.scrollY + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
  $("reactions").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-emoji]");
    if (b && online) online.conn.send({ t: "react", emoji: b.dataset.emoji });
  });

  // ---- Daily leaderboard (server replays the moves before recording anything) ----
  function boardHtml(data, mineRank) {
    if (!data || !data.top || !data.top.length) return "<p class=\"lb-empty\">No results yet today. Be the first!</p>";
    return `<ol class="lb">${data.top.map((r, i) => `<li class="${i + 1 === mineRank ? "me" : ""}"><span>${i + 1}</span><b>${esc(r.name)}</b><em>${r.result === "win" ? "won in " + r.moves : r.result === "draw" ? "draw" : "lost"}</em></li>`).join("")}</ol>` +
      `<p class="lb-note">${data.total} player${data.total === 1 ? "" : "s"} today${mineRank ? ` · you're #${mineRank}` : ""}</p>`;
  }
  async function showDailyBoard(result) {
    if (!O || !O.serverUrl()) return;
    const box = document.createElement("div");
    box.className = "lb-box";
    box.innerHTML = `<h3>Today's leaderboard</h3><div class="lb-body">Loading…</div>`;
    $("winExtra").prepend(box);
    const body = box.querySelector(".lb-body");
    const posted = store.get("seq.dailyPosted", "") === gameDaily;
    if (!dailyPractice && !posted) {
      // posting needs the player's OK and a name, so it's a button, not automatic
      const form = document.createElement("form");
      form.className = "lb-form";
      form.innerHTML = `<input maxlength="16" placeholder="Your name" aria-label="Name for the leaderboard"><button class="btn btn-blue btn-small" type="submit">Post my result</button>`;
      form.querySelector("input").value = myName() && !/^you$/i.test(myName()) ? myName() : "";
      box.insertBefore(form, body);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = form.querySelector("input").value.trim();
        if (!name) return form.querySelector("input").focus();
        store.set("seq.name", name);
        form.querySelector("button").disabled = true;
        try {
          const data = await O.dailyBoard(gameDaily, { player: P.playerId(), name, moves: dailyMoves });
          store.set("seq.dailyPosted", gameDaily);
          form.remove();
          body.innerHTML = boardHtml(data, data.rank);
        } catch (err) {
          form.querySelector("button").disabled = false;
          toast(err.message);
        }
      });
    }
    try { body.innerHTML = boardHtml(await O.dailyBoard(gameDaily)); } catch (e) { body.textContent = "Leaderboard unavailable right now."; }
  }
  async function renderDailyBest() {
    if (!O || !O.serverUrl()) return;
    try {
      const data = await O.dailyBoard(P.today());
      const best = data && data.top && data.top.find((r) => r.result === "win");
      $("dailyBest").textContent = best ? `Today's best: ${best.name}, won in ${best.moves} moves · ${data.total} playing` : data && data.total ? `${data.total} playing today` : "";
    } catch (e) { /* offline */ }
  }

  // ---- Keyboard play: 1-7 pick a card, arrow keys move around the board, Enter plays ----
  document.addEventListener("keydown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!state || $("table").hidden || (t && t.closest("input, textarea, select")) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-7]$/.test(e.key) && myTurn()) {
      const b = $("hand").querySelectorAll(".card")[Number(e.key) - 1];
      if (b) { b.click(); const first = $("board").querySelector(".cell.legal"); if (first && selected) first.focus(); e.preventDefault(); }
      return;
    }
    const cell = t && t.closest("#board .cell");
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -10, ArrowDown: 10 }[e.key];
    if (cell && step) {
      const i = Number(cell.dataset.i), j = i + step;
      if (j < 0 || j > 99 || (Math.abs(step) === 1 && Math.floor(j / 10) !== Math.floor(i / 10))) return;
      cellEls[j].focus();
      e.preventDefault();
    }
  });

  // ---- Progress: record card, badges, sharing, confetti, vibration ----
  const gameUrl = () => location.origin + location.pathname;
  function renderRecord() {
    const st = P.load(), day = P.today(), done = st.daily[day];
    $("dailyBtn").innerHTML = `📅 Daily challenge #${P.dailyNo(day)}` +
      (done ? ` <span class="done">${done.result === "win" ? "✓ won in " + done.moves + " moves" : "· played"}</span>` : " <span>· new today</span>");
    const badges = P.BADGES.map((b) => `<span class="badge${st.badges[b.id] ? "" : " locked"}" title="${esc(b.hint)}">${b.icon} ${esc(b.name)}</span>`).join("");
    const rate = st.games ? Math.round(100 * st.wins / st.games) : 0;
    $("record").innerHTML = st.games
      ? `<div class="record-head"><b>Your record</b><span>${st.fastest ? "Fastest win: " + st.fastest + " moves" : "Keep playing to set a fastest win"}</span></div>` +
        `<div class="record-nums"><div><b>${st.games}</b><small>played</small></div><div><b>${st.wins}</b><small>won</small></div><div><b>${rate}%</b><small>win rate</small></div><div><b>${st.streak}</b><small>streak${st.bestStreak > 1 ? " (best " + st.bestStreak + ")" : ""}</small></div></div>` +
        `<div class="badges" aria-label="Badges">${badges}</div>`
      : `<div class="record-head"><b>Your record</b><span>Win games to collect badges</span></div><div class="badges" aria-label="Badges">${badges}</div>`;
  }
  function showWinExtras(rec, result, moves) {
    const bits = [];
    if (rec.fastest) bits.push(`<p class="note">New fastest win: ${moves} moves!</p>`);
    if (rec.newBadges.length) bits.push(`<div class="badges">${rec.newBadges.map((b) => `<span class="badge newbadge">${b.icon} ${esc(b.name)}</span>`).join("")}</div>`);
    if (rec.stats.streak > 1 && result === "win") bits.push(`<p class="note">🔥 ${rec.stats.streak} wins in a row</p>`);
    let text = "";
    if (gameDaily && !online) {
      text = `Line Up 5 Daily #${P.dailyNo(gameDaily)}: ${result === "win" ? "🏆 I beat the Hard AI" : result === "draw" ? "🤝 a draw with the Hard AI" : "😅 the Hard AI got me"} in ${moves} moves. Same deal for everyone today. Your turn: ${gameUrl()}?daily`;
    } else if (result === "win") {
      text = `🏆 I won a game of Line Up 5 ${online ? "online" : "against the " + gameLevel + " AI"} in ${moves} moves! Play free: ${gameUrl()}`;
    }
    if (text) bits.push(`<div class="share-row"><a class="btn btn-green" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Share on WhatsApp</a></div>`);
    $("winExtra").innerHTML = bits.join("");
  }
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div");
    box.className = "confetti";
    const colors = ["#ffc72c", "#0b3d91", "#18a34a", "#e8463c", "#ffffff"];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      p.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
      p.style.animationDelay = Math.random() * 0.4 + "s";
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4200);
  }
  function buzz(pattern) { if (S.enabled() && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ } } }

  $("tutBtn").addEventListener("click", () => { store.set("seq.tutorial", true); $("tutorial").hidden = true; });
  $("dailyBtn").addEventListener("click", () => start(false, true));
  $("quickBtn").addEventListener("click", quickMatch);

  function renderSound() {
    const on = S.enabled();
    $("soundBtn").textContent = on ? "🔊" : "🔇";
    $("soundBtn").setAttribute("aria-label", on ? "Sound on. Tap to mute." : "Sound off. Tap to turn on.");
    $("soundBtn").setAttribute("aria-pressed", String(on));
  }
  $("soundBtn").addEventListener("click", () => { S.toggle(); renderSound(); });

  function setPause(v) {
    paused = v;
    $("pauseBtn").innerHTML = paused ? "▶ <span>Resume</span>" : "❚❚ <span>Pause</span>";
    render();
  }

  // ---- Controls ----
  $("startBtn").addEventListener("click", () => start(false));
  $("watchBtn").addEventListener("click", () => start(true));
  $("newBtn").addEventListener("click", exit);
  $("againBtn").addEventListener("click", () => {
    if (online) { online.conn.send({ t: "start" }); $("winSheet").hidden = true; return; }
    start(lastAllAi, false);
  });
  $("closeWin").addEventListener("click", () => { $("winSheet").hidden = true; });
  $("pauseBtn").addEventListener("click", () => setPause(!paused));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("winSheet").hidden) $("winSheet").hidden = true;
    else if (e.key === "Escape" && selected) { selected = null; render(); }
  });

  renderMode();
  renderSeats();
  renderLevel();
  renderMuseStatus();
  renderResume();
  renderSound();
  renderRecord();
  renderDailyBest();

  // ---- Install as an app (PWA) and offline play ----
  if ("serviceWorker" in navigator && (location.protocol === "https:" || O.isDev())) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
  }
  let installEvent = null;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    if (!standalone) { $("installRow").hidden = false; $("installHint").textContent = " Plays offline against the AI."; }
  });
  $("installBtn").addEventListener("click", async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    $("installRow").hidden = true;
  });
  // iPhone and iPad have no install button, only "Add to Home Screen" in the Share menu
  if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    $("installRow").hidden = false; $("installBtn").hidden = true;
    $("installHint").textContent = "📲 Play it like an app: tap Share, then “Add to Home Screen”.";
  }
  if (O && O.available()) { $("onlineBtn").hidden = false; $("quickBtn").hidden = false; $("joinForm").hidden = false; }
  const roomParam = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
  if (O && O.available() && O.validCode(roomParam)) openRoom(roomParam, false);
  else if (new URLSearchParams(location.search).has("daily")) { history.replaceState(null, "", location.pathname); start(false, true); }
})();
