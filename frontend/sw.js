self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  const title = data.title || "HireTrack 360";
  const options = {
    body: data.body || "You have a new career update.",
    data: { url: data.url || "/dashboard.html" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard.html", self.location.origin).href;
  event.waitUntil(clients.openWindow(url));
});
