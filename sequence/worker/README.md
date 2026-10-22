# Muse proxy for the Sequence game

The game page can't hold an API key (anyone could copy it), so the Muse AI seats talk to this
small Cloudflare Worker, which adds your Meta Model API key and calls Muse.

## Deploy (about 5 minutes, free Cloudflare plan is enough)

1. Get a Meta Model API key at https://ai.developer.meta.com (Meta Model API) and check the base URL and model ID in its docs.
   Put them in `wrangler.toml` (`MUSE_API_BASE`, `MUSE_MODEL`) if they differ.
2. In this folder:
   ```
   npx wrangler login
   npx wrangler secret put MUSE_API_KEY
   npx wrangler deploy
   ```
3. Copy the Worker URL it prints (like `https://muse-proxy.<you>.workers.dev`) into
   `DEFAULT_PROXY` in `sequence/muse.js`, bump `muse.js?v=` in `sequence/index.html`, and push.
   To test before publishing, paste the URL under "Muse connection" on the game page instead.
   That's saved only in your browser.

## Cost control

- Each AI turn is one call with about 1,000 input tokens and a few hundred output tokens
  (Muse Spark reasons before answering; the Worker asks for low reasoning effort).
  A full 4-agent game is roughly 60 to 120 AI turns.
- The rate limiter allows 30 calls a minute per visitor. Also set a monthly spend limit in your Meta account.
- If the Worker is down or over its limit, the AI seats switch to the built-in brain, so the game never breaks.
