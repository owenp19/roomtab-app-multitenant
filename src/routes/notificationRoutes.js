const express = require("express");
const { query, getDbPool } = require("../config/db");
const { sendPushToAll } = require("../utils/push");

const router = express.Router();

// GET /api/notifications
router.get("/", async (req, res) => {
  try {
    const tid = req.tenantId;
    const { floorId, roomId, unread, sort } = req.query;
    let sql = "SELECT * FROM notifications WHERE tenant_id = ?";
    const params = [tid];

    if (floorId) {
      sql += " AND floor_id = ?";
      params.push(Number(floorId));
    }
    if (roomId) {
      sql += " AND room_id = ?";
      params.push(Number(roomId));
    }
    if (unread === "true") {
      sql += " AND is_read = 0";
    }

    sql += " ORDER BY " + (sort === "expiration" ? "expiration_date ASC" : "created_at DESC");
    sql += " LIMIT 100";

    const notifications = await query(sql, params);
    res.json(notifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Error al cargar notificaciones" });
  }
});

// GET /api/notifications/unread-count
router.get("/unread-count", async (req, res) => {
  try {
    const tid = req.tenantId;
    const [{ count }] = await query(
      "SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0 AND tenant_id = ?",
      [tid]
    );
    res.json({ count: Math.min(count, 99) });
  } catch (err) {
    console.error("Error fetching unread count:", err);
    res.status(500).json({ error: "Error al contar notificaciones" });
  }
});

// POST /api/notifications/:id/read
router.post("/:id/read", async (req, res) => {
  try {
    const tid = req.tenantId;
    await query("UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?", [Number(req.params.id), tid]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Error al marcar notificación" });
  }
});

// POST /api/notifications/read-all
router.post("/read-all", async (req, res) => {
  try {
    const tid = req.tenantId;
    await query("UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND tenant_id = ?", [tid]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all as read:", err);
    res.status(500).json({ error: "Error al marcar notificaciones" });
  }
});

// POST /api/notifications/check
router.post("/check", async (req, res) => {
  try {
    const tid = req.tenantId;
    const pool = getDbPool();

    // Get all inventory items with expiration dates
    const items = await query(
      `SELECT rmi.id, rmi.expiration_date, rmi.product_id, rmi.room_id,
              mp.name AS product_name,
              r.room_number, r.floor_id,
              f.name AS floor_name
       FROM room_minibar_inventory rmi
       JOIN minibar_products mp ON mp.id = rmi.product_id
       JOIN rooms r ON r.id = rmi.room_id
       JOIN floors f ON f.id = r.floor_id
       WHERE rmi.expiration_date IS NOT NULL
         AND rmi.quantity > 0
         AND rmi.tenant_id = ?`,
      [tid]
    );

    console.log("[NotificationCheck] Tenant " + tid + ": found " + items.length + " items with expiration dates");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const created = [];

    for (const item of items) {
      const expDate = new Date(item.expiration_date);
      expDate.setHours(0, 0, 0, 0);
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        // Check if notification already exists for this product+room+expiration (read or unread)
        const [existing] = await pool.query(
          `SELECT id FROM notifications
           WHERE product_name = ? AND room_id = ? AND expiration_date = ? AND tenant_id = ?`,
          [item.product_name, item.room_id, item.expiration_date, tid]
        );

        if (existing.length === 0) {
          const expMsg = diffDays < 0
            ? `Producto ${item.product_name} vencio hace ${Math.abs(diffDays)} dia(s) en habitacion ${item.room_number}`
            : `Producto ${item.product_name} vence en ${diffDays} dia(s) en habitacion ${item.room_number}`;
          await pool.query(
            `INSERT INTO notifications (product_name, room_id, floor_id, room_number, floor_name, expiration_date, days_remaining, title, message, type, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'expiration', ?, 'expiration', ?)`,
            [item.product_name, item.room_id, item.floor_id, item.room_number, item.floor_name, item.expiration_date, diffDays, expMsg, tid]
          );
          created.push(item.product_name);
          console.log("[NotificationCheck] Created: " + item.product_name + " hab." + item.room_number + " (" + diffDays + " dias)");
        } else {
          console.log("[NotificationCheck] Skipped (already exists): " + item.product_name + " hab." + item.room_number);
        }
      } else {
        console.log("[NotificationCheck] Skipped (out of range " + diffDays + "d): " + item.product_name + " hab." + item.room_number);
      }
    }

    res.json({
      success: true,
      message: `Revision completada. ${created.length} notificaciones nuevas.`,
      created: created.length
    });

    // Auto-cleanup stale low_stock notifications after check
    try {
      await pool.query(
        `DELETE n FROM notifications n
         JOIN room_minibar_inventory rmi ON rmi.room_id = n.room_id
         JOIN minibar_products mp ON mp.name = n.product_name AND mp.id = rmi.product_id
         WHERE n.type = 'low_stock'
           AND rmi.quantity >= mp.min_stock`
      );
    } catch (cleanupErr) {
      console.error("Error cleaning stale notifications:", cleanupErr.message);
    }

    if (created.length > 0) {
      sendPushToAll(tid, { title: "Productos vencidos", body: created.length + " producto(s) ya vencieron", url: "/app/notificaciones" }).catch(() => {});
    }
  } catch (err) {
    console.error("Error checking expirations:", err);
    res.status(500).json({ error: "Error al revisar vencimientos" });
  }
});

module.exports = router;
