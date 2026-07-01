const db = require("../config/db");

async function createConsumptionWithItems(roomId, note, items, tenantId) {
  var room = Number(roomId);
  var tid = Number(tenantId) || 1;
  if (!Number.isFinite(room) || room <= 0) throw new Error("roomId inválido");

  var normalizedItems = Array.isArray(items)
    ? items
        .map(function (x) { return { productId: Number(x.productId), quantity: Number(x.quantity) }; })
        .filter(function (x) { return Number.isFinite(x.productId) && x.productId > 0 && Number.isFinite(x.quantity) && x.quantity > 0; })
    : [];

  if (normalizedItems.length === 0) throw new Error("items inválidos");

  var pool = db.getDbPool();
  var conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    var [insertConsumption] = await conn.query(
      "INSERT INTO consumptions (room_id, note, tenant_id, created_at, consumption_date) VALUES (?, ?, ?, NOW(), NOW())",
      [room, note || null, tid]
    );

    var consumptionId = insertConsumption.insertId;

    for (var i = 0; i < normalizedItems.length; i++) {
      var it = normalizedItems[i];
      await conn.query(
        "INSERT INTO consumption_items (consumption_id, product_id, quantity, tenant_id) VALUES (?, ?, ?, ?)",
        [consumptionId, it.productId, it.quantity, tid]
      );
    }

    await conn.commit();
    return consumptionId;
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

async function getConsumptionWithItemsById(consumptionId, tenantId) {
  var id = Number(consumptionId);
  var tid = Number(tenantId) || 1;
  if (!Number.isFinite(id) || id <= 0) return null;

  var rows = await db.query(
    "SELECT c.id, c.created_at AS createdAt, c.consumption_date AS consumptionDate, c.note AS note, r.room_number AS roomNumber FROM consumptions c JOIN rooms r ON r.id = c.room_id WHERE c.id = ? AND c.tenant_id = ? LIMIT 1",
    [id, tid]
  );

  if (!rows || rows.length === 0) return null;

  var c = rows[0];

  var itemRows = await db.query(
    "SELECT p.name AS name, p.price AS price, ci.quantity AS quantity FROM consumption_items ci JOIN products p ON p.id = ci.product_id WHERE ci.consumption_id = ? AND ci.tenant_id = ?",
    [id, tid]
  );

  var items = (itemRows || []).map(function (x) { return { name: x.name, price: Number(x.price) || 0, quantity: Number(x.quantity) || 0 }; });

  var total = 0;
  for (var i = 0; i < items.length; i++) { total += items[i].quantity * items[i].price; }

  return {
    id: c.id,
    createdAt: c.createdAt || c.consumptionDate || null,
    roomNumber: String(c.roomNumber ?? "").trim(),
    note: c.note || "",
    items: items,
    total: total,
  };
}

async function getConsumptionsByDateRange(from, to, tenantId) {
  var tid = Number(tenantId) || 1;
  var sql = "SELECT c.id, c.created_at AS createdAt, c.consumption_date AS consumptionDate, c.note AS note, r.room_number AS roomNumber FROM consumptions c JOIN rooms r ON r.id = c.room_id WHERE c.tenant_id = ?";
  var params = [tid];

  if (from && to) {
    sql += " AND c.created_at >= ? AND c.created_at <= ?";
    params.push(from + " 00:00:00", to + " 23:59:59");
  } else if (from) {
    sql += " AND c.created_at >= ?";
    params.push(from + " 00:00:00");
  } else if (to) {
    sql += " AND c.created_at <= ?";
    params.push(to + " 23:59:59");
  }

  sql += " ORDER BY c.created_at DESC";

  var rows = await db.query(sql, params);
  if (!rows || rows.length === 0) return [];

  var consumptions = [];
  for (var ci = 0; ci < rows.length; ci++) {
    var c = rows[ci];
    var itemRows = await db.query(
      "SELECT p.name AS name, p.price AS price, ci.quantity AS quantity FROM consumption_items ci JOIN products p ON p.id = ci.product_id WHERE ci.consumption_id = ? AND ci.tenant_id = ?",
      [c.id, tid]
    );

    var items = (itemRows || []).map(function (x) { return { name: x.name, price: Number(x.price) || 0, quantity: Number(x.quantity) || 0 }; });

    var total = 0;
    for (var i = 0; i < items.length; i++) { total += items[i].quantity * items[i].price; }

    consumptions.push({
      id: c.id,
      createdAt: c.createdAt || c.consumptionDate || null,
      roomNumber: String(c.roomNumber ?? "").trim(),
      note: c.note || "",
      items: items,
      total: total,
    });
  }

  return consumptions;
}

module.exports = {
  createConsumptionWithItems,
  getConsumptionWithItemsById,
  getConsumptionsByDateRange,
};
