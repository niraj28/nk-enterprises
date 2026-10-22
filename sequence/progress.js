/* Player progress kept on this device: results, streaks, badges and the daily challenge.
   Nothing here leaves the browser. */
(function (root) {
  "use strict";
  const KEY = "seq.stats";
  const LAUNCH = Date.UTC(2026, 9, 23); // Daily challenge #1

  const BADGES = [
    { id: "first", icon: "🥉", name: "First win", hint: "Win any game" },
    { id: "duo", icon: "🎯", name: "Duel winner", hint: "Win a 1 vs 1 game" },
    { id: "team", icon: "🤝", name: "Team player", hint: "Win a 2 vs 2 game" },
    { id: "hard", icon: "🧠", name: "Beat Hard", hint: "Beat the Hard AI" },
    { id: "quick", icon: "⚡", name: "Lightning", hint: "Win in under 35 moves" },
    { id: "streak3", icon: "🔥", name: "On fire", hint: "Win 3 games in a row" },
    { id: "daily", icon: "📅", name: "Daily winner", hint: "Win a daily challenge" },
    { id: "online", icon: "🌐", name: "Online winner", hint: "Win an online game" },
    { id: "ten", icon: "🏆", name: "Ten wins", hint: "Win 10 games" }
  ];

  const blank = () => ({ games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, fastest: 0, badges: {}, daily: {}, byLevel: {} });
  function load() {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return blank(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }

  // local calendar day, so "today" matches the player's clock
  function today(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dailyNo(day) {
    const [y, m, dd] = day.split("-").map(Number);
    return Math.floor((Date.UTC(y, m - 1, dd) - LAUNCH) / 86400000) + 1;
  }
  function dailySeed(day) {
    let h = 2166136261;
    for (const ch of "sequence-daily-" + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // game: { result: "win" | "loss" | "draw", mode: "1v1" | "2v2", level, moves, online, daily }
  function record(game) {
    const s = load(), before = Object.assign({}, s.badges);
    s.games++;
    const lv = (s.byLevel[game.level] = s.byLevel[game.level] || { games: 0, wins: 0 });
    lv.games++;
    let fastest = false;
    if (game.result === "win") {
      s.wins++; lv.wins++;
      s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
      if (!s.fastest || game.moves < s.fastest) { fastest = s.wins > 1; s.fastest = game.moves; }
      const earn = (id) => { if (!s.badges[id]) s.badges[id] = today(); };
      earn("first");
      earn(game.mode === "1v1" ? "duo" : "team");
      if (game.level === "hard") earn("hard");
      if (game.moves < 35) earn("quick");
      if (s.streak >= 3) earn("streak3");
      if (game.daily) earn("daily");
      if (game.online) earn("online");
      if (s.wins >= 10) earn("ten");
    } else if (game.result === "loss") { s.losses++; s.streak = 0; }
    else s.draws++;
    if (game.daily && !s.daily[game.daily]) s.daily[game.daily] = { result: game.result, moves: game.moves };
    save(s);
    const newBadges = BADGES.filter((b) => s.badges[b.id] && !before[b.id]);
    return { stats: s, newBadges, fastest };
  }

  root.SeqProgress = { BADGES, load, record, today, dailyNo, dailySeed };
})(window);
