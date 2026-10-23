// Progress (stats, badges, daily challenge) checks. Run with macOS JavaScriptCore:
// jsc tests/check_progress.js   (loads the game files itself)
const mem = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
load("lineup5/engine.js"); load("lineup5/brain.js"); load("lineup5/daily.js"); load("lineup5/progress.js");
const P = globalThis.SeqProgress, out = typeof print === "function" ? print : console.log;
function assert(ok, msg) { if (!ok) throw new Error("FAIL: " + msg); }

assert(P.dailyNo("2026-10-23") === 1 && P.dailyNo("2026-11-01") === 10, "daily numbering");
assert(P.dailySeed("2026-10-23") === P.dailySeed("2026-10-23") && P.dailySeed("2026-10-23") !== P.dailySeed("2026-10-24"), "same seed per day, new seed each day");

let r = P.record({ result: "loss", mode: "2v2", level: "normal", moves: 50 });
assert(r.stats.games === 1 && r.stats.streak === 0 && !r.newBadges.length, "a loss earns nothing");
r = P.record({ result: "win", mode: "1v1", level: "easy", moves: 40 });
assert(r.newBadges.map((b) => b.id).join() === "first,duo" && !r.fastest, "first win badges: " + r.newBadges.map((b) => b.id));
r = P.record({ result: "win", mode: "2v2", level: "hard", moves: 33, daily: "2026-10-23" });
assert(r.fastest && r.stats.fastest === 33, "new fastest win");
assert(["team", "hard", "quick", "daily"].every((id) => r.newBadges.some((b) => b.id === id)), "hard, quick, daily badges");
r = P.record({ result: "win", mode: "2v2", level: "normal", moves: 45, online: true });
assert(r.stats.streak === 3 && r.newBadges.some((b) => b.id === "streak3") && r.newBadges.some((b) => b.id === "online"), "streak and online badges");
assert(!r.newBadges.some((b) => b.id === "first"), "badges are only new once");
r = P.record({ result: "win", mode: "1v1", level: "hard", moves: 30, daily: "2026-10-23" });
assert(r.stats.daily["2026-10-23"].moves === 33, "the first daily result is kept");
for (let i = 0; i < 6; i++) r = P.record({ result: "win", mode: "1v1", level: "easy", moves: 60 });
assert(r.stats.wins === 10 && r.stats.badges.ten, "ten wins");
r = P.record({ result: "loss", mode: "1v1", level: "easy", moves: 60 });
assert(r.stats.streak === 0 && r.stats.bestStreak === 10, "streak resets, best kept");
out(`PASS: progress (daily numbering and seeds, ${P.BADGES.length} badges, streaks, fastest win, first daily result kept).`);
