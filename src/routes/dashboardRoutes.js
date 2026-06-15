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
    const floorId = req.query.floor ? Number(req.query.floor) : null;
    const fFloor = floorId ? `AND f.id = ${floorId}` : "";
    const rFloor = floorId ? `AND r.floor_id = ${floorId}` : "";
    const lossFloor = floorId ? `AND floor_id = ${floorId}` : "";
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
      totalRooms,
      roomsWithConsumption,
      roomsPending,
      agotados,
      lowStockRooms,
      floorBreakdown,
      categoryBreakdown,
      dailyConsumption,
      topProducts,
      lossTypeBreakdown,
      topRooms,
      recentMovements,
      floorSummary,
      topProductLosses,
    ] = await Promise.all([
      // 1. Today consumption KPIs
      getDbPool().query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COUNT(*) AS total_movements,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_products
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}`,
        [todayStart, todayEnd]
      ),
      // 2. Period consumption KPIs
      getDbPool().query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COUNT(*) AS total_movements,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_products
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}`,
        [from, to]
      ),
      // 3. Previous period consumption for comparison
      getDbPool().query(
        `SELECT COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}`,
        [prevFromStr, prevToStr]
      ),
      // 4. Today losses
      getDbPool().query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_amount,
                COUNT(*) AS total_records
         FROM minibar_loss_records
         WHERE registered_at >= ? AND registered_at <= ? ${lossFloor}`,
        [todayStart, todayEnd]
      ),
      // 5. Period losses
      getDbPool().query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_amount,
                COUNT(*) AS total_records
         FROM minibar_loss_records
         WHERE registered_at >= ? AND registered_at <= ? ${lossFloor}`,
        [from, to]
      ),
      // 6. Total rooms
      query("SELECT COUNT(*) AS total FROM rooms"),
      // 7. Rooms with consumption (period)
      query(
        `SELECT COUNT(DISTINCT mm.room_id) AS total
         FROM minibar_movements mm
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}`,
        [from, to]
      ),
      // 8. Rooms without consumption (pending review)
      query(
        `SELECT COUNT(*) AS total FROM rooms r
         WHERE r.id NOT IN (
           SELECT DISTINCT mm.room_id FROM minibar_movements mm
           WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ?
         ) ${rFloor}`,
        [from, to]
      ),
      // 9. Agotados (quantity = 0)
      query(
        `SELECT COUNT(DISTINCT rmi.product_id) AS total_products,
                COUNT(DISTINCT rmi.room_id) AS total_rooms
         FROM room_minibar_inventory rmi
         JOIN minibar_products mp ON mp.id = rmi.product_id
         JOIN rooms r ON r.id = rmi.room_id
         WHERE rmi.quantity = 0 AND mp.is_active = 1 ${rFloor}`
      ),
      // 10. Low stock rooms (quantity <= 2)
      query(
        `SELECT COUNT(DISTINCT rmi.room_id) AS total
         FROM room_minibar_inventory rmi
         JOIN minibar_products mp ON mp.id = rmi.product_id
         JOIN rooms r ON r.id = rmi.room_id
         WHERE rmi.quantity <= 2 AND mp.is_active = 1 ${rFloor}`
      ),
      // 11. Consumption by floor (for bar chart)
      query(
        `SELECT f.name, f.id AS floor_id, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items,
                COUNT(*) AS total_movements
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         JOIN floors f ON f.id = r.floor_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ?
         GROUP BY f.id, f.name
         ORDER BY total_amount DESC`,
        [from, to]
      ),
      // 12. Consumption by category (for donut chart)
      query(
        `SELECT mc.name, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN minibar_categories mc ON mc.id = mp.category_id
         JOIN rooms r ON r.id = mm.room_id
                   WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}
         GROUP BY mc.id, mc.name`,
        [from, to]
      ),
      // 13. Daily consumption (last 30 days for line chart)
      query(
        `SELECT DATE(mm.created_at) AS day, COALESCE(SUM(mm.quantity_moved * mp.price), 0) AS total_amount,
                COALESCE(SUM(mm.quantity_moved), 0) AS total_items
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ${rFloor}
         GROUP BY DATE(mm.created_at)
         ORDER BY day ASC`
      ),
      // 14. Top 10 products consumed
      query(
        `SELECT mp.name, SUM(mm.quantity_moved) AS total_qty,
                SUM(mm.quantity_moved * mp.price) AS total_amount
         FROM minibar_movements mm
         JOIN minibar_products mp ON mp.id = mm.product_id
         JOIN rooms r ON r.id = mm.room_id
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? ${rFloor}
         GROUP BY mp.id, mp.name
         ORDER BY total_qty DESC
         LIMIT 10`,
        [from, to]
      ),
      // 15. Losses by type
      query(
        `SELECT mlri.loss_type,
                COUNT(*) AS total_items,
                COALESCE(SUM(mlri.total_price), 0) AS total_amount
         FROM minibar_loss_record_items mlri
         JOIN minibar_loss_records mlr ON mlr.id = mlri.minibar_loss_record_id
         WHERE mlr.registered_at >= ? AND mlr.registered_at <= ?
         GROUP BY mlri.loss_type`,
        [from, to]
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
         WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ?
         GROUP BY r.id, r.room_number, f.name
         ORDER BY total_amount DESC
         LIMIT 5`,
        [from, to]
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
         WHERE mm.movement_type != 'void'
         ORDER BY mm.created_at DESC
         LIMIT 10`
      ),
      // 18. Floor summary
      query(
        `SELECT f.id AS floor_id, f.name AS floor_name,
                COUNT(DISTINCT r.id) AS total_rooms,
                COUNT(DISTINCT CASE WHEN cm.room_id IS NOT NULL THEN r.id END) AS rooms_with_consumption,
                COUNT(DISTINCT CASE WHEN lr.room_id IS NOT NULL THEN r.id END) AS rooms_with_losses,
                COUNT(DISTINCT CASE WHEN a.rmi_id IS NOT NULL THEN r.id END) AS rooms_with_agotados
         FROM floors f
         LEFT JOIN rooms r ON r.floor_id = f.id
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
         GROUP BY f.id, f.name
         ORDER BY f.floor_number ASC`,
        [from, to, from, to]
      ),
      // 19. Products with most losses
      query(
        `SELECT mlri.product_name, mlri.loss_type,
                SUM(mlri.quantity) AS total_qty,
                COALESCE(SUM(mlri.total_price), 0) AS total_amount
         FROM minibar_loss_record_items mlri
         JOIN minibar_loss_records mlr ON mlr.id = mlri.minibar_loss_record_id
         WHERE mlr.registered_at >= ? AND mlr.registered_at <= ?
         GROUP BY mlri.product_name, mlri.loss_type
         ORDER BY total_qty DESC
         LIMIT 5`,
        [from, to]
      ),
    ]);

    const today = todayConsumption[0][0];
    const period = periodConsumption[0][0];
    const prev = prevConsumption[0][0];

    const totalAmount = Number(period.total_amount);
    const prevAmount = Number(prev.total_amount);
    const variancePct = prevAmount > 0 ? ((totalAmount - prevAmount) / prevAmount) * 100 : 0;
    const todayAmount = Number(today.total_amount);

    const todayLoss = todayLosses[0][0];
    const periodLoss = periodLosses[0][0];

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
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [countRows] = await getDbPool().query(
      `SELECT COUNT(*) AS total FROM minibar_movements WHERE movement_type != 'void'`
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
       WHERE mm.movement_type != 'void'
       ORDER BY mm.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
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

module.exports = router;
