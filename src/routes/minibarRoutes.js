const express = require("express");
const path = require("path");
const fs = require("fs");
const { PDFReport, fmtDateTimeLong, CW, MARGIN, TEXT_LIGHT } = require("../pdfHelper");
const ExcelJS = require("exceljs");
const router = express.Router();
const { query, getDbPool } = require("../config/db");
const { logAudit, getClientIp, getDeviceInfo } = require("../auditLogger");

function formatCOP(value) {
  const n = Number(value) || 0;
  return "$" + Math.round(n).toLocaleString("es-CO") + " COP";
}

function safeText(v) {
  return String(v ?? "").trim();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos d\u00edas, recepci\u00f3n.";
  if (hour < 18) return "Buenas tardes, recepci\u00f3n.";
  return "Buenas noches, recepci\u00f3n.";
}

function formatDate(d) {
  return d.toLocaleDateString("es-CO");
}

function formatTime(d) {
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

// GET /api/minibar/floors
router.get("/floors", async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, name, floor_number FROM floors ORDER BY floor_number ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching floors:", err);
    res.status(500).json({ error: "Error al cargar pisos" });
  }
});

// GET /api/minibar/rooms/:floorId
router.get("/rooms/:floorId", async (req, res) => {
  try {
    const raw = await query(
      `SELECT r.id, r.room_number,
        (SELECT COUNT(*) FROM room_minibar_inventory rmi WHERE rmi.room_id = r.id) > 0 AS has_inventory,
        (SELECT MAX(m.created_at) FROM minibar_movements m WHERE m.room_id = r.id) AS last_movement
      FROM rooms r WHERE r.floor_id = ? ORDER BY CAST(r.room_number AS UNSIGNED) ASC`,
      [req.params.floorId]
    );
    const rows = raw.map((r) => {
      let status = "idle";
      if (r.last_movement) {
        const hoursSince = (Date.now() - new Date(r.last_movement).getTime()) / 3600000;
        if (hoursSince < 6) status = "alert";
        else if (hoursSince < 24) status = "pending";
        else if (r.has_inventory) status = "ok";
      } else if (r.has_inventory) {
        status = "ok";
      }
      return { id: r.id, room_number: r.room_number, status, last_movement: r.last_movement };
    });
    res.json(rows);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ error: "Error al cargar habitaciones" });
  }
});

// GET /api/minibar/inventory/:roomId
router.get("/inventory/:roomId", async (req, res) => {
  try {
    const rows = await query(
      `SELECT
        rmi.id AS inventory_id,
        rmi.quantity,
        rmi.expiration_date,
        mp.id AS product_id,
        mp.name AS product_name,
        mp.price AS product_price,
        mp.default_quantity,
        mp.min_stock,
        mp.image_url,
        mc.id AS category_id,
        mc.name AS category_name
      FROM room_minibar_inventory rmi
      JOIN minibar_products mp ON mp.id = rmi.product_id
      JOIN minibar_categories mc ON mc.id = mp.category_id
      WHERE rmi.room_id = ?
      ORDER BY mc.display_order ASC, mp.display_order ASC`,
      [req.params.roomId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: "Error al cargar inventario" });
  }
});

// PUT /api/minibar/inventory/:inventoryId/expiration
router.put("/inventory/:inventoryId/expiration", async (req, res) => {
  try {
    const inventoryId = Number(req.params.inventoryId);
    const { expirationDate } = req.body;

    if (!inventoryId) return res.status(400).json({ error: "ID de inventario inválido" });

    await query(
      "UPDATE room_minibar_inventory SET expiration_date = ? WHERE id = ?",
      [expirationDate || null, inventoryId]
    );

    res.json({ success: true, message: "Fecha de vencimiento actualizada" });
  } catch (err) {
    console.error("Error updating expiration date:", err);
    res.status(500).json({ error: "Error al actualizar fecha de vencimiento" });
  }
});

// POST /api/minibar/consumption
router.post("/consumption", async (req, res) => {
  try {
    const { roomId, items } = req.body;
    if (!roomId) return res.status(400).json({ error: "Selecciona una habitaci\u00f3n" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Selecciona al menos un producto" });

    const userId = req.session?.user?.id || null;
    const userName = req.session?.user?.fullName || "Operador";

    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Get room info
      const [roomRows] = await conn.query(
        "SELECT r.room_number, f.name AS floor_name FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE r.id = ?",
        [roomId]
      );
      if (!roomRows || roomRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: "Habitaci\u00f3n no encontrada" });
      }
      const room = roomRows[0];

      // Validate and process each item
      const consumptionDetails = [];
      for (const item of items) {
        const productId = Number(item.productId);
        const qty = Number(item.quantity);
        if (!productId || !qty || qty <= 0) continue;

        // Get current inventory and product info
        const [invRows] = await conn.query(
          "SELECT quantity FROM room_minibar_inventory WHERE room_id = ? AND product_id = ?",
          [roomId, productId]
        );
        const currentQty = (invRows && invRows.length > 0) ? Number(invRows[0].quantity) : 0;

        const [prodRows] = await conn.query(
          "SELECT name, price FROM minibar_products WHERE id = ?",
          [productId]
        );
        if (!prodRows || prodRows.length === 0) continue;
        const product = prodRows[0];
        const newQty = Math.max(0, currentQty - qty);

        // Update inventory
        await conn.query(
          "UPDATE room_minibar_inventory SET quantity = ? WHERE room_id = ? AND product_id = ?",
          [newQty, roomId, productId]
        );

        // Record movement
        await conn.query(
          `INSERT INTO minibar_movements (room_id, product_id, movement_type, quantity_before, quantity_moved, quantity_after, user_id, user_name)
           VALUES (?, ?, 'consumption', ?, ?, ?, ?, ?)`,
          [roomId, productId, currentQty, qty, newQty, userId, userName]
        );

        consumptionDetails.push({
          name: product.name,
          price: Number(product.price),
          quantity: qty,
          lineTotal: qty * Number(product.price)
        });
      }

      if (consumptionDetails.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: "No se procesaron productos v\u00e1lidos" });
      }

      await conn.commit();

      // Generate WhatsApp message
      const now = new Date();
      const totalGeneral = consumptionDetails.reduce((sum, d) => sum + d.lineTotal, 0);

      const lines = [];
      lines.push(getGreeting());
      lines.push("");
      lines.push("Se reporta consumo de minibar:");
      lines.push("");
      lines.push("Habitaci\u00f3n: " + room.room_number);
      lines.push("Piso: " + room.floor_name);
      lines.push("Fecha: " + formatDate(now));
      lines.push("Hora: " + formatTime(now));
      lines.push("");
      lines.push("Productos consumidos:");
      for (const d of consumptionDetails) {
        lines.push("- " + d.name + " x" + d.quantity + " \u2014 " + formatCOP(d.lineTotal));
      }
      lines.push("");
      lines.push("Total consumo: " + formatCOP(totalGeneral));
      lines.push("");
      lines.push("Registrado por: " + userName);
      lines.push("");
      lines.push("Muchas gracias.");

      logAudit({
        userId,
        userName,
        userRole: req.session.user?.role,
        moduleName: "Minibares",
        actionType: "consumption_created",
        actionDescription: "Registró consumo de " + consumptionDetails.map(d => d.name + " x" + d.quantity).join(", "),
        roomId: Number(roomId),
        floorId: Number(room.floor_id),
        amount: totalGeneral,
        newData: { items: consumptionDetails },
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });

      res.json({
        success: true,
        message: "Consumo registrado correctamente",
        whatsappMessage: lines.join("\n"),
        details: consumptionDetails,
        total: totalGeneral,
        room: room.room_number,
        floor: room.floor_name
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Error registering consumption:", err);
    res.status(500).json({ error: "Error al registrar consumo" });
  }
});

// POST /api/minibar/restock
router.post("/restock", async (req, res) => {
  try {
    const { roomId, items } = req.body;
    if (!roomId) return res.status(400).json({ error: "Selecciona una habitaci\u00f3n" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Selecciona al menos un producto" });

    const userId = req.session?.user?.id || null;
    const userName = req.session?.user?.fullName || "Operador";
    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const restockDetails = [];
      for (const item of items) {
        const productId = Number(item.productId);
        const qty = Number(item.quantity);
        if (!productId || !qty || qty <= 0) continue;

        const [invRows] = await conn.query(
          "SELECT quantity, expiration_date FROM room_minibar_inventory WHERE room_id = ? AND product_id = ?",
          [roomId, productId]
        );
        const currentQty = (invRows && invRows.length > 0) ? Number(invRows[0].quantity) : 0;
        const newQty = currentQty + qty;

        const expDate = item.expirationDate || (invRows && invRows.length > 0 ? invRows[0].expiration_date : null);
        await conn.query(
          "UPDATE room_minibar_inventory SET quantity = ?, expiration_date = ? WHERE room_id = ? AND product_id = ?",
          [newQty, expDate || null, roomId, productId]
        );

        await conn.query(
          `INSERT INTO minibar_movements (room_id, product_id, movement_type, quantity_before, quantity_moved, quantity_after, user_id, user_name)
           VALUES (?, ?, 'restock', ?, ?, ?, ?, ?)`,
          [roomId, productId, currentQty, qty, newQty, userId, userName]
        );

        const [prodRows] = await conn.query("SELECT name FROM minibar_products WHERE id = ?", [productId]);
        restockDetails.push({
          name: prodRows[0]?.name || "Producto",
          quantity: qty,
          previousQty: currentQty,
          newQty
        });
      }

      if (restockDetails.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: "No se procesaron productos v\u00e1lidos" });
      }

      await conn.commit();

      logAudit({
        userId,
        userName,
        userRole: req.session?.user?.role,
        moduleName: "Reposición",
        actionType: "restock_created",
        actionDescription: "Repuso " + restockDetails.map(d => d.name + " x" + d.quantity).join(", "),
        roomId: Number(roomId),
        newData: { items: restockDetails },
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });

      res.json({ success: true, message: "Reposici\u00f3n guardada correctamente", details: restockDetails });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Error restocking:", err);
    res.status(500).json({ error: "Error al reponer productos" });
  }
});

// POST /api/minibar/adjust
router.post("/adjust", async (req, res) => {
  try {
    const { roomId, items } = req.body;
    if (!roomId) return res.status(400).json({ error: "Selecciona una habitaci\u00f3n" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Selecciona al menos un producto" });

    const userId = req.session?.user?.id || null;
    const userName = req.session?.user?.fullName || "Operador";
    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const adjustDetails = [];
      for (const item of items) {
        const productId = Number(item.productId);
        const newQty = Number(item.quantity);
        if (!productId || newQty < 0) continue;

        const [invRows] = await conn.query(
          "SELECT quantity FROM room_minibar_inventory WHERE room_id = ? AND product_id = ?",
          [roomId, productId]
        );
        const currentQty = (invRows && invRows.length > 0) ? Number(invRows[0].quantity) : 0;
        const moved = newQty - currentQty;

        await conn.query(
          "UPDATE room_minibar_inventory SET quantity = ? WHERE room_id = ? AND product_id = ?",
          [newQty, roomId, productId]
        );

        await conn.query(
          `INSERT INTO minibar_movements (room_id, product_id, movement_type, quantity_before, quantity_moved, quantity_after, user_id, user_name)
           VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?)`,
          [roomId, productId, currentQty, moved, newQty, userId, userName]
        );

        const [prodRows] = await conn.query("SELECT name FROM minibar_products WHERE id = ?", [productId]);
        adjustDetails.push({
          name: prodRows[0]?.name || "Producto",
          previousQty: currentQty,
          newQty,
          diff: moved
        });
      }

      if (adjustDetails.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: "No se procesaron productos v\u00e1lidos" });
      }

      await conn.commit();

      logAudit({
        userId,
        userName,
        userRole: req.session?.user?.role,
        moduleName: "Inventario",
        actionType: "inventory_adjusted",
        actionDescription: "Ajustó inventario: " + adjustDetails.map(d => d.name + " " + d.previousQty + "→" + d.newQty).join(", "),
        roomId: Number(roomId),
        newData: { items: adjustDetails },
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });

      res.json({ success: true, message: "Ajuste guardado correctamente", details: adjustDetails });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Error adjusting:", err);
    res.status(500).json({ error: "Error al ajustar inventario" });
  }
});

// GET /api/minibar/movements/:roomId
router.get("/movements/:roomId", async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const type = req.query.type ? String(req.query.type).trim() : '';
    const from = req.query.from ? String(req.query.from).trim() : '';
    const to = req.query.to ? String(req.query.to).trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['mm.room_id = ?'];
    const params = [roomId];

    if (search) {
      conditions.push('mp.name LIKE ?');
      params.push('%' + search + '%');
    }
    if (type) {
      conditions.push('mm.movement_type = ?');
      params.push(type);
    }
    if (from) {
      conditions.push('mm.created_at >= ?');
      params.push(from + ' 00:00:00');
    }
    if (to) {
      conditions.push('mm.created_at <= ?');
      params.push(to + ' 23:59:59');
    }

    const where = conditions.join(' AND ');

    const [[{ total }]] = await getDbPool().query(
      `SELECT COUNT(*) AS total FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE ${where}`,
      params
    );

    const rows = await query(
      `SELECT
        mm.id,
        mm.movement_type,
        mm.quantity_before,
        mm.quantity_moved,
        mm.quantity_after,
        mm.user_name,
        mm.notes,
        mm.created_at,
        mp.name AS product_name,
        mp.price AS product_price
      FROM minibar_movements mm
      JOIN minibar_products mp ON mp.id = mm.product_id
      WHERE ${where}
      ORDER BY mm.created_at DESC
      LIMIT ? OFFSET ?`,
      params.concat([limit, offset])
    );

    res.json({
      items: rows,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching movements:", err);
    res.status(500).json({ error: "Error al cargar historial" });
  }
});

// GET /api/minibar/reports
router.get("/reports", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });

    const params = [from + " 00:00:00", to + " 23:59:59", tid];

    // Get all consumptions in date range
    const movements = await query(
      `SELECT
        mm.id,
        mm.room_id,
        mm.product_id,
        mm.quantity_moved,
        mm.user_name,
        mm.created_at,
        mp.name AS product_name,
        mp.price AS product_price,
        mc.name AS category_name,
        r.room_number,
        f.name AS floor_name
      FROM minibar_movements mm
      JOIN minibar_products mp ON mp.id = mm.product_id
      JOIN minibar_categories mc ON mc.id = mp.category_id
      JOIN rooms r ON r.id = mm.room_id
      JOIN floors f ON f.id = r.floor_id
      WHERE mm.movement_type = 'consumption'
        AND mm.created_at >= ?
        AND mm.created_at <= ?
        AND mm.tenant_id = ?
      ORDER BY mm.created_at DESC`,
      params
    );

    if (!movements || movements.length === 0) {
      return res.json({
        items: [],
        summary: {
          totalAmount: 0,
          totalProducts: 0,
          totalMovements: 0,
          topRoom: null,
          bottomRoom: null,
          topFloor: null,
          bottomFloor: null,
          topProduct: null,
          bottomProduct: null,
          top5Rooms: [],
          bottom5Rooms: [],
          top2Floors: [],
          bottom2Floors: [],
          mostConsumedProducts: [],
          leastConsumedProducts: [],
          noConsumptionProducts: [],
          noConsumptionRooms: [],
          categoryBreakdown: [],
          roomBreakdown: [],
          floorBreakdown: [],
          generatedAt: new Date().toISOString()
        },
        observations: []
      });
    }

    const items = movements.map(m => ({
      ...m,
      lineTotal: Number(m.quantity_moved) * Number(m.product_price || 0)
    }));

    // === CALCULATIONS ===
    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
    const totalProducts = items.reduce((s, i) => s + Number(i.quantity_moved), 0);

    // By room
    const roomMap = new Map();
    for (const i of items) {
      const key = i.room_id;
      if (!roomMap.has(key)) {
        roomMap.set(key, { roomNumber: i.room_number, floorName: i.floor_name, total: 0, items: 0, count: 0, roomId: i.room_id });
      }
      const r = roomMap.get(key);
      r.total += i.lineTotal;
      r.items += Number(i.quantity_moved);
      r.count++;
    }
    const roomBreakdown = Array.from(roomMap.values()).sort((a, b) => b.total - a.total);

    // By floor
    const floorMap = new Map();
    for (const i of items) {
      const key = i.floor_name;
      if (!floorMap.has(key)) {
        floorMap.set(key, { floorName: key, total: 0, items: 0, count: 0 });
      }
      const f = floorMap.get(key);
      f.total += i.lineTotal;
      f.items += Number(i.quantity_moved);
      f.count++;
    }
    const floorBreakdown = Array.from(floorMap.values()).sort((a, b) => b.total - a.total);

    // By category
    const catMap = new Map();
    for (const i of items) {
      const key = i.category_name || "Sin categor\u00eda";
      if (!catMap.has(key)) {
        catMap.set(key, { name: key, total: 0, items: 0 });
      }
      const c = catMap.get(key);
      c.total += i.lineTotal;
      c.items += Number(i.quantity_moved);
    }
    const categoryBreakdown = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

    // By product
    const prodMap = new Map();
    for (const i of items) {
      const key = i.product_id;
      if (!prodMap.has(key)) {
        prodMap.set(key, { productId: key, name: i.product_name, total: 0, items: 0, price: Number(i.product_price) });
      }
      const p = prodMap.get(key);
      p.total += i.lineTotal;
      p.items += Number(i.quantity_moved);
    }
    const productBreakdown = Array.from(prodMap.values()).sort((a, b) => b.items - a.items);

    // Products without consumption
    const allProducts = await query("SELECT id, name, price FROM minibar_products WHERE is_active = 1 AND tenant_id = ?", [tid]);
    const consumedProductIds = new Set(items.map(i => i.product_id));
    const noConsumptionProducts = allProducts.filter(p => !consumedProductIds.has(p.id));

    // Rooms without consumption
    const consumedRoomIds = new Set(items.map(i => i.room_id));
    const allRooms = await query(
      "SELECT r.id, r.room_number, f.name AS floor_name FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE r.tenant_id = ?",
      [tid]
    );
    const noConsumptionRooms = allRooms.filter(r => !consumedRoomIds.has(r.id));

    // Rankings
    const top5Rooms = roomBreakdown.slice(0, 5);
    const bottom5Rooms = [...roomBreakdown].sort((a, b) => a.total - b.total).slice(0, 5);
    const top2Floors = floorBreakdown.slice(0, 2);
    const bottom2Floors = [...floorBreakdown].sort((a, b) => a.total - b.total).slice(0, 2);
    const mostConsumedProducts = productBreakdown.slice(0, 5);
    const leastConsumedProducts = [...productBreakdown].sort((a, b) => a.items - b.items).slice(0, 5);

    // Observations
    const observations = [];
    if (roomBreakdown.length > 0) {
      observations.push("La habitaci\u00f3n con mayor consumo fue la habitaci\u00f3n " + roomBreakdown[0].roomNumber + ".");
    }
    if (floorBreakdown.length > 0) {
      observations.push("El piso con mayor consumo fue " + floorBreakdown[0].floorName + ".");
    }
    if (productBreakdown.length > 0) {
      observations.push("El producto m\u00e1s consumido fue " + productBreakdown[0].name + ".");
    }
    if (categoryBreakdown.length > 0) {
      observations.push("La categor\u00eda con mayor consumo fue " + categoryBreakdown[0].name + ".");
    }
    if (noConsumptionRooms.length > 0) {
      observations.push("Se encontraron " + noConsumptionRooms.length + " habitaciones sin consumo durante el periodo seleccionado.");
    }
    observations.push("El total consumido durante el periodo fue de " + formatCOP(totalAmount) + ".");

    // Also count per-floor-room consumption rooms
    const roomsWithConsumption = new Set(items.map(i => i.room_id));
    const totalRoomsWithConsumption = roomsWithConsumption.size;

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Reportes",
      actionType: "report_generated",
      actionDescription: "Generó reporte de consumos del " + from + " al " + to,
      amount: totalAmount,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({
      items,
      summary: {
        totalAmount,
        totalProducts,
        totalMovements: items.length,
        totalRoomsWithConsumption,
        topRoom: roomBreakdown[0] || null,
        bottomRoom: roomBreakdown.length > 0 ? roomBreakdown[roomBreakdown.length - 1] : null,
        topFloor: floorBreakdown[0] || null,
        bottomFloor: floorBreakdown.length > 0 ? floorBreakdown[floorBreakdown.length - 1] : null,
        topProduct: productBreakdown[0] || null,
        bottomProduct: productBreakdown.length > 0 ? productBreakdown[productBreakdown.length - 1] : null,
        top5Rooms,
        bottom5Rooms,
        top2Floors,
        bottom2Floors,
        mostConsumedProducts,
        leastConsumedProducts,
        noConsumptionProducts,
        noConsumptionRooms,
        categoryBreakdown,
        roomBreakdown,
        floorBreakdown,
        generatedAt: new Date().toISOString()
      },
      observations
    });
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// Shared helper: compute period stats for compare endpoints
async function getPeriodStats(tid, from, to) {
  const params = [from + " 00:00:00", to + " 23:59:59", tid];

  const movements = await query(
    `SELECT
      mm.id, mm.room_id, mm.product_id, mm.quantity_moved,
      mp.name AS product_name, mp.price AS product_price,
      r.room_number, f.name AS floor_name
    FROM minibar_movements mm
    JOIN minibar_products mp ON mp.id = mm.product_id
    JOIN rooms r ON r.id = mm.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE mm.movement_type = 'consumption'
      AND mm.created_at >= ?
      AND mm.created_at <= ?
      AND mm.tenant_id = ?
    ORDER BY mm.created_at DESC`,
    params
  );

  const items = movements.map(m => ({
    ...m,
    lineTotal: Number(m.quantity_moved) * Number(m.product_price || 0)
  }));

  const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
  const totalMovements = items.length;
  const totalProducts = items.reduce((s, i) => s + Number(i.quantity_moved), 0);

  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1);
  const avgDaily = totalAmount / days;

  const roomSet = new Set(items.map(i => i.room_id));
  const roomsWithConsumption = roomSet.size;

  // Top products (by quantity)
  const prodMap = new Map();
  for (const i of items) {
    const key = i.product_id;
    if (!prodMap.has(key)) {
      prodMap.set(key, { productId: key, name: i.product_name, total: 0, items: 0 });
    }
    const p = prodMap.get(key);
    p.total += i.lineTotal;
    p.items += Number(i.quantity_moved);
  }
  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.items - a.items)
    .slice(0, 5)
    .map(p => ({ name: p.name, quantity: p.items, amount: p.total }));

  // Floor breakdown
  const floorMap = new Map();
  for (const i of items) {
    const key = i.floor_name;
    if (!floorMap.has(key)) {
      floorMap.set(key, { floorName: key, total: 0, items: 0, rooms: new Set() });
    }
    const f = floorMap.get(key);
    f.total += i.lineTotal;
    f.items += Number(i.quantity_moved);
    f.rooms.add(i.room_number);
  }
  const floorBreakdown = Array.from(floorMap.values())
    .sort((a, b) => b.total - a.total)
    .map(f => ({ floorName: f.floorName, total: f.total, items: f.items, rooms: f.rooms.size }));

  return {
    period: { from, to },
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalMovements,
    totalProducts,
    avgDaily: Math.round(avgDaily * 100) / 100,
    roomsWithConsumption,
    topProducts,
    floorBreakdown
  };
}

// GET /api/minibar/reports/compare
router.get("/reports/compare", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });

    const days = Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
    const fromDate = new Date(from);
    const prevFrom = new Date(fromDate);
    prevFrom.setDate(prevFrom.getDate() - days);
    const prevTo = new Date(fromDate);
    prevTo.setDate(prevTo.getDate() - 1);

    const prevFromStr = prevFrom.toISOString().split("T")[0];
    const prevToStr = prevTo.toISOString().split("T")[0];

    const current = await getPeriodStats(tid, from, to);
    const previous = await getPeriodStats(tid, prevFromStr, prevToStr);

    function calcChange(cur, prev) {
      const diff = cur - prev;
      const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
      return { change: Math.round(diff * 100) / 100, changePct: Math.round(pct * 100) / 100 };
    }

    const comparison = {
      amountChange: calcChange(current.totalAmount, previous.totalAmount).change,
      amountChangePct: calcChange(current.totalAmount, previous.totalAmount).changePct,
      movementsChange: calcChange(current.totalMovements, previous.totalMovements).change,
      movementsChangePct: calcChange(current.totalMovements, previous.totalMovements).changePct,
      productsChange: calcChange(current.totalProducts, previous.totalProducts).change,
      productsChangePct: calcChange(current.totalProducts, previous.totalProducts).changePct,
      avgDailyChange: calcChange(current.avgDaily, previous.avgDaily).change,
      avgDailyChangePct: calcChange(current.avgDaily, previous.avgDaily).changePct,
      roomsChange: calcChange(current.roomsWithConsumption, previous.roomsWithConsumption).change,
      roomsChangePct: calcChange(current.roomsWithConsumption, previous.roomsWithConsumption).changePct
    };

    res.json({ current, previous, comparison });
  } catch (err) {
    console.error("Error generating compare report:", err);
    res.status(500).json({ error: "Error al generar comparativa" });
  }
});

// GET /api/minibar/reports/compare-year
router.get("/reports/compare-year", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const prevFrom = new Date(fromDate);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo = new Date(toDate);
    prevTo.setFullYear(prevTo.getFullYear() - 1);

    const prevFromStr = prevFrom.toISOString().split("T")[0];
    const prevToStr = prevTo.toISOString().split("T")[0];

    const current = await getPeriodStats(tid, from, to);
    const previous = await getPeriodStats(tid, prevFromStr, prevToStr);

    function calcChange(cur, prev) {
      const diff = cur - prev;
      const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
      return { change: Math.round(diff * 100) / 100, changePct: Math.round(pct * 100) / 100 };
    }

    const comparison = {
      amountChange: calcChange(current.totalAmount, previous.totalAmount).change,
      amountChangePct: calcChange(current.totalAmount, previous.totalAmount).changePct,
      movementsChange: calcChange(current.totalMovements, previous.totalMovements).change,
      movementsChangePct: calcChange(current.totalMovements, previous.totalMovements).changePct,
      productsChange: calcChange(current.totalProducts, previous.totalProducts).change,
      productsChangePct: calcChange(current.totalProducts, previous.totalProducts).changePct,
      avgDailyChange: calcChange(current.avgDaily, previous.avgDaily).change,
      avgDailyChangePct: calcChange(current.avgDaily, previous.avgDaily).changePct,
      roomsChange: calcChange(current.roomsWithConsumption, previous.roomsWithConsumption).change,
      roomsChangePct: calcChange(current.roomsWithConsumption, previous.roomsWithConsumption).changePct
    };

    res.json({ current, previous, comparison });
  } catch (err) {
    console.error("Error generating compare-year report:", err);
    res.status(500).json({ error: "Error al generar comparativa anual" });
  }
});

// GET /api/minibar/reports/pdf
router.get("/reports/pdf", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });
    }

    // Use internal query instead
    const tid = Number(req.tenantId) || 1;
    const pool = getDbPool();
    const params = [from + " 00:00:00", to + " 23:59:59", tid];

    const movements = await query(
      `SELECT
        mm.id, mm.room_id, mm.product_id, mm.quantity_moved, mm.user_name, mm.created_at,
        mp.name AS product_name, mp.price AS product_price,
        mc.name AS category_name, r.room_number, f.name AS floor_name
      FROM minibar_movements mm
      JOIN minibar_products mp ON mp.id = mm.product_id
      JOIN minibar_categories mc ON mc.id = mp.category_id
      JOIN rooms r ON r.id = mm.room_id
      JOIN floors f ON f.id = r.floor_id
      WHERE mm.movement_type = 'consumption'
        AND mm.created_at >= ?
        AND mm.created_at <= ?
        AND mm.tenant_id = ?
      ORDER BY mm.created_at DESC`,
      params
    );

    const hasData = movements && movements.length > 0;

    // Calculate summary
    const items = movements.map(m => ({
      ...m,
      lineTotal: Number(m.quantity_moved) * Number(m.product_price || 0)
    }));

    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
    const totalProducts = items.reduce((s, i) => s + Number(i.quantity_moved), 0);

    const roomMap = new Map();
    for (const i of items) {
      const key = i.room_id;
      if (!roomMap.has(key)) roomMap.set(key, { roomNumber: i.room_number, floorName: i.floor_name, total: 0, items: 0, count: 0, roomId: i.room_id });
      const r = roomMap.get(key);
      r.total += i.lineTotal;
      r.items += Number(i.quantity_moved);
      r.count++;
    }
    const roomBreakdown = Array.from(roomMap.values()).sort((a, b) => b.total - a.total);

    const catMap = new Map();
    for (const i of items) {
      const key = i.category_name || "Sin categor\u00eda";
      if (!catMap.has(key)) catMap.set(key, { name: key, total: 0, items: 0 });
      const c = catMap.get(key);
      c.total += i.lineTotal;
      c.items += Number(i.quantity_moved);
    }
    const categoryBreakdown = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

    const prodMap = new Map();
    for (const i of items) {
      const key = i.product_id;
      if (!prodMap.has(key)) prodMap.set(key, { productId: key, name: i.product_name, category: i.category_name, total: 0, items: 0 });
      const p = prodMap.get(key);
      p.total += i.lineTotal;
      p.items += Number(i.quantity_moved);
    }
    const productBreakdown = Array.from(prodMap.values()).sort((a, b) => b.items - a.items);

    const floorMap = new Map();
    for (const i of items) {
      const key = i.floor_name;
      if (!floorMap.has(key)) floorMap.set(key, { floorName: key, total: 0, items: 0 });
      const f = floorMap.get(key);
      f.total += i.lineTotal;
      f.items += Number(i.quantity_moved);
    }
    const floorBreakdown = Array.from(floorMap.values()).sort((a, b) => b.total - a.total);

    const top5Rooms = roomBreakdown.slice(0, 5);
    const mostConsumedProducts = productBreakdown.slice(0, 5);

    // Generate PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="informe-consumos-${from}-${to}.pdf"`);

    const userDisplay = req.session?.user?.fullName || "Operador";

    const report = new PDFReport({
      title: "INFORME DE CONSUMOS DE MINIBAR",
      subtitle: "RoomTab Minibar App",
      dateFrom: from,
      dateTo: to,
      userName: userDisplay,
      skipCover: true,
    });

    report.pipe(res);

    let y = report.addPageHeader();

    // Extra header info: generation timestamp + user
    const doc = report.doc;
    doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_LIGHT);
    doc.text('Generado: ' + fmtDateTimeLong(report.generatedAt) + ' por ' + userDisplay, MARGIN + 46, MARGIN + 24, { width: CW - 46 });
    y = MARGIN + 44;

    // === 1. RESUMEN GENERAL ===
    y = report.addSectionTitle(1, "Resumen General", y);

    const topFloorName = floorBreakdown[0]?.floorName || 'N/A';
    const topRoomNum = roomBreakdown[0]?.roomNumber || 'N/A';
    const topProductName = productBreakdown[0]?.name || 'N/A';

    const execCards = [
      { label: "Total consumido", value: formatCOP(totalAmount) },
      { label: "Productos consumidos", value: String(totalProducts) },
      { label: "Habitaciones con consumo", value: String(roomBreakdown.length) },
      { label: "Piso con mayor consumo", value: topFloorName },
      { label: "Habitación con mayor consumo", value: topRoomNum },
      { label: "Producto más consumido", value: topProductName },
    ];
    y = report.drawExtendedSummaryCards(execCards, y);

    // === 2. CONSUMO POR PISO ===
    y = report.checkPageBreak(60, y);
    y = report.addSectionTitle(2, "Consumo por Piso", y);

    if (hasData) {
      const floorRoomCount = {};
      for (const i of items) {
        if (!floorRoomCount[i.floor_name]) floorRoomCount[i.floor_name] = new Set();
        floorRoomCount[i.floor_name].add(i.room_number);
      }

      const floorRows = floorBreakdown.map(f => [
        f.floorName,
        String(floorRoomCount[f.floorName]?.size || 0),
        formatCOP(f.total),
      ]);
      y = report.drawTable(
        [
          { label: 'Piso', align: 'left' },
          { label: 'Habitaciones con consumo', align: 'center' },
          { label: 'Total consumido', align: 'right' },
        ],
        floorRows,
        y,
        { widths: [CW * 0.25, CW * 0.38, CW * 0.37] }
      );
    } else {
      y = report.addBodyText("No se registraron consumos durante el periodo seleccionado.", y);
    }

    // === 3. TOP HABITACIONES CON MAYOR CONSUMO ===
    if (hasData && top5Rooms.length > 0) {
      y = report.checkPageBreak(100, y);
      y = report.addSectionTitle(3, "Top Habitaciones con Mayor Consumo", y);

      const topRoomRows = top5Rooms.map((r, i) => [
        String(i + 1),
        r.roomNumber,
        r.floorName,
        formatCOP(r.total),
      ]);
      y = report.drawTable(
        [
          { label: '#', align: 'center' },
          { label: 'Habitación', align: 'center' },
          { label: 'Piso', align: 'center' },
          { label: 'Total', align: 'right' },
        ],
        topRoomRows,
        y,
        { widths: [CW * 0.1, CW * 0.25, CW * 0.3, CW * 0.35] }
      );
    }

    // === 4. PRODUCTOS MÁS CONSUMIDOS ===
    if (hasData && mostConsumedProducts.length > 0) {
      y = report.checkPageBreak(100, y);
      y = report.addSectionTitle(4, "Productos Más Consumidos", y);

      const prodRows = mostConsumedProducts.map((p, i) => [
        String(i + 1),
        p.name,
        String(p.items),
        formatCOP(p.total),
      ]);
      y = report.drawTable(
        [
          { label: '#', align: 'center' },
          { label: 'Producto', align: 'left' },
          { label: 'Cantidad', align: 'center' },
          { label: 'Valor total', align: 'right' },
        ],
        prodRows,
        y,
        { widths: [CW * 0.08, CW * 0.45, CW * 0.17, CW * 0.3] }
      );
    }

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Reportes",
      actionType: "pdf_exported",
      actionDescription: "Exportó reporte de consumos en PDF del " + from + " al " + to,
      amount: totalAmount,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    report.finalize();
  } catch (err) {
    console.error("Error generating report PDF:", err);
    if (!res.headersSent) {
      res.status(500).send("Error al generar PDF");
    }
  }
});

// GET /api/minibar/reports/excel
router.get("/reports/excel", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });
    }

    const tid = Number(req.tenantId) || 1;
    const params = [from + " 00:00:00", to + " 23:59:59", tid];

    const movements = await query(
      `SELECT
        mm.id, mm.room_id, mm.product_id, mm.quantity_moved, mm.user_name, mm.created_at,
        mp.name AS product_name, mp.price AS product_price,
        mc.name AS category_name, r.room_number, f.name AS floor_name
      FROM minibar_movements mm
      JOIN minibar_products mp ON mp.id = mm.product_id
      JOIN minibar_categories mc ON mc.id = mp.category_id
      JOIN rooms r ON r.id = mm.room_id
      JOIN floors f ON f.id = r.floor_id
      WHERE mm.movement_type = 'consumption'
        AND mm.created_at >= ?
        AND mm.created_at <= ?
        AND mm.tenant_id = ?
      ORDER BY mm.created_at DESC`,
      params
    );

    if (!movements || movements.length === 0) {
      return res.status(404).send("No hay consumos en el rango seleccionado.");
    }

    const items = movements.map(m => ({
      ...m,
      lineTotal: Number(m.quantity_moved) * Number(m.product_price || 0)
    }));

    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
    const totalProducts = items.reduce((s, i) => s + Number(i.quantity_moved), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RoomTab Minibar";
    const primaryColorHex = "0B2E59";

    function styleHeader(ws, headers) {
      const row = ws.addRow(headers);
      row.font = { bold: true, color: { argb: "FFFFFF" }, size: 11, name: "Calibri" };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryColorHex } };
      row.alignment = { horizontal: "center", vertical: "middle" };
      row.height = 22;
      return row;
    }

    function addTitle(ws, title, mergeTo) {
      const row = ws.addRow([title]);
      row.font = { bold: true, size: 14, color: { argb: primaryColorHex }, name: "Calibri" };
      if (mergeTo) ws.mergeCells(1, 1, 1, mergeTo);
      row.height = 28;
    }

    // Sheet 1: Resumen general
    const ws1 = workbook.addWorksheet("Resumen general");
    addTitle(ws1, "INFORME DE CONSUMOS", 4);
    ws1.addRow([]);
    const displayFrom = new Date(from).toLocaleDateString("es-CO");
    const displayTo = new Date(to).toLocaleDateString("es-CO");
    ws1.addRow(["Rango de fechas:", displayFrom + " — " + displayTo]);
    ws1.addRow(["Generado:", new Date().toLocaleString("es-CO")]);
    ws1.addRow(["Usuario:", req.session?.user?.fullName || "Operador"]);
    ws1.addRow([]);

    styleHeader(ws1, ["Indicador", "Valor"]);
    ws1.addRow(["Total consumido", "$" + Math.round(totalAmount).toLocaleString("es-CO") + " COP"]);
    ws1.addRow(["Productos consumidos", totalProducts]);
    ws1.addRow(["Movimientos", items.length]);
    const roomsWithConsumption = new Set(items.map(i => i.room_id));
    ws1.addRow(["Habitaciones con consumo", roomsWithConsumption.size]);
    ws1.getColumn(1).width = 25;
    ws1.getColumn(2).width = 30;

    // Sheet 2: Detalle de consumos
    const ws2 = workbook.addWorksheet("Detalle de consumos");
    styleHeader(ws2, ["Fecha", "Hora", "Piso", "Habitación", "Producto", "Categoría", "Cantidad", "Precio unitario", "Total", "Usuario"]);
    for (const i of items) {
      const d = new Date(i.created_at);
      ws2.addRow([
        d.toLocaleDateString("es-CO"),
        d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
        i.floor_name,
        i.room_number,
        i.product_name,
        i.category_name,
        Number(i.quantity_moved),
        Number(i.product_price),
        i.lineTotal,
        i.user_name || ""
      ]);
    }
    ws2.getColumn(1).width = 14;
    ws2.getColumn(2).width = 10;
    ws2.getColumn(3).width = 12;
    ws2.getColumn(4).width = 12;
    ws2.getColumn(5).width = 22;
    ws2.getColumn(6).width = 16;
    ws2.getColumn(7).width = 10;
    ws2.getColumn(8).width = 16;
    ws2.getColumn(9).width = 16;
    ws2.getColumn(10).width = 20;

    // Sheet 3: Top 10 habitaciones
    const ws3 = workbook.addWorksheet("Top 10 habitaciones");
    const roomMap = new Map();
    for (const i of items) {
      const key = i.room_id;
      if (!roomMap.has(key)) roomMap.set(key, { roomNumber: i.room_number, floorName: i.floor_name, total: 0, items: 0 });
      const rm = roomMap.get(key);
      rm.total += i.lineTotal;
      rm.items += Number(i.quantity_moved);
    }
    const topRooms = Array.from(roomMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    styleHeader(ws3, ["Posición", "Habitación", "Piso", "Cantidad total", "Valor total"]);
    topRooms.forEach((rm, i) => {
      ws3.addRow([i + 1, rm.roomNumber, rm.floorName, rm.items, Number(rm.total)]);
    });
    ws3.getColumn(1).width = 10;
    ws3.getColumn(2).width = 14;
    ws3.getColumn(3).width = 12;
    ws3.getColumn(4).width = 14;
    ws3.getColumn(5).width = 16;

    // Sheet 4: Ranking de pisos
    const ws4 = workbook.addWorksheet("Ranking de pisos");
    const floorMap = new Map();
    for (const i of items) {
      if (!floorMap.has(i.floor_name)) floorMap.set(i.floor_name, { floorName: i.floor_name, total: 0, items: 0 });
      const f = floorMap.get(i.floor_name);
      f.total += i.lineTotal;
      f.items += Number(i.quantity_moved);
    }
    const floorsArr = Array.from(floorMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = totalAmount || 1;

    styleHeader(ws4, ["Posición", "Piso", "Cantidad total", "Valor total", "Porcentaje"]);
    floorsArr.forEach((f, i) => {
      const pct = Math.round((f.total / grandTotal) * 100);
      ws4.addRow([i + 1, f.floorName, f.items, Number(f.total), pct + "%"]);
    });
    ws4.getColumn(1).width = 10;
    ws4.getColumn(2).width = 14;
    ws4.getColumn(3).width = 14;
    ws4.getColumn(4).width = 16;
    ws4.getColumn(5).width = 12;

    // Sheet 5: Ranking de productos
    const ws5 = workbook.addWorksheet("Ranking de productos");
    const prodMap = new Map();
    for (const i of items) {
      if (!prodMap.has(i.product_id)) prodMap.set(i.product_id, { name: i.product_name, category: i.category_name, total: 0, items: 0 });
      const p = prodMap.get(i.product_id);
      p.total += i.lineTotal;
      p.items += Number(i.quantity_moved);
    }
    const productsArr = Array.from(prodMap.values()).sort((a, b) => b.total - a.total);

    styleHeader(ws5, ["Posición", "Producto", "Categoría", "Cantidad total", "Valor total"]);
    productsArr.forEach((p, i) => {
      ws5.addRow([i + 1, p.name, p.category, p.items, Number(p.total)]);
    });
    ws5.getColumn(1).width = 10;
    ws5.getColumn(2).width = 22;
    ws5.getColumn(3).width = 16;
    ws5.getColumn(4).width = 14;
    ws5.getColumn(5).width = 16;

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Reportes",
      actionType: "excel_exported",
      actionDescription: "Exportó reporte de consumos en Excel del " + from + " al " + to,
      amount: totalAmount,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="informe-consumos-${from}-${to}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error generating consumption Excel:", err);
    if (!res.headersSent) {
      res.status(500).send("Error al generar Excel");
    }
  }
});

// GET /api/minibar/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const today = new Date();
    const todayStart = today.toISOString().split("T")[0] + " 00:00:00";
    const todayEnd = today.toISOString().split("T")[0] + " 23:59:59";
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split("T")[0] + " 00:00:00";

    const [[todayConsumption]] = await getDbPool().query(
      `SELECT COUNT(*) AS movements, COALESCE(SUM(quantity_moved), 0) AS products,
              COALESCE(SUM(quantity_moved * mp.price), 0) AS total
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND mm.tenant_id = ?`,
      [todayStart, todayEnd, tid]
    );

    const [[weekConsumption]] = await getDbPool().query(
      `SELECT COUNT(*) AS movements, COALESCE(SUM(quantity_moved), 0) AS products,
              COALESCE(SUM(quantity_moved * mp.price), 0) AS total
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.tenant_id = ?`,
      [weekStartStr, tid]
    );

    const [[{ total: totalRooms }]] = await getDbPool().query("SELECT COUNT(*) AS total FROM rooms WHERE tenant_id = ?", [tid]);

    const [[{ total: lowStockRooms }]] = await getDbPool().query(
      `SELECT COUNT(DISTINCT rmi.room_id) AS total
       FROM room_minibar_inventory rmi
       JOIN minibar_products mp ON mp.id = rmi.product_id
       WHERE rmi.quantity <= 2 AND mp.is_active = 1 AND rmi.tenant_id = ?`,
      [tid]
    );

    const recentMovements = await query(
      `SELECT mm.id, mm.movement_type, mm.quantity_moved, mm.user_name, mm.created_at,
              mp.name AS product_name, r.room_number, f.name AS floor_name
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       JOIN floors f ON f.id = r.floor_id
       WHERE mm.movement_type != 'void' AND r.tenant_id = ?
       ORDER BY mm.created_at DESC LIMIT 5`,
      [tid]
    );

    const topProducts = await query(
      `SELECT mp.name, SUM(mm.quantity_moved) AS total_qty,
              SUM(mm.quantity_moved * mp.price) AS total_amount
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND mm.tenant_id = ?
       GROUP BY mp.id, mp.name
       ORDER BY total_qty DESC LIMIT 5`,
      [todayStart, todayEnd, tid]
    );

    res.json({
      today: todayConsumption,
      week: weekConsumption,
      totalRooms,
      lowStockRoomCount: lowStockRooms,
      recentMovements,
      topProducts
    });
  } catch (err) {
    console.error("Error fetching dashboard:", err);
    res.status(500).json({ error: "Error al cargar dashboard" });
  }
});

// GET /api/minibar/low-stock
router.get("/low-stock", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const rows = await query(
      `SELECT
        rmi.id AS inventory_id,
        rmi.quantity,
        mp.id AS product_id,
        mp.name AS product_name,
        mp.price AS product_price,
        mp.min_stock,
        mp.default_quantity,
        mp.image_url,
        mc.name AS category_name,
        r.room_number,
        f.name AS floor_name,
        f.id AS floor_id
      FROM room_minibar_inventory rmi
      JOIN minibar_products mp ON mp.id = rmi.product_id
      JOIN minibar_categories mc ON mc.id = mp.category_id
      JOIN rooms r ON r.id = rmi.room_id
      JOIN floors f ON f.id = r.floor_id
      WHERE rmi.quantity <= mp.min_stock
        AND mp.is_active = 1
        AND rmi.tenant_id = ?
      ORDER BY (rmi.quantity - mp.min_stock) ASC, f.floor_number ASC, r.room_number ASC`,
      [tid]
    );

    const summary = {
      total: rows.length,
      totalProducts: new Set(rows.map(function(r) { return r.product_id; })).size,
      totalRooms: new Set(rows.map(function(r) { return r.room_id; })).size,
      estimatedRestockCost: rows.reduce(function(sum, r) {
        var needed = Math.max(0, (r.min_stock || 2) - r.quantity);
        return sum + (needed * Number(r.product_price));
      }, 0)
    };

    res.json({ items: rows, summary: summary });
  } catch (err) {
    console.error("Error fetching low stock:", err);
    res.status(500).json({ error: "Error al cargar productos con stock bajo" });
  }
});

// POST /api/minibar/shopping-list
router.post("/shopping-list", async (req, res) => {
  try {
    const tid = Number(req.tenantId) || 1;
    const days = Math.max(1, Math.min(90, Number(req.body.days) || 7));

    // Get consumption stats per product for the period
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);
    const periodStartStr = periodStart.toISOString().split('T')[0] + ' 00:00:00';

    const consumptionStats = await query(
      `SELECT
        mp.id AS product_id,
        mp.name AS product_name,
        mp.price AS product_price,
        mp.min_stock,
        mp.default_quantity,
        mp.image_url,
        mc.name AS category_name,
        COALESCE(SUM(mm.quantity_moved), 0) AS total_consumed,
        COUNT(DISTINCT mm.room_id) AS rooms_affected
      FROM minibar_products mp
      JOIN minibar_categories mc ON mc.id = mp.category_id
      LEFT JOIN minibar_movements mm ON mm.product_id = mp.id
        AND mm.movement_type = 'consumption'
        AND mm.created_at >= ?
        AND mm.tenant_id = ?
      WHERE mp.is_active = 1 AND mp.tenant_id = ?
      GROUP BY mp.id, mp.name, mp.price, mp.min_stock, mp.default_quantity, mp.image_url, mc.name
      ORDER BY total_consumed DESC`,
      [periodStartStr, tid, tid]
    );

    // Get current inventory totals per product across all rooms
    const inventoryTotals = await query(
      `SELECT
        mp.id AS product_id,
        SUM(rmi.quantity) AS total_stock,
        COUNT(CASE WHEN rmi.quantity <= mp.min_stock THEN 1 END) AS low_stock_rooms,
        COUNT(DISTINCT rmi.room_id) AS rooms_with_product
      FROM minibar_products mp
      JOIN room_minibar_inventory rmi ON rmi.product_id = mp.id
      WHERE mp.is_active = 1 AND mp.tenant_id = ?
      GROUP BY mp.id`,
      [tid]
    );

    const invMap = {};
    for (const inv of inventoryTotals) {
      invMap[inv.product_id] = inv;
    }

    const items = [];
    for (const stat of consumptionStats) {
      const inv = invMap[stat.product_id] || { total_stock: 0, low_stock_rooms: 0, rooms_with_product: 0 };
      const minStock = Number(stat.min_stock) || 2;
      const avgConsumption = Math.ceil(Number(stat.total_consumed) / Math.max(1, days));
      const daysOfStock = avgConsumption > 0 ? Math.floor(Number(inv.total_stock) / avgConsumption) : 999;
      const recommendedOrder = Math.max(
        0,
        Math.ceil((avgConsumption * 7) - Number(inv.total_stock) + (minStock * Math.max(1, Number(inv.rooms_with_product))))
      );
      const urgency = Number(inv.low_stock_rooms) > 0 ? 'urgente' : (avgConsumption > 0 && daysOfStock < 7 ? 'pronto' : 'normal');

      items.push({
        product_id: stat.product_id,
        product_name: stat.product_name,
        product_price: Number(stat.product_price),
        category_name: stat.category_name,
        image_url: stat.image_url,
        total_stock: Number(inv.total_stock),
        min_stock: minStock,
        avg_daily_consumption: avgConsumption,
        days_of_stock: daysOfStock,
        low_stock_rooms: Number(inv.low_stock_rooms),
        total_rooms: Number(inv.rooms_with_product),
        total_consumed: Number(stat.total_consumed),
        recommended_order: recommendedOrder,
        estimated_cost: recommendedOrder * Number(stat.product_price),
        urgency: urgency
      });
    }

    const urgent = items.filter(function(i) { return i.urgency === 'urgente'; });
    const soon = items.filter(function(i) { return i.urgency === 'pronto'; });
    const normal = items.filter(function(i) { return i.urgency === 'normal'; });

    res.json({
      generated_at: new Date().toISOString(),
      period_days: days,
      summary: {
        total_products: items.length,
        total_estimated_cost: items.reduce(function(s, i) { return s + i.estimated_cost; }, 0),
        urgent_count: urgent.length,
        soon_count: soon.length,
        normal_count: normal.length,
        items_to_order: items.filter(function(i) { return i.recommended_order > 0; }).length
      },
      items: {
        urgent: urgent.filter(function(i) { return i.recommended_order > 0; }),
        soon: soon.filter(function(i) { return i.recommended_order > 0; }),
        normal: normal.filter(function(i) { return i.recommended_order > 0; })
      }
    });
  } catch (err) {
    console.error("Error generating shopping list:", err);
    res.status(500).json({ error: "Error al generar lista de compras" });
  }
});

module.exports = router;
