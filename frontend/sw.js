// Push notifications open a neutral entry point. The application resolves
// the authenticated user's role on arrival instead of assuming a job seeker.
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || "HireTrack 360";
  const options = {
    body: data.body || "You have a new career update.",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.openWindow(url));
});
