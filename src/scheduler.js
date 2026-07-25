var cron = require("node-cron");
var { generateInvoices } = require("./scripts/generate-invoices");
var { getDbPool } = require("./config/db");
var { sendPushToAll } = require("./utils/push");

async function generatePaymentNotifications() {
  var pool = getDbPool();
  var now = new Date();
  var in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  var fmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  // Find invoices due within 3 days that are still pending
  var [dueInvoices] = await pool.query(
    "SELECT bi.id, bi.amount, bi.currency, bi.due_date, bi.tenant_id, t.name AS tenant_name FROM billing_invoices bi JOIN tenants t ON bi.tenant_id = t.id WHERE bi.status = 'pending' AND bi.due_date <= ? AND bi.due_date >= ?",
    [fmt(in3Days), fmt(now)]
  );

  var count = 0;
  for (var inv of dueInvoices) {
    // Check if notification already sent for this invoice
    var [existing] = await pool.query(
      "SELECT id FROM notifications WHERE title = 'payment_due' AND reference_id = ? LIMIT 1",
      [inv.id]
    );
    if (existing && existing.length > 0) continue;

    var dueDate = new Date(inv.due_date);
    var daysLeft = Math.max(0, Math.round((dueDate - now) / (1000 * 60 * 60 * 24)));

    await pool.query(
      "INSERT INTO notifications (tenant_id, title, message, type, reference_id, is_read, created_at) VALUES (?, 'payment_due', ?, 'warning', ?, 0, NOW())",
      [
        inv.tenant_id,
        "Factura de " + inv.currency + " " + Number(inv.amount).toFixed(2) + " vence en " + daysLeft + " d\u00eda(s). Por favor realiza el pago.",
        inv.id
      ]
    );
    count++;
  }

  if (count > 0) console.log("[Scheduler] Created " + count + " payment notification(s)");
}

async function cleanupOldNotifications() {
  var pool = getDbPool();

  // 1. Delete expiration notifications older than 30 days past expiry
  var [deleted] = await pool.query(
    "DELETE FROM notifications WHERE type = 'expiration' AND expiration_date IS NOT NULL AND expiration_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
  );
  if (deleted.affectedRows > 0) console.log("[Scheduler] Cleaned up " + deleted.affectedRows + " old expiration notification(s)");

  // 2. Auto-mark as read expiration notifications for products now out of stock
  var [marked] = await pool.query(
    `UPDATE notifications n
     JOIN room_minibar_inventory rmi ON rmi.room_id = n.room_id
     JOIN minibar_products mp ON mp.name = n.product_name AND mp.id = rmi.product_id
     SET n.is_read = 1
     WHERE n.type = 'expiration'
       AND n.is_read = 0
       AND rmi.quantity = 0`
  );
  if (marked.affectedRows > 0) console.log("[Scheduler] Auto-marked " + marked.affectedRows + " notification(s) as read (out of stock)");

  // 3. Delete low_stock notifications for products no longer below min_stock
  var [fixedLowStock] = await pool.query(
    `DELETE n FROM notifications n
     JOIN room_minibar_inventory rmi ON rmi.room_id = n.room_id
     JOIN minibar_products mp ON mp.name = n.product_name AND mp.id = rmi.product_id
     WHERE n.type IN ('low_stock', 'out_of_stock')
       AND rmi.quantity >= mp.min_stock`
  );
  if (fixedLowStock.affectedRows > 0) console.log("[Scheduler] Cleaned up " + fixedLowStock.affectedRows + " stale low_stock notification(s)");

  // 4. Delete stale_product notifications older than 30 days
  var [deletedStale] = await pool.query(
    "DELETE FROM notifications WHERE title = 'stale_product' AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
  );
  if (deletedStale.affectedRows > 0) console.log("[Scheduler] Cleaned up " + deletedStale.affectedRows + " old stale product notification(s)");

  // 5. Delete expiration_warning notifications for products that are now expired (replaced by expiration type)
  var [deletedWarn] = await pool.query(
    "DELETE FROM notifications WHERE type = 'expiration_warning' AND expiration_date IS NOT NULL AND expiration_date < CURDATE()"
  );
  if (deletedWarn.affectedRows > 0) console.log("[Scheduler] Cleaned up " + deletedWarn.affectedRows + " expired expiration_warning notification(s)");
}

function startScheduler() {
  // Run invoice generation daily at 2:00 AM
  cron.schedule("0 2 * * *", async function () {
    console.log("[Scheduler] Running daily invoice generation...");
    try {
      var count = await generateInvoices();
      console.log("[Scheduler] Generated " + count + " invoice(s)");
    } catch (err) {
      console.error("[Scheduler] Invoice generation error:", err.message);
    }

    try {
      await generatePaymentNotifications();
    } catch (err) {
      console.error("[Scheduler] Payment notification error:", err.message);
    }
  });

  console.log("[Scheduler] Invoice generation + payment notifications scheduled daily at 2:00 AM");

  // Smart alert generation daily at 3:00 AM
  cron.schedule("0 3 * * *", async function () {
    console.log("[Scheduler] Running daily smart alert generation...");

    try {
      var pool = getDbPool();
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var created = { expiring: 0, stale: 0 };

      // 1. Check for products expiring in 7 days
      var items = await pool.query(
        "SELECT rmi.id, rmi.expiration_date, rmi.product_id, rmi.room_id, rmi.tenant_id, mp.name AS product_name, r.room_number, r.floor_id, f.name AS floor_name FROM room_minibar_inventory rmi JOIN minibar_products mp ON mp.id = rmi.product_id JOIN rooms r ON r.id = rmi.room_id JOIN floors f ON f.id = r.floor_id WHERE rmi.expiration_date IS NOT NULL AND rmi.quantity > 0 AND rmi.tenant_id IS NOT NULL"
      );
      var rows = items[0] || items;
      console.log("[Scheduler] Smart alerts: scanning " + rows.length + " inventory items with expiration dates");

      for (var i = 0; i < rows.length; i++) {
        var item = rows[i];
        var expDate = new Date(item.expiration_date);
        expDate.setHours(0, 0, 0, 0);
        var diffTime = expDate.getTime() - today.getTime();
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          var [existing] = await pool.query(
            "SELECT id FROM notifications WHERE product_name = ? AND room_id = ? AND expiration_date = ? AND tenant_id = ? LIMIT 1",
            [item.product_name, item.room_id, item.expiration_date, item.tenant_id]
          );
          if (!existing || existing.length === 0) {
            var expMsg = diffDays < 0
              ? "Producto " + item.product_name + " venció hace " + Math.abs(diffDays) + " día(s) en habitación " + item.room_number
              : "Producto " + item.product_name + " vence en " + diffDays + " día(s) en habitación " + item.room_number;
            await pool.query(
              "INSERT INTO notifications (product_name, room_id, floor_id, room_number, floor_name, expiration_date, days_remaining, title, message, type, is_read, tenant_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'expiration', ?, 'expiration', 0, ?, NOW())",
              [item.product_name, item.room_id, item.floor_id, item.room_number, item.floor_name, item.expiration_date, diffDays, expMsg, item.tenant_id]
            );
            created.expiring++;
          }
        }
      }
      if (created.expiring > 0) {
        console.log("[Scheduler] Created " + created.expiring + " expiration notification(s)");
        try {
          var tenantsWithExpiring = await pool.query(
            "SELECT DISTINCT tenant_id FROM room_minibar_inventory WHERE expiration_date IS NOT NULL AND quantity > 0 AND expiration_date < CURDATE()"
          );
          var tRows = tenantsWithExpiring[0] || tenantsWithExpiring;
          for (var t = 0; t < tRows.length; t++) {
            sendPushToAll(tRows[t].tenant_id, { title: "Productos vencidos", body: "Hay productos que ya vencieron", url: "/app/notificaciones" }).catch(function() {});
          }
        } catch (pushErr) {
          console.error("[Scheduler] Error sending push for expirations:", pushErr.message);
        }
      }

      // 2. Check for stale products (no movement in 14 days)
      var staleProducts = await pool.query(
        "SELECT mp.id, mp.name, rmi.tenant_id, MAX(mm.created_at) AS last_movement FROM minibar_products mp JOIN room_minibar_inventory rmi ON rmi.product_id = mp.id AND rmi.quantity > 0 LEFT JOIN minibar_movements mm ON mm.product_id = mp.id WHERE mp.is_active = 1 AND rmi.tenant_id IS NOT NULL GROUP BY mp.id, mp.name, rmi.tenant_id HAVING MAX(mm.created_at) IS NULL OR MAX(mm.created_at) < DATE_SUB(NOW(), INTERVAL 14 DAY)"
      );
      var staleRows = staleProducts[0] || staleProducts;

      for (var j = 0; j < staleRows.length; j++) {
        var sp = staleRows[j];
        var daysInactive = sp.last_movement ? Math.floor((Date.now() - new Date(sp.last_movement).getTime()) / (1000 * 60 * 60 * 24)) : 999;

        var [existingStale] = await pool.query(
          "SELECT id FROM notifications WHERE title = 'stale_product' AND reference_id = ? AND tenant_id = ? AND is_read = 0 LIMIT 1",
          [sp.id, sp.tenant_id]
        );
        if (!existingStale || existingStale.length === 0) {
          await pool.query(
            "INSERT INTO notifications (product_name, title, message, type, reference_id, is_read, tenant_id, created_at) VALUES (?, 'stale_product', ?, 'warning', ?, 0, ?, NOW())",
            [sp.name, "Producto " + sp.name + " sin movimiento en " + daysInactive + " día(s)", sp.id, sp.tenant_id]
          );
          created.stale++;
        }
      }
      if (created.stale > 0) console.log("[Scheduler] Created " + created.stale + " stale product notification(s)");

      console.log("[Scheduler] Smart alert generation complete: " + (created.expiring + created.stale) + " notification(s) created");
    } catch (err) {
      console.error("[Scheduler] Smart alert generation error:", err.message);
    }
  });

  console.log("[Scheduler] Smart alert generation scheduled daily at 3:00 AM");

  // Cleanup old notifications daily at 4:00 AM
  cron.schedule("0 4 * * *", async function () {
    console.log("[Scheduler] Running notification cleanup...");
    try {
      await cleanupOldNotifications();
    } catch (err) {
      console.error("[Scheduler] Notification cleanup error:", err.message);
    }
  });

  console.log("[Scheduler] Notification cleanup scheduled daily at 4:00 AM");
}

module.exports = { startScheduler };
