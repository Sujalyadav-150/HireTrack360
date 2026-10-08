const webpush = require("web-push");
const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");

let pushConfigured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    pushConfigured = true;
  } catch (error) {
    console.error("VAPID configuration error:", error.message);
  }
}

async function deliverPush(userId, notification) {
  if (!pushConfigured) return;
  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify({
        title: notification.title,
        body: notification.message,
        url: notification.link
      }));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      } else {
        console.error("Push delivery failed:", error.message);
      }
    }
  }));
}

async function createNotification({ userId, type, title, message, link, dedupeKey }) {
  let notification;
  try {
    if (dedupeKey) {
      const existing = await Notification.findOne({ dedupeKey });
      if (existing) return existing;
      notification = await Notification.create({ userId, type, title, message, link, dedupeKey });
    } else {
      notification = await Notification.create({ userId, type, title, message, link });
    }
  } catch (error) {
    if (error.code === 11000 && dedupeKey) return null;
    throw error;
  }
  await deliverPush(userId, notification);
  return notification;
}

module.exports = { createNotification, deliverPush, pushConfigured };