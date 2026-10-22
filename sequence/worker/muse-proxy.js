// Cloudflare Worker: the only place the Meta Model API key lives.
// The game page POSTs {system, user}; this Worker adds the key, calls Muse, and returns {text}.
const MAX_CHARS = 8000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://digitallifenotes.blog,https://www.digitallifenotes.blog").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ error: "POST only" }, 405);
    if (!allowed.includes(origin)) return reply({ error: "origin not allowed" }, 403);

    // Optional: bind a Cloudflare rate limiter named RATE_LIMITER in wrangler.toml
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return reply({ error: "slow down" }, 429);
    }

    let body;
    try { body = await request.json(); } catch { return reply({ error: "bad json" }, 400); }
    const system = String(body.system || "").slice(0, 2000);
    const user = String(body.user || "").slice(0, MAX_CHARS);
    if (!user) return reply({ error: "empty prompt" }, 400);

    const upstream = await fetch(env.MUSE_API_BASE.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.MUSE_API_KEY },
      body: JSON.stringify({
        model: env.MUSE_MODEL || "muse-spark-1.3",
        max_tokens: 2000,           // Muse Spark always reasons; leave room for it plus the JSON answer
        reasoning_effort: "low",    // "none" is rejected by the API
        temperature: 0.8,
        messages: [{ role: "system", content: system }, { role: "user", content: user }]
      })
    });
    if (!upstream.ok) return reply({ error: "muse " + upstream.status }, 502);
    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return reply({ text });
  }
};
