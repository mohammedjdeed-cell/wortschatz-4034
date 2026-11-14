// Imported into the generated service worker (vite.config.js → workbox.importScripts).
// Shows the daily reminder that /api/remind sends as a data-only FCM web push, and opens the app on click.
self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = { data: { body: event.data && event.data.text() } }; }
  const d = p.data || p.notification || p;
  const title = d.title || "Wortschatz 4034";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Zeit für ein paar Wörter.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "wz-reminder", // a newer reminder replaces the old one
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
