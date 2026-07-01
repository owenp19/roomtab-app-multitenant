const webpush = require("web-push");
const { query } = require("../config/db");

const PUBLIC_VAPID_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_VAPID_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@roomtab.com";

if (PUBLIC_VAPID_KEY && PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);
}

async function sendPushToUser(userId, payload, tenantId) {
  if (!PRIVATE_VAPID_KEY) return { sent: 0, total: 0 };
  const tid = Number(tenantId) || 1;
  const subs = await query(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND tenant_id = ?",
    [userId, tid]
  );
  return sendToSubscriptions(subs, payload);
}

async function sendPushToAll(tenantId, payload) {
  if (!PRIVATE_VAPID_KEY) return { sent: 0, total: 0 };
  const tid = Number(tenantId) || 1;
  const subs = await query(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = ?",
    [tid]
  );
  return sendToSubscriptions(subs, payload);
}

async function sendToSubscriptions(subs, payload) {
  if (!PRIVATE_VAPID_KEY) return { sent: 0, total: 0 };
  const data = JSON.stringify(payload);
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or gone — remove it
        await query("DELETE FROM push_subscriptions WHERE id = ?", [sub.id]).catch(() => {});
      } else {
        console.error("Push error (sub " + sub.id + "):", err.message);
      }
    }
  }

  return { sent, total: subs.length };
}

module.exports = { sendPushToUser, sendPushToAll };
