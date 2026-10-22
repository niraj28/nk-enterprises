/* Online rooms, browser side: talks to the room server (Cloudflare Worker + Durable Object).
   On localhost without a server, a dev hub runs the room in the creating tab and other tabs
   join through BroadcastChannel, so rooms can be tested without deploying anything. */
(function (root) {
  "use strict";

  // The room server is the same Worker as the Muse proxy. Leave empty to reuse the Muse URL.
  const ROOM_SERVER = "https://sequence-game.sqnce.workers.dev";

  const isDev = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function serverUrl() {
    let u = "";
    try { u = localStorage.getItem("seq.roomServer") || ""; } catch (e) { /* private mode */ }
    return (u || ROOM_SERVER || (root.SeqMuse ? root.SeqMuse.proxyUrl() : "") || "").replace(/\/$/, "");
  }
  const available = () => !!serverUrl() || isDev();

  const tokenKey = (code) => "seq.room." + code;
  function getToken(code) { try { return localStorage.getItem(tokenKey(code)) || ""; } catch (e) { return ""; } }
  function setToken(code, token) { try { token ? localStorage.setItem(tokenKey(code), token) : localStorage.removeItem(tokenKey(code)); } catch (e) { /* ignore */ } }

  const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const validCode = (c) => /^[A-HJ-NP-Z]{5}$/.test(c);
  async function newCode() {
    const s = serverUrl();
    if (s) {
      const r = await fetch(s + "/room/new", { method: "POST" });
      if (!r.ok) throw new Error("Couldn't create a room right now (" + r.status + ").");
      return (await r.json()).code;
    }
    let c = "";
    for (let i = 0; i < 5; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
    return c;
  }

  // opts: { create, onMessage(msg), onStatus("connecting" | "online" | "offline") }
  function connect(code, opts) {
    return serverUrl() ? wsTransport(code, opts) : devTransport(code, opts);
  }

  function wsTransport(code, opts) {
    let ws = null, closed = false, tries = 0, create = !!opts.create;
    const t = {
      send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
      close() { closed = true; if (ws) ws.close(); }
    };
    function open() {
      opts.onStatus("connecting");
      ws = new WebSocket(serverUrl().replace(/^http/, "ws") + "/room/" + code + "/ws");
      ws.onopen = () => {
        tries = 0;
        opts.onStatus("online");
        ws.send(JSON.stringify({ t: "hello", code, create, token: getToken(code) }));
        create = false;
      };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } opts.onMessage(m); };
      ws.onclose = () => {
        if (closed) return;
        opts.onStatus("offline");
        setTimeout(() => !closed && open(), Math.min(8000, 500 * 2 ** tries++));
      };
    }
    open();
    // phones pause tabs; reconnect straight away when the page is visible again
    document.addEventListener("visibilitychange", () => {
      if (!closed && document.visibilityState === "visible" && ws && ws.readyState > 1) { tries = 0; open(); }
    });
    return t;
  }

  // ---- localhost only: the creating tab hosts the room ----
  function devTransport(code, opts) {
    const ch = new BroadcastChannel("seq-dev-" + code);
    const id = Math.random().toString(36).slice(2);
    const hub = opts.create ? makeHub(ch) : null;
    const deliver = (m) => opts.onMessage(m);
    const t = {
      send(m) {
        if (hub) hub.receive(id, m, deliver);
        else ch.postMessage({ up: true, from: id, msg: m });
      },
      close() {
        if (!hub) ch.postMessage({ up: true, from: id, msg: { t: "bye" } });
        ch.close();
      }
    };
    if (hub) ch.onmessage = (e) => { if (e.data && e.data.up) hub.receive(e.data.from, e.data.msg, null); };
    else {
      ch.onmessage = (e) => { if (e.data && e.data.down && e.data.to === id) deliver(e.data.msg); };
      // heartbeat, so the hub notices a tab that closed without saying goodbye
      setInterval(() => { try { ch.postMessage({ up: true, from: id, msg: { t: "ping" } }); } catch (x) { /* closed */ } }, 2000);
    }
    window.addEventListener("pagehide", () => t.close());
    opts.onStatus("online");
    setTimeout(() => t.send({ t: "hello", code, create: !!opts.create, token: getToken(code) }), 0);
    return t;
  }

  function makeHub(ch) {
    const core = new root.SeqRoom.RoomCore();
    const conns = new Map(); // id -> { seat, deliver, seen }
    let running = false;
    setInterval(() => {
      for (const [id, c] of conns) if (!c.deliver && Date.now() - c.seen > 6000) api.receive(id, { t: "bye" }, null);
    }, 2000);
    const sendTo = (id, m) => {
      const c = conns.get(id);
      if (!c) return;
      if (c.deliver) c.deliver(m); else ch.postMessage({ down: true, to: id, msg: m });
    };
    const broadcast = () => { for (const [id, c] of conns) sendTo(id, core.view(c.seat)); };
    async function runAI() {
      if (running) return;
      running = true;
      while (core.aiPending()) {
        await new Promise((r) => setTimeout(r, 900));
        core.aiMove(Math.random);
        broadcast();
      }
      running = false;
    }
    const api = {
      receive(id, msg, deliver) {
        if (!conns.has(id)) { if (msg.t === "ping" || msg.t === "bye") return; conns.set(id, { seat: -1, deliver }); }
        const c = conns.get(id);
        c.seen = Date.now();
        if (msg.t === "ping") return;
        if (msg.t === "bye") {
          conns.delete(id);
          if (c.seat >= 0 && ![...conns.values()].some((x) => x.seat === c.seat)) {
            core.handle({ seat: c.seat }, { t: "gone" }, Date.now(), Math.random);
            broadcast();
          }
          return;
        }
        if (msg.t === "gone") return;
        const conn = { seat: c.seat };
        const out = core.handle(conn, msg, Date.now(), Math.random);
        c.seat = conn.seat;
        if (out.reply) sendTo(id, out.reply);
        if (out.changed) broadcast();
        runAI();
      }
    };
    return api;
  }

  root.SeqOnline = { available, isDev, serverUrl, newCode, connect, getToken, setToken, validCode };
})(window);
