self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  const title = data.title || "HireTrack 360";
  const options = {
    body: data.body || "You have a new career update.",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    data: { url: data.url || "/dashboard.html" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(clients.openWindow(url));
});
