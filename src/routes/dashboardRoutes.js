const express = require("express");
const router = express.Router();
const { query, getDbPool } = require("../config/db");

function getDateRange(filter) {
  const now = new Date();
  let from, to;
  const todayStr = now.toISOString().split("T")[0];
  switch (filter) {
    case "today":
      from = todayStr + " 00:00:00";
      to = todayStr + " 23:59:59";
      break;
    case "week": {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      from = weekAgo.toISOString().split("T")[0] + " 00:00:00";
      to = todayStr + " 23:59:59";
      break;
    }
    case "month":
    default: {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      from = monthStart.toISOString().split("T")[0] + " 00:00:00";
      to = todayStr + " 23:59:59";
      break;
    }
  }
  return { from, to };
}

function formatCOP(n) {
  return "$" + Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

router.get("/", async (req, res) => {
  try {
    const filter = req.query.filter || "month";
    const rawFloor = req.query.floor;
    let floorId = null;
    if (rawFloor !== undefined && rawFloor !== null && rawFloor !== '') {
      const parsed = parseInt(rawFloor, 10);
      if (!isNaN(parsed) && parsed >= 0 && String(parsed) === String(rawFloor)) {
        floorId = parsed;
      }
    }
    const fFloor = floorId !== null ? `AND f.id = ${floorId}` : "";
    const rFloor = floorId !== null ? `AND r.floor_id = ${floorId}` : "";
    const lossFloor = floorId !== null ? `AND floor_id = ${floorId}` : "";
    const tid = Number(req.tenantId) || 1;
    const { from, to } = getDateRange(filter);
    const todayStr = new Date().toISOString().split("T")[0];
    const todayStart = todayStr + " 00:00:00";
    const todayEnd = todayStr + " 23:59:59";

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const periodMs = toDate.getTime() - fromDate.getTime();
    const prevFrom = new Date(fromDate.getTime() - periodMs - 1);
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFromStr = prevFrom.toISOString().split("T")[0] + " 00:00:00";
    const prevToStr = prevTo.toISOString().split("T")[0] + " 23:59:59";

    const [
      todayConsumption,
      periodConsumption,
      prevConsumption,
      todayLosses,
      periodLosses,
    ] = await Promise.all([
      // 1. Today consumption KPIs
      query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COUNT(*) AS total_movements,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_products
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}`,
        [todayStart, todayEnd, tid]
      ),
      // 2. Period consumption KPIs
      query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COUNT(*) AS total_movements,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_products
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}`,
        [from, to, tid]
      ),
      // 3. Previous period consumption for comparison
      query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}`,
        [prevFromStr, prevToStr, tid]
      ),
      // 4. Today losses
      query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_amount,
                COUNT(*) AS total_records
         FROM minibar_loss_records
         WHERE registered_at >= ? AND registered_at <= ? AND tenant_id = ? ${lossFloor}`,
        [todayStart, todayEnd, tid]
      ),
      // 5. Period losses
      query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_amount,
                COUNT(*) AS total_records
         FROM minibar_loss_records
         WHERE registered_at >= ? AND registered_at <= ? AND tenant_id = ? ${lossFloor}`,
        [from, to, tid]
      ),
    ]);

    const [
      totalRooms,
      roomsWithConsumption,
      roomsPending,
      agotados,
      lowStockRooms,
    ] = await Promise.all([
      // 6. Total rooms
      query("SELECT COUNT(*) AS total FROM rooms WHERE tenant_id = ?", [tid]),
      // 7. Rooms with consumption (period)
      query(
        `SELECT COUNT(DISTINCT mm.room_id) AS total
         FROM minibar_movements mm
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}`,
        [from, to, tid]
      ),
      // 8. Rooms without consumption (pending review)
      query(
        `SELECT COUNT(*) AS total FROM rooms r
         WHERE r.tenant_id = ? AND r.id NOT IN (
           SELECT DISTINCT mm.room_id FROM minibar_movements mm
           WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ?
         ) ${rFloor}`,
        [tid, from, to]
      ),
      // 9. Agotados (quantity = 0)
      query(
        `SELECT COUNT(DISTINCT rmi.product_id) AS total_products,
                COUNT(DISTINCT rmi.room_id) AS total_rooms
         FROM room_minibar_inventory rmi
         JOIN minibar_products mp ON mp.id = rmi.product_id
         JOIN rooms r ON r.id = rmi.room_id
         WHERE rmi.quantity = 0 AND mp.is_active = 1 AND r.tenant_id = ? ${rFloor}`,
        [tid]
      ),
      // 10. Low stock rooms (quantity <= 2)
      query(
        `SELECT COUNT(DISTINCT rmi.room_id) AS total
         FROM room_minibar_inventory rmi
         JOIN minibar_products mp ON mp.id = rmi.product_id
         JOIN rooms r ON r.id = rmi.room_id
         WHERE rmi.quantity <= 2 AND mp.is_active = 1 AND r.tenant_id = ? ${rFloor}`,
        [tid]
      ),
    ]);

    const [
      floorBreakdown,
      categoryBreakdown,
      dailyConsumption,
      topProducts,
    ] = await Promise.all([
      // 11. Consumption by floor (for bar chart)
      query(
        `SELECT f.name, f.id AS floor_id, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items,
                COUNT(*) AS total_movements
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         JOIN floors f ON f.id = r.floor_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND f.tenant_id = ?
         GROUP BY f.id, f.name
         ORDER BY total_amount DESC`,
        [from, to, tid]
      ),
      // 12. Consumption by category (for donut chart)
      query(
        `SELECT mc.name, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN minibar_categories mc ON mc.id = mp.category_id
         JOIN rooms r ON r.id = mm.room_id
                   WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}
         GROUP BY mc.id, mc.name`,
        [from, to, tid]
      ),
      // 13. Daily consumption (last 30 days for line chart)
      query(
        `SELECT DATE(mm.created_at) AS day, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND r.tenant_id = ?
         ${rFloor}
         GROUP BY DATE(mm.created_at)
         ORDER BY day ASC`,
        [tid]
      ),
      // 14. Top 10 products consumed
      query(
        `SELECT mp.name, SUM(mm.quantity_moved) AS total_qty,
                SUM(mm.quantity_moved * mp.price) AS total_amount
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ? ${rFloor}
         GROUP BY mp.id, mp.name
         ORDER BY total_qty DESC
         LIMIT 10`,
        [from, to, tid]
      ),
    ]);

    const [
      lossTypeBreakdown,
      topRooms,
      recentMovements,
      floorSummary,
      topProductLosses,
    ] = await Promise.all([
      // 15. Losses by type
      query(
        `SELECT mlri.loss_type,
                COUNT(*) AS total_items,
                COALESCE(SUM(mlri.total_price), 0) AS total_amount
         FROM minibar_loss_record_items mlri
         JOIN minibar_loss_records mlr ON mlr.id = mlri.minibar_loss_record_id
         WHERE mlr.registered_at >= ? AND mlr.registered_at <= ? AND mlr.tenant_id = ?
         GROUP BY mlri.loss_type`,
        [from, to, tid]
      ),
      // 16. Top 5 rooms by consumption
      query(
        `SELECT r.room_number, f.name AS floor_name,
                COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         JOIN floors f ON f.id = r.floor_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ?
         GROUP BY r.id, r.room_number, f.name
         ORDER BY total_amount DESC
         LIMIT 5`,
        [from, to, tid]
      ),
      // 17. Recent movements (last 10)
      query(
        `SELECT mm.movement_type, mm.quantity_moved, mm.created_at,
                mp.name AS product_name, mp.price AS product_price,
                r.room_number, f.name AS floor_name
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         JOIN floors f ON f.id = r.floor_id
         WHERE mm.movement_type != 'void' AND r.tenant_id = ?
         ORDER BY mm.created_at DESC
         LIMIT 10`,
        [tid]
      ),
      // 18. Floor summary
      query(
        `SELECT f.id AS floor_id, f.name AS floor_name,
                COUNT(DISTINCT r.id) AS total_rooms,
                COUNT(DISTINCT CASE WHEN cm.room_id IS NOT NULL THEN r.id END) AS rooms_with_consumption,
                COUNT(DISTINCT CASE WHEN lr.room_id IS NOT NULL THEN r.id END) AS rooms_with_losses,
                COUNT(DISTINCT CASE WHEN a.rmi_id IS NOT NULL THEN r.id END) AS rooms_with_agotados
         FROM floors f
         LEFT JOIN rooms r ON r.floor_id = f.id AND r.tenant_id = ?
         LEFT JOIN (
           SELECT DISTINCT mm.room_id FROM minibar_movements mm
           WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ?
         ) cm ON cm.room_id = r.id
         LEFT JOIN (
           SELECT DISTINCT mlr.room_id FROM minibar_loss_records mlr
           WHERE mlr.registered_at >= ? AND mlr.registered_at <= ?
         ) lr ON lr.room_id = r.id
         LEFT JOIN (
           SELECT DISTINCT rmi.room_id AS rmi_id FROM room_minibar_inventory rmi
           JOIN minibar_products mp ON mp.id = rmi.product_id
           WHERE rmi.quantity = 0 AND mp.is_active = 1
         ) a ON a.rmi_id = r.id
         WHERE f.tenant_id = ?
         GROUP BY f.id, f.name
         ORDER BY f.floor_number ASC`,
        [tid, from, to, from, to, tid]
      ),
      // 19. Products with most losses
      query(
        `SELECT mlri.product_name, mlri.loss_type,
                SUM(mlri.quantity) AS total_qty,
                COALESCE(SUM(mlri.total_price), 0) AS total_amount
         FROM minibar_loss_record_items mlri
         JOIN minibar_loss_records mlr ON mlr.id = mlri.minibar_loss_record_id
         WHERE mlr.registered_at >= ? AND mlr.registered_at <= ? AND mlr.tenant_id = ?
         GROUP BY mlri.product_name, mlri.loss_type
         ORDER BY total_qty DESC
         LIMIT 5`,
        [from, to, tid]
      ),
    ]);

    const today = todayConsumption[0];
    const period = periodConsumption[0];
    const prev = prevConsumption[0];

    const totalAmount = Number(period.total_amount);
    const prevAmount = Number(prev.total_amount);
    const variancePct = prevAmount > 0 ? ((totalAmount - prevAmount) / prevAmount) * 100 : 0;
    const todayAmount = Number(today.total_amount);

    const todayLoss = todayLosses[0];
    const periodLoss = periodLosses[0];

    const lossByType = {};
    for (const row of lossTypeBreakdown) {
      lossByType[row.loss_type] = {
        total_items: Number(row.total_items),
        total_amount: Number(row.total_amount),
      };
    }

    const alerts = [];
    const agotadosData = agotados[0];
    const pendingRooms = roomsPending[0];
    const lowStockData = lowStockRooms[0];

    if (Number(agotadosData.total_products) > 0) {
      const level = Number(agotadosData.total_products) >= 10 ? "critical" : Number(agotadosData.total_products) >= 5 ? "warning" : "normal";
      alerts.push({
        type: level,
        icon: "ph-package",
        message: `${agotadosData.total_products} productos agotados en ${agotadosData.total_rooms} habitaciones.`,
      });
    }
    if (Number(pendingRooms.total) > 0) {
      const level = Number(pendingRooms.total) >= 10 ? "warning" : "normal";
      alerts.push({
        type: level,
        icon: "ph-clock",
        message: `${pendingRooms.total} habitaciones pendientes de revisi\u00f3n.`,
      });
    }
    if (Number(lowStockData.total) > 0) {
      alerts.push({
        type: "warning",
        icon: "ph-warning",
        message: `${lowStockData.total} habitaciones con inventario bajo.`,
      });
    }
    if (floorBreakdown.length > 0) {
      alerts.push({
        type: "normal",
        icon: "ph-trend-up",
        message: `${floorBreakdown[0].name} presenta el mayor consumo del per\u00edodo.`,
      });
    }
    if (periodLoss.total_records > 0) {
      alerts.push({
        type: periodLoss.total_records >= 5 ? "critical" : "warning",
        icon: "ph-warning-circle",
        message: `${periodLoss.total_records} p\u00e9rdidas registradas por un total de ${formatCOP(periodLoss.total_amount)}.`,
      });
    }

    const floorSummaryMap = floorSummary.map(f => ({
      floor_id: f.floor_id,
      floor_name: f.floor_name,
      total_rooms: Number(f.total_rooms),
      rooms_with_consumption: Number(f.rooms_with_consumption),
      rooms_with_losses: Number(f.rooms_with_losses),
      rooms_with_agotados: Number(f.rooms_with_agotados),
      rooms_pending: Number(f.total_rooms) - Number(f.rooms_with_consumption),
      review_pct: Number(f.total_rooms) > 0
        ? Math.round((Number(f.rooms_with_consumption) / Number(f.total_rooms)) * 100)
        : 0,
    }));

    res.json({
      kpis: {
        today_amount: todayAmount,
        today_movements: Number(today.total_movements),
        today_products: Number(today.total_products),
        period_amount: totalAmount,
        period_movements: Number(period.total_movements),
        period_products: Number(period.total_products),
        variance_pct: Math.round(variancePct * 100) / 100,
        prev_period_amount: prevAmount,
        today_loss_amount: Number(todayLoss.total_amount),
        today_loss_records: Number(todayLoss.total_records),
        period_loss_amount: Number(periodLoss.total_amount),
        period_loss_records: Number(periodLoss.total_records),
        stolen_total: lossByType.perdida ? lossByType.perdida.total_items : 0,
        stolen_amount: lossByType.perdida ? lossByType.perdida.total_amount : 0,
        damaged_total: lossByType.dano ? lossByType.dano.total_items : 0,
        damaged_amount: lossByType.dano ? lossByType.dano.total_amount : 0,
        total_rooms: Number(totalRooms[0].total),
        rooms_with_consumption: Number(roomsWithConsumption[0].total),
        rooms_pending: Number(pendingRooms.total),
        agotados_products: Number(agotadosData.total_products),
        agotados_rooms: Number(agotadosData.total_rooms),
        low_stock_rooms: Number(lowStockData.total),
        top_floor: floorBreakdown.length > 0 ? floorBreakdown[0].name : null,
        top_room: topRooms.length > 0 ? topRooms[0].room_number : null,
      },
      charts: {
        floor_breakdown: floorBreakdown.map(f => ({
          name: f.name,
          total_amount: Number(f.total_amount),
          total_items: Number(f.total_items),
          total_movements: Number(f.total_movements),
        })),
        category_breakdown: categoryBreakdown.map(c => ({
          name: c.name,
          total_amount: Number(c.total_amount),
          total_items: Number(c.total_items),
        })),
        daily_consumption: dailyConsumption.map(d => ({
          day: d.day,
          total_amount: Number(d.total_amount),
          total_items: Number(d.total_items),
        })),
        top_products: topProducts.map(p => ({
          name: p.name,
          total_qty: Number(p.total_qty),
          total_amount: Number(p.total_amount),
        })),
        loss_by_type: [
          {
            type: "perdida",
            label: "Robados",
            total_items: lossByType.perdida ? lossByType.perdida.total_items : 0,
            total_amount: lossByType.perdida ? lossByType.perdida.total_amount : 0,
          },
          {
            type: "dano",
            label: "Da\u00f1ados",
            total_items: lossByType.dano ? lossByType.dano.total_items : 0,
            total_amount: lossByType.dano ? lossByType.dano.total_amount : 0,
          },
        ],
        top_rooms: topRooms.map(r => ({
          room_number: r.room_number,
          floor_name: r.floor_name,
          total_amount: Number(r.total_amount),
          total_items: Number(r.total_items),
        })),
      },
      alerts,
      floor_summary: floorSummaryMap,
      top_loss_products: topProductLosses.map(p => ({
        name: p.product_name,
        loss_type: p.loss_type,
        total_qty: Number(p.total_qty),
        total_amount: Number(p.total_amount),
      })),
      recent_movements: recentMovements.map(m => ({
        movement_type: m.movement_type,
        quantity_moved: Number(m.quantity_moved),
        product_name: m.product_name,
        room_number: m.room_number,
        floor_name: m.floor_name,
        created_at: m.created_at,
      })),
      filter: {
        from,
        to,
        period: filter,
      },
    });
  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).json({ error: "Error al cargar dashboard" });
  }
});

// GET /api/dashboard/movements — all movements (no limit, with pagination)
router.get("/movements", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [countRows] = await getDbPool().query(
      `SELECT COUNT(*) AS total FROM minibar_movements mm WHERE mm.movement_type != 'void' AND mm.tenant_id = ?`,
      [tid]
    );
    const total = countRows[0].total;

    const [movements] = await getDbPool().query(
      `SELECT mm.id, mm.movement_type, mm.quantity_moved, mm.created_at,
              mp.name AS product_name, mp.price AS product_price,
              r.room_number, f.name AS floor_name
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       JOIN floors f ON f.id = r.floor_id
       WHERE mm.movement_type != 'void' AND mm.tenant_id = ?
       ORDER BY mm.created_at DESC
       LIMIT ? OFFSET ?`,
      [tid, limit, offset]
    );

    res.json({
      movements: movements.map(function (m) {
        var label = m.movement_type;
        var typeLabels = { consumption: "Consumo", restock: "Reposici\u00f3n", perdida: "P\u00e9rdida", dano: "Da\u00f1o", adjustment: "Ajuste" };
        return {
          id: m.id,
          movement_type: m.movement_type,
          movement_label: typeLabels[label] || label,
          quantity_moved: Number(m.quantity_moved),
          product_name: m.product_name,
          product_price: m.product_price,
          room_number: m.room_number,
          floor_name: m.floor_name,
          created_at: m.created_at,
        };
      }),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error loading movements:", err);
    res.status(500).json({ error: "Error al cargar movimientos" });
  }
});

// GET /api/dashboard/calendar — month days with consumption totals
router.get("/calendar", async (req, res) => {
  try {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month format. Use YYYY-MM." });
    }
    const tid = Number(req.tenantId) || 1;
    const from = month + "-01 00:00:00";
    const nextMonth = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 1);
    const to = nextMonth.toISOString().split("T")[0] + " 00:00:00";

    const [days] = await getDbPool().query(
      `SELECT DATE(mm.created_at) AS day, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
              COUNT(*) AS total_movements, COUNT(DISTINCT mm.room_id) AS rooms_with_consumption
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at < ? AND r.tenant_id = ?
       GROUP BY DATE(mm.created_at)
       ORDER BY day ASC`,
      [from, to, tid]
    );

    const [totalRooms] = await getDbPool().query(
      "SELECT COUNT(*) AS total FROM rooms WHERE tenant_id = ?",
      [tid]
    );

    res.json({
      days: days.map(function (d) {
        return {
          day: d.day,
          total_amount: Number(d.total_amount),
          total_movements: Number(d.total_movements),
          rooms_with_consumption: Number(d.rooms_with_consumption),
        };
      }),
      total_rooms: Number(totalRooms[0].total),
      month: month,
    });
  } catch (err) {
    console.error("Error loading calendar:", err);
    res.status(500).json({ error: "Error al cargar calendario" });
  }
});

// GET /api/dashboard/calendar-day — detailed consumption for a specific day
router.get("/calendar-day", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }
    const tid = Number(req.tenantId) || 1;
    const from = date + " 00:00:00";
    const to = date + " 23:59:59";

    const [items] = await getDbPool().query(
      `SELECT r.room_number, mp.name AS product_name, mm.quantity_moved, mp.price AS product_price,
              (mm.quantity_moved * mp.price) AS total_price
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ?
       ORDER BY r.room_number, mp.name`,
      [from, to, tid]
    );

    const [totalRow] = await getDbPool().query(
      `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
              COUNT(DISTINCT mm.room_id) AS total_rooms_with_consumption
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND r.tenant_id = ?`,
      [from, to, tid]
    );

    res.json({
      date: date,
      total_amount: Number(totalRow[0].total_amount),
      total_rooms_with_consumption: Number(totalRow[0].total_rooms_with_consumption),
      items: items.map(function (item) {
        return {
          room_number: item.room_number,
          product_name: item.product_name,
          quantity_moved: Number(item.quantity_moved),
          product_price: Number(item.product_price),
          total_price: Number(item.total_price),
        };
      }),
    });
  } catch (err) {
    console.error("Error loading calendar day:", err);
    res.status(500).json({ error: "Error al cargar detalle del d\u00eda" });
  }
});

// GET /api/dashboard/smart-alerts
router.get("/smart-alerts", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const rawFloor = req.query.floor;
    let floorId = null;
    if (rawFloor !== void 0 && rawFloor !== null && rawFloor !== "") {
      const parsed = parseInt(rawFloor, 10);
      if (!isNaN(parsed) && parsed >= 0 && String(parsed) === String(rawFloor)) {
        floorId = parsed;
      }
    }
    const rFloor = floorId !== null ? "AND r.floor_id = " + floorId : "";
    const mvFloor = floorId !== null ? "AND mv_r.floor_id = " + floorId : "";
    const lossFloor = floorId !== null ? "AND mlr.floor_id = " + floorId : "";

    const [inventoryProducts, lastMovements, spikeData, lossPatterns, noConsumptionData] = await Promise.all([
      // Active products with inventory (quantity > 0)
      query(
        "SELECT mp.id, mp.name, COUNT(DISTINCT rmi.room_id) AS room_count, COALESCE(SUM(rmi.quantity), 0) AS total_stock FROM minibar_products mp JOIN room_minibar_inventory rmi ON rmi.product_id = mp.id JOIN rooms r ON r.id = rmi.room_id WHERE mp.is_active = 1 AND rmi.quantity > 0 AND r.tenant_id = ? " + rFloor + " GROUP BY mp.id, mp.name",
        [tid]
      ),
      // Latest movement per product
      query(
        "SELECT mm.product_id, MAX(mm.created_at) AS last_movement FROM minibar_movements mm JOIN rooms mv_r ON mv_r.id = mm.room_id WHERE mv_r.tenant_id = ? " + mvFloor + " GROUP BY mm.product_id",
        [tid]
      ),
      // Spike detection: rooms with consumption > 2x avg daily in last 24h
      query(
        "SELECT r.id AS room_id, r.room_number, f.name AS floor_name, COALESCE(SUM(CASE WHEN mm.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN mm.quantity_moved ELSE 0 END), 0) AS last_day_qty, COALESCE(SUM(mm.quantity_moved), 0) / 30 AS avg_daily FROM rooms r JOIN floors f ON f.id = r.floor_id LEFT JOIN minibar_movements mm ON mm.room_id = r.id AND mm.movement_type = 'consumption' AND mm.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE r.tenant_id = ? " + rFloor + " GROUP BY r.id, r.room_number, f.name HAVING last_day_qty > 0 AND last_day_qty > avg_daily * 2",
        [tid]
      ),
      // Loss patterns: products with >3 perdida records in a month
      query(
        "SELECT mlri.product_name, COUNT(*) AS loss_count, GROUP_CONCAT(DISTINCT mlri.loss_type) AS loss_types FROM minibar_loss_record_items mlri JOIN minibar_loss_records mlr ON mlr.id = mlri.minibar_loss_record_id WHERE mlri.loss_type = 'perdida' AND mlr.registered_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) AND mlr.tenant_id = ? " + lossFloor + " GROUP BY mlri.product_name HAVING loss_count > 3",
        [tid]
      ),
      // Rooms with no consumption for 3+ days
      query(
        "SELECT r.id AS room_id, r.room_number, f.name AS floor_name, COALESCE(DATEDIFF(NOW(), last_mv.last_date), 999) AS days_without FROM rooms r JOIN floors f ON f.id = r.floor_id LEFT JOIN (SELECT room_id, MAX(created_at) AS last_date FROM minibar_movements WHERE movement_type = 'consumption' GROUP BY room_id) last_mv ON last_mv.room_id = r.id WHERE r.tenant_id = ? " + rFloor + " HAVING days_without >= 3",
        [tid]
      ),
    ]);

    // Build stale products by category
    var now = new Date();
    var stale7 = [];
    var stale14 = [];
    var stale30 = [];
    var mvMap = {};
    for (var i = 0; i < lastMovements.length; i++) {
      mvMap[lastMovements[i].product_id] = lastMovements[i].last_movement;
    }
    for (var j = 0; j < inventoryProducts.length; j++) {
      var p = inventoryProducts[j];
      var lastMv = mvMap[p.id] || null;
      var daysInactive = lastMv ? Math.floor((now.getTime() - new Date(lastMv).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      var entry = {
        product_name: p.name,
        days_inactive: daysInactive,
        room_count: Number(p.room_count),
        total_stock: Number(p.total_stock),
      };
      if (daysInactive >= 30) {
        stale30.push(entry);
      } else if (daysInactive >= 14) {
        stale14.push(entry);
      } else if (daysInactive >= 7) {
        stale7.push(entry);
      }
    }

    // Build anomalies array
    var anomalies = [];
    for (var k = 0; k < spikeData.length; k++) {
      var s = spikeData[k];
      anomalies.push({
        type: "consumption_spike",
        severity: "warning",
        room_id: s.room_id,
        room_number: s.room_number,
        floor_name: s.floor_name,
        message: s.room_number + " (" + s.floor_name + ") — " + Number(s.last_day_qty).toFixed(0) + " unidades (promedio " + Number(s.avg_daily).toFixed(1) + ")",
        details: { last_day_qty: Number(s.last_day_qty), avg_daily: Number(s.avg_daily) },
      });
    }
    for (var l = 0; l < lossPatterns.length; l++) {
      var lp = lossPatterns[l];
      anomalies.push({
        type: "recurrent_loss",
        severity: "critical",
        product_name: lp.product_name,
        loss_count: Number(lp.loss_count),
        message: lp.product_name + " — " + lp.loss_count + " pérdidas en el último mes",
      });
    }
    for (var m = 0; m < noConsumptionData.length; m++) {
      var nc = noConsumptionData[m];
      anomalies.push({
        type: "no_consumption_3d",
        severity: "warning",
        room_id: nc.room_id,
        room_number: nc.room_number,
        floor_name: nc.floor_name,
        days_without: Number(nc.days_without),
        message: nc.room_number + " (" + nc.floor_name + ") — " + nc.days_without + " días sin consumo",
      });
    }

    var criticalCount = stale30.length;
    for (var n = 0; n < anomalies.length; n++) {
      if (anomalies[n].severity === "critical") criticalCount++;
    }

    res.json({
      stale_products: {
        days_7: stale7,
        days_14: stale14,
        days_30: stale30,
      },
      anomalies: anomalies,
      summary: {
        total_stale: stale7.length + stale14.length + stale30.length,
        total_anomalies: anomalies.length,
        critical_count: criticalCount,
      },
    });
  } catch (err) {
    console.error("Error loading smart alerts:", err);
    res.status(500).json({ error: "Error al cargar alertas inteligentes" });
  }
});

module.exports = router;
