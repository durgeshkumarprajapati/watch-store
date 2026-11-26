/* WatchStore Web Push Service Worker (push + notificationclick only; no fetch caching) */

function toSafeRelativeUrl(raw) {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : "WatchStore";
  const body =
    typeof payload.body === "string" && payload.body.trim().length > 0
      ? payload.body.trim()
      : "You have a new update.";
  const url = toSafeRelativeUrl(payload.url);
  const tag =
    typeof payload.tag === "string" && payload.tag.trim().length > 0
      ? payload.tag.trim()
      : "watchstore-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const relativeUrl = toSafeRelativeUrl(event.notification?.data?.url);
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(targetUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
