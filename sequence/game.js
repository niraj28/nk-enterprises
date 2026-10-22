/* Sequence table UI: seats, board, hands, turn loop and table talk. */
(function () {
  "use strict";
  const E = window.SeqEngine, B = window.SeqBrain, M = window.SeqMuse, L = window.SeqLines;
  const $ = (id) => document.getElementById(id);
  const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const TEAM = ["Blue", "Green"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  const label = (c) => (c[0] === "T" ? "10" : c[0]) + SUIT[c[1]];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const avatar = (p, i) => `<span class="avatar t${E.teamOf(i)}${p.mode === "muse" ? " ai" : ""}" aria-hidden="true">${esc((p.name || "?").trim()[0] || "?").toUpperCase()}</span>`;

  // ---- Seats ----
  let seats = store.get("seq.seats", null);
  if (!Array.isArray(seats) || seats.length !== 4) {
    seats = M.PERSONAS.map((p, i) => ({ name: i === 0 ? "You" : p.name, mode: i === 0 ? "human" : "muse" }));
  }

  function renderSeats() {
    $("seats").innerHTML = "";
    seats.forEach((s, i) => {
      const p = M.PERSONAS[i], el = document.createElement("li");
      el.className = "seat";
      el.innerHTML =
        avatar(s, i) +
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
      el.querySelector(".persona").textContent = `${TEAM[E.teamOf(i)]} team · ` +
        (s.mode === "muse" ? p.voice.replace(/^an? /, "") : "plays on this device");
      $("seats").appendChild(el);
    });
    const h = seats.filter((s) => s.mode === "human").length;
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
    el.textContent = url ? "Muse AI is connected." : "AI seats use the built-in brain until Muse is connected.";
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
  const humans = () => players.filter((p) => p.mode === "human").length;
  const over = () => state.winner != null || state.draw;

  function start(allAi) {
    lastAllAi = allAi;
    const cfg = allAi ? M.PERSONAS.map((p) => ({ name: p.name, mode: "muse" })) : seats;
    if (!allAi) store.set("seq.seats", seats);
    players = cfg.map((s, i) => ({ name: s.name || M.PERSONAS[i].name, mode: s.mode, persona: M.PERSONAS[i] }));
    state = E.newGame({ seats: 4 });
    gameLevel = level;
    token++; selected = null; revealed = -1; lastCell = -1; recent = []; paused = false; chat = []; museWarned = false; lastText = "";
    feedLog = []; lastBanter = -9;
    $("feed").innerHTML = ""; $("bubble").hidden = true;
    showTable();
    log("sys", `${teamNames(0)} (Blue) vs ${teamNames(1)} (Green). AI level: ${gameLevel}. First to 2 sequences wins.`);
    const ais = players.map((p, i) => i).filter((i) => players[i].mode === "muse");
    if (ais.length) { const my = token, sp = ais[Math.floor(Math.random() * ais.length)]; setTimeout(() => my === token && banter(sp, "start"), 500); }
    step();
  }

  function showTable() {
    document.body.classList.add("playing");
    $("setup").hidden = true; $("table").hidden = false; $("winSheet").hidden = true;
    $("chatForm").hidden = humans() === 0;
    $("pauseBtn").hidden = humans() > 0;
    setPause(false);
    window.scrollTo(0, 0);
  }
  const teamNames = (t) => players.filter((p, i) => E.teamOf(i) === t).map((p) => p.name).join(" & ");

  function exit() {
    if (state && !over() && humans() > 0 && state.moveNo > 0 && !confirm("Leave this game?")) return;
    token++; state = null;
    try { localStorage.removeItem("seq.save"); } catch (e) { /* ignore */ }
    document.body.classList.remove("playing");
    $("table").hidden = true; $("setup").hidden = false; $("cover").hidden = true; $("winSheet").hidden = true;
    renderSeats();
    renderResume();
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
    const out = await M.choose(state, seat, p.persona, players, chat, gameLevel);
    const wait = Math.max(0, Number($("speed").value) - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    while (paused && my === token) await new Promise((r) => setTimeout(r, 200));
    if (my !== token) return;
    if (out.error && !museWarned) { museWarned = true; log("sys", `Muse didn't answer (${out.error}), so the built-in brain is filling in.`); }
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
    lastCell = m.cell; flashCell = m.type === "place" ? m.cell : -1;
    recent = [m.cell, ...recent.filter((c) => c !== m.cell)].slice(0, 3);
    const d = describe(p, m, res, pick, p.mode === "human" && humans() === 1);
    lastText = d.what + (d.note ? " · " + d.note : "");
    log("move", `<b>${esc(d.what)}</b>${d.note ? " · " + esc(d.note) : ""}` + (source ? `<span class="src">${source === "muse" ? "Muse" : "brain"}</span>` : ""));
    if (res.made) {
      const msg = `🎉 ${TEAM[res.team]} made a sequence! (${state.sequences[res.team].length}/2)`;
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
    const rivals = players.map((p, i) => i).filter((i) => E.teamOf(i) !== E.teamOf(seat));
    const mate = players.find((p, i) => i !== seat && E.teamOf(i) === E.teamOf(seat));
    const opp = target != null && E.teamOf(target) !== E.teamOf(seat) ? target : rivals[Math.floor(Math.random() * rivals.length)];
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
    const rivals = players.map((p, i) => i).filter((i) => E.teamOf(i) !== E.teamOf(mover) && players[i].mode === "muse");
    if (!rivals.length) return;
    const my = token, who = rivals[Math.floor(Math.random() * rivals.length)];
    setTimeout(() => my === token && !over() && banter(who, ev, mover), 700);
  }

  function finish() {
    render();
    const t = state.winner, h = players.map((p, i) => (p.mode === "human" ? i : -1)).filter((i) => i >= 0);
    const youWon = h.length === 1 && E.teamOf(h[0]) === t;
    const youLost = h.length === 1 && t != null && !youWon;
    $("winTitle").textContent = state.draw ? "It's a draw" : youWon ? "You win! 🎉" : youLost ? `${TEAM[t]} wins this time` : `${TEAM[t]} team wins!`;
    $("winText").textContent = state.draw ? "The deck ran dry with no winner." : `${teamNames(t)} made 2 sequences in ${state.moveNo} moves.`;
    document.querySelector(".trophy").textContent = youLost ? "🤝" : "🏆";
    log("big", $("winTitle").textContent);
    try { localStorage.removeItem("seq.save"); } catch (e) { /* ignore */ }
    if (t != null) {
      const winAi = players.map((p, i) => i).filter((i) => E.teamOf(i) === t && players[i].mode === "muse");
      const loseAi = players.map((p, i) => i).filter((i) => E.teamOf(i) !== t && players[i].mode === "muse");
      if (winAi.length) banter(winAi[0], "win");
      if (loseAi.length) setTimeout(() => state && banter(loseAi[0], "lose"), 900);
    }
    $("winSheet").hidden = false;
    $("againBtn").focus();
  }

  // ---- Human input ----
  function viewerSeat() {
    const h = players.map((p, i) => (p.mode === "human" ? i : -1)).filter((i) => i >= 0);
    if (h.length === 1) return h[0];
    if (h.length === 0) return state.turn; // spectating: follow the agent whose turn it is
    return players[state.turn].mode === "human" && revealed === state.turn ? state.turn : -1;
  }
  const myTurn = () => !over() && players[state.turn].mode === "human" && viewerSeat() === state.turn;

  function showCover(seat) {
    const p = players[seat];
    $("coverAvatar").className = "avatar big t" + E.teamOf(seat);
    $("coverAvatar").textContent = p.name[0].toUpperCase();
    $("coverTitle").textContent = `${p.name}'s turn`;
    $("coverText").textContent = `Pass the phone to ${p.name} (${TEAM[E.teamOf(seat)]} team). Everyone else, no peeking!`;
    $("cover").hidden = false;
    $("coverBtn").focus();
  }
  $("coverBtn").addEventListener("click", () => { revealed = state.turn; $("cover").hidden = true; render(); });

  $("hand").addEventListener("click", (e) => {
    const b = e.target.closest(".card");
    if (!b || !myTurn()) return;
    selected = selected === b.dataset.card ? null : b.dataset.card;
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
    const pick = B.scoreMove(state, seat, move);
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
    $("scoreBlue").textContent = state.sequences[0].length;
    $("scoreGreen").textContent = state.sequences[1].length;

    // banner: what to do now, plus what just happened
    const p = players[seat];
    let main;
    if (over()) main = "Game over";
    else if (mine) {
      if (!selected) main = humans() > 1 ? `${p.name}, pick a card` : "Your turn: pick a card";
      else if (E.TWO_EYED.has(selected)) main = "Wild jack: tap any open space";
      else if (E.ONE_EYED.has(selected)) main = legalSet.size ? "Tap an opponent chip to remove it" : "No chip to remove: pick another card";
      else main = `Tap a glowing space for ${label(selected)}`;
    } else if (p.mode === "human") main = `${p.name}'s turn`;
    else main = paused ? "Paused" : `${p.name} is thinking…`;
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
    const me = humans() === 1 ? viewerSeat() : -1;
    $("players").innerHTML = players.map((pl, i) => {
      const now = i === seat && !over();
      const status = now ? (pl.mode === "muse" ? '<small class="dots">thinking</small>' : "<small>to play</small>")
        : `<small>${me < 0 ? TEAM[E.teamOf(i)] : i === me ? "you" : E.teamOf(i) === E.teamOf(me) ? "partner" : "rival"}</small>`;
      return `<li class="${now ? "now" : ""}">${avatar(pl, i)}<span class="meta"><b>${esc(pl.name)}</b>${status}</span></li>`;
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
    // speech bubble under the speaker's seat
    const bubble = $("bubble");
    bubble.innerHTML = `<b>${esc(who)}:</b> ${esc(text)}`;
    bubble.style.setProperty("--x", `${12.5 + seat * 25}%`);
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
      v: 1, state, level: gameLevel, lastAllAi, chat, feedLog, lastText, recent, lastCell,
      players: players.map((p) => ({ name: p.name, mode: p.mode }))
    });
  }
  function loadSave() {
    const s = store.get("seq.save", null);
    return s && s.v === 1 && s.state && Array.isArray(s.players) && s.players.length === 4 && s.state.winner == null && !s.state.draw ? s : null;
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

  function setPause(v) {
    paused = v;
    $("pauseBtn").innerHTML = paused ? "▶ <span>Resume</span>" : "❚❚ <span>Pause</span>";
    render();
  }

  // ---- Controls ----
  $("startBtn").addEventListener("click", () => start(false));
  $("watchBtn").addEventListener("click", () => start(true));
  $("newBtn").addEventListener("click", exit);
  $("againBtn").addEventListener("click", () => start(lastAllAi));
  $("closeWin").addEventListener("click", () => { $("winSheet").hidden = true; });
  $("pauseBtn").addEventListener("click", () => setPause(!paused));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("winSheet").hidden) $("winSheet").hidden = true;
    else if (e.key === "Escape" && selected) { selected = null; render(); }
  });

  renderSeats();
  renderLevel();
  renderMuseStatus();
  renderResume();
})();
