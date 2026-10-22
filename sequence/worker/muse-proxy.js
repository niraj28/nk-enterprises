// Muse proxy: the only place the Meta Model API key lives.
// The game page POSTs {system, user}; this adds the key, calls Muse, and returns {text}.
const MAX_CHARS = 8000;

export async function handleMuse(request, env, reply) {
  if (!env.MUSE_API_KEY) return reply({ error: "Muse is not configured" }, 503);
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
