const express = require("express");
const router = express.Router();
const { query } = require("../config/db");
const webpush = require("web-push");

const PUBLIC_VAPID_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_VAPID_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@roomtab.com";

if (PUBLIC_VAPID_KEY && PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);
}

function getSessionUser(req) {
  return req.session?.user || null;
}

// GET /api/push/vapid-public-key
router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: PUBLIC_VAPID_KEY });
});

// POST /api/push/subscribe
router.post("/subscribe", async (req, res) => {
  try {
    const user = getSessionUser(req);
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: "Suscripción incompleta" });
    }

    const tid = Number(req.tenantId) || 1;
    // Upsert subscription
    await query(
      `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent), updated_at = NOW()`,
      [tid, user?.id || null, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving push subscription:", err);
    res.status(500).json({ error: "Error al guardar suscripción" });
  }
});

// POST /api/push/unsubscribe
router.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "Endpoint requerido" });

    await query("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error removing push subscription:", err);
    res.status(500).json({ error: "Error al eliminar suscripción" });
  }
});

module.exports = router;
