require("dotenv").config();

const requiredEnvVars = ["DB_HOST", "DB_USER", "DB_NAME"];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`[FATAL] Variable de entorno requerida no configurada: ${v}`);
    process.exit(1);
  }
}

require("./src/config/db").initDbPool();
const { createApp } = require("./src/app");
const { query, getDbPool } = require("./src/config/db");

const { sendPushToAll } = require("./src/utils/push");
const app = createApp();
const port = Number(process.env.PORT || 3000);

// Check expiring products on startup
async function checkExpirations() {
  try {
    const tenants = await query("SELECT id FROM tenants WHERE active = 1");
    let totalCreated = 0;

    for (const tenant of tenants) {
      const tid = tenant.id;
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

      if (items.length > 0) {
        console.log("[Expirations] Tenant " + tid + ": " + items.length + " items with expiration dates");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let created = 0;

      for (const item of items) {
        if (!item.expiration_date) continue;
        const expDate = new Date(item.expiration_date);
        expDate.setHours(0, 0, 0, 0);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const existing = await query(
            `SELECT id FROM notifications
             WHERE type = 'expiration' AND product_name = ? AND room_id = ? AND expiration_date = ? AND tenant_id = ?`,
            [item.product_name, item.room_id, item.expiration_date, tid]
          );

          if (existing.length === 0) {
            const expMsg = diffDays < 0
              ? item.product_name + ' vencio hace ' + Math.abs(diffDays) + ' dias'
              : item.product_name + ' vence en ' + diffDays + ' dias';
            await query(
              `INSERT INTO notifications (type, product_name, room_id, floor_id, room_number, floor_name, expiration_date, days_remaining, title, message, tenant_id)
               VALUES ('expiration', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.product_name, item.room_id, item.floor_id, item.room_number, item.floor_name, item.expiration_date, diffDays, 'expiration', expMsg, tid]
            );
            created++;
            console.log("[Expirations] Created: " + item.product_name + " hab." + item.room_number + " (" + diffDays + " dias)");
          }
        }
      }
      if (created > 0) {
        sendPushToAll(tid, { title: "Productos vencidos", body: created + " producto(s) ya vencieron", url: "/app/notificaciones" }).catch(() => {});
      }
      totalCreated += created;
    }
    if (totalCreated > 0) {
      console.log("[Scheduler] Revision de vencimientos: " + totalCreated + " notificaciones nuevas");
    }
  } catch (err) {
    console.error("[Scheduler] Error checking expirations:", err.message);
  }
}

// Check low stock every 6 hours (not on startup)
async function checkLowStock() {
  try {
    const tenants = await query("SELECT id FROM tenants WHERE active = 1");
    let totalCreated = 0;

    for (const tenant of tenants) {
      const tid = tenant.id;
      const items = await query(
        `SELECT rmi.id, rmi.quantity, rmi.product_id, rmi.room_id,
                mp.name AS product_name, mp.min_stock,
                r.room_number, r.floor_id,
                f.name AS floor_name
         FROM room_minibar_inventory rmi
         JOIN minibar_products mp ON mp.id = rmi.product_id
         JOIN rooms r ON r.id = rmi.room_id
         JOIN floors f ON f.id = r.floor_id
         WHERE rmi.quantity < mp.min_stock
           AND mp.is_active = 1
           AND rmi.tenant_id = ?`,
        [tid]
      );

      let created = 0;
      for (const item of items) {
        const existing = await query(
          `SELECT id FROM notifications
           WHERE type = 'low_stock'
             AND product_name = ?
             AND room_id = ?
             AND tenant_id = ?`,
          [item.product_name, item.room_id, tid]
        );

        if (existing.length === 0) {
          const isOutOfStock = item.quantity === 0;
          const statusLabel = isOutOfStock ? 'Agotado' : 'Stock bajo';
          const detailMsg = isOutOfStock
            ? item.product_name + ' esta agotado en Habitacion ' + item.room_number + ' (' + item.floor_name + ')'
            : item.product_name + ' necesita reposicion en Habitacion ' + item.room_number + ' (' + item.floor_name + ') - actual: ' + item.quantity + ', minimo: ' + (item.min_stock || 1);
          await query(
            `INSERT INTO notifications (type, product_name, room_id, floor_id, room_number, floor_name, title, message, days_remaining, expiration_date, tenant_id)
             VALUES ('low_stock', ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
            [
              item.product_name,
              item.room_id,
              item.floor_id,
              item.room_number,
              item.floor_name,
              statusLabel,
              detailMsg,
              tid
            ]
          );
          created++;
        }
      }
      if (created > 0) {
        sendPushToAll(tid, { title: "Alertas de inventario", body: created + " producto(s) necesitan atencion", url: "/app/notificaciones" }).catch(() => {});
      }
      totalCreated += created;
    }
    console.log("[Scheduler] Revision de stock bajo: " + totalCreated + " notificaciones nuevas");
  } catch (err) {
    console.error("[Scheduler] Error checking low stock:", err.message);
  }
}

// Check expiration warnings (products expiring within 7 days) every 30 minutes
async function checkExpirationWarnings() {
  try {
    const tenants = await query("SELECT id FROM tenants WHERE active = 1");
    let totalCreated = 0;

    for (const tenant of tenants) {
      const tid = tenant.id;
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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let created = 0;

      for (const item of items) {
        if (!item.expiration_date) continue;
        const expDate = new Date(item.expiration_date);
        expDate.setHours(0, 0, 0, 0);
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0 && diffDays <= 7) {
          const existing = await query(
            `SELECT id FROM notifications
             WHERE type = 'expiration_warning' AND product_name = ? AND room_id = ? AND expiration_date = ? AND tenant_id = ?`,
            [item.product_name, item.room_id, item.expiration_date, tid]
          );

          if (existing.length === 0) {
            const warnMsg = item.product_name + ' vence en ' + diffDays + ' dia(s) en Habitacion ' + item.room_number + ' (' + item.floor_name + ')';
            await query(
              `INSERT INTO notifications (type, product_name, room_id, floor_id, room_number, floor_name, expiration_date, days_remaining, title, message, tenant_id)
               VALUES ('expiration_warning', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.product_name, item.room_id, item.floor_id, item.room_number, item.floor_name, item.expiration_date, diffDays, 'Productos proximos a vencer', warnMsg, tid]
            );
            created++;
          }
        }
      }
      if (created > 0) {
        sendPushToAll(tid, { title: "Productos proximos a vencer", body: created + " producto(s) vencen pronto", url: "/app/notificaciones" }).catch(() => {});
      }
      totalCreated += created;
    }
    if (totalCreated > 0) {
      console.log("[Expirations] Revision de advertencias de vencimiento: " + totalCreated + " notificaciones nuevas");
    }
  } catch (err) {
    console.error("[Scheduler] Error checking expiration warnings:", err.message);
  }
}

// Cleanup stale notifications on startup
async function cleanupStaleNotifications() {
  try {
    // min_stock is now configured per-product by the admin and NOT auto-reset

    // Delete low_stock notifications where stock is no longer below minimum
    const fixed = await query(
      `DELETE n FROM notifications n
       JOIN room_minibar_inventory rmi ON rmi.room_id = n.room_id
       JOIN minibar_products mp ON mp.name = n.product_name AND mp.id = rmi.product_id
       WHERE n.type = 'low_stock'
         AND rmi.quantity >= mp.min_stock`
    );
    if (fixed.affectedRows > 0) {
      console.log("[Startup] Cleaned up " + fixed.affectedRows + " stale low_stock notification(s)");
    }

    // Delete expiration_warning notifications for products that are already expired
    const expiredWarn = await query(
      "DELETE FROM notifications WHERE type = 'expiration_warning' AND expiration_date IS NOT NULL AND expiration_date < CURDATE()"
    );
    if (expiredWarn.affectedRows > 0) {
      console.log("[Startup] Cleaned up " + expiredWarn.affectedRows + " expired expiration_warning notification(s)");
    }

    // Delete old read notifications (older than 7 days) to prevent accumulation
    const oldRead = await query(
      "DELETE FROM notifications WHERE is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    if (oldRead.affectedRows > 0) {
      console.log("[Startup] Cleaned up " + oldRead.affectedRows + " old read notification(s)");
    }
  } catch (err) {
    console.error("[Startup] Error cleaning notifications:", err.message);
  }
}

// Run on startup and every 30 minutes
setTimeout(checkExpirations, 5000);
setInterval(checkExpirations, 30 * 60 * 1000);

// Check expiration warnings every 30 minutes
setTimeout(checkExpirationWarnings, 10000);
setInterval(checkExpirationWarnings, 30 * 60 * 1000);

// Check low stock every 30 minutes (not on startup)
setInterval(checkLowStock, 30 * 60 * 1000);

// Cleanup stale notifications on startup
setTimeout(cleanupStaleNotifications, 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Minibar backend running at http://localhost:${port}`);
});
