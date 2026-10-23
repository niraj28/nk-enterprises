// AI proxy: the only place the model API key lives. Works with any OpenAI-compatible API
// (now Google Gemini; Meta's Muse also works). The page POSTs {system, user}; this adds the
// key, calls the model, and returns {text}.
const MAX_CHARS = 8000;

// Calls the configured model. Returns { ok, text, model } or { ok: false, status, model, detail }.
export function llmConfigured(env) {
  return !!((env.LLM_API_KEY || env.MUSE_API_KEY) && (env.LLM_API_BASE || env.MUSE_API_BASE) && (env.LLM_MODEL || env.MUSE_MODEL));
}
export async function callLLM(env, system, user, signal) {
  const key = env.LLM_API_KEY || env.MUSE_API_KEY;
  const base = env.LLM_API_BASE || env.MUSE_API_BASE;
  const model = env.LLM_MODEL || env.MUSE_MODEL;
  // Try each model in order; free tiers are sometimes busy (503) or rate-limited (429).
  const models = String(env.LLM_MODELS || model).split(",").map((m) => m.trim()).filter(Boolean);
  let status = 0, used = "", detail = "";
  for (const m of models) {
    const upstream = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: m,
        max_tokens: 2000,                             // thinking models need room for reasoning plus the JSON answer
        reasoning_effort: env.LLM_REASONING || "low", // keep turns quick
        temperature: 0.8,
        messages: [{ role: "system", content: system }, { role: "user", content: user }]
      })
    });
    used = m; status = upstream.status;
    if (upstream.ok) {
      const data = await upstream.json();
      return { ok: true, text: data?.choices?.[0]?.message?.content ?? "", model: m };
    }
    detail = (await upstream.text()).slice(0, 300); // e.g. "model not found"; never contains the key
    if (![400, 404, 429, 500, 503].includes(upstream.status)) break;
  }
  return { ok: false, status, model: used, detail };
}

export async function handleMuse(request, env, reply) {
  if (!llmConfigured(env)) {
    const missing = [!(env.LLM_API_KEY || env.MUSE_API_KEY) && "API key", !(env.LLM_API_BASE || env.MUSE_API_BASE) && "API base", !(env.LLM_MODEL || env.MUSE_MODEL) && "model"].filter(Boolean);
    return reply({ error: "AI is not configured", missing }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return reply({ error: "bad json" }, 400); }
  const system = String(body.system || "").slice(0, 2000);
  const user = String(body.user || "").slice(0, MAX_CHARS);
  if (!user) return reply({ error: "empty prompt" }, 400);
  const r = await callLLM(env, system, user);
  if (!r.ok) return reply({ error: "model " + r.status, model: r.model, detail: r.detail }, 502);
  return reply({ text: r.text, model: r.model });
}
