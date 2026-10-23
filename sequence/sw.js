/* The game moved to /lineup5/. Phones that installed the old version get this file as an
   update: it deletes the old offline copy, removes itself and reloads, which lands on the
   redirect page and then the new address. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("sequence-")) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
