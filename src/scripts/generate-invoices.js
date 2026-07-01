var { getDbPool } = require("../config/db");

async function generateInvoices() {
  var pool = getDbPool();
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth();

  var [subscriptions] = await pool.query(`
    SELECT s.id AS sub_id, s.tenant_id, s.billing_day,
           p.price_monthly, p.name AS plan_name
    FROM tenant_subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.status = 'active'
  `);

  var generated = 0;

  for (var sub of subscriptions) {
    var periodStart = year + "-" + String(month + 1).padStart(2, "0") + "-01";
    var periodEnd = new Date(year, month + 1, 0);
    var periodEndStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(periodEnd.getDate()).padStart(2, "0");

    var [existing] = await pool.query(
      "SELECT id FROM billing_invoices WHERE tenant_id = ? AND period_start = ? AND period_end = ? AND status != 'cancelled'",
      [sub.tenant_id, periodStart, periodEndStr]
    );

    if (existing && existing.length > 0) continue;

    var dueDay = sub.billing_day || 1;
    var dueDate = new Date(year, month, dueDay);
    if (dueDate < now) {
      dueDate = periodEnd;
    }
    var dueDateStr = dueDate.getFullYear() + "-" + String(dueDate.getMonth() + 1).padStart(2, "0") + "-" + String(dueDate.getDate()).padStart(2, "0");

    await pool.query(
      "INSERT INTO billing_invoices (tenant_id, subscription_id, amount, currency, status, period_start, period_end, due_date) VALUES (?, ?, ?, 'COP', 'pending', ?, ?, ?)",
      [sub.tenant_id, sub.sub_id, sub.price_monthly || 0, periodStart, periodEndStr, dueDateStr]
    );

    generated++;
  }

  return generated;
}

if (require.main === module) {
  generateInvoices()
    .then(function (count) { console.log("Generated " + count + " invoice(s)"); process.exit(0); })
    .catch(function (err) { console.error("Error:", err); process.exit(1); });
}

module.exports = { generateInvoices };
