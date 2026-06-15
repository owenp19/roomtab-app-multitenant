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

function formatDate(d) {
  return d.toLocaleDateString("es-CO");
}

const LOSS_TYPES = ["perdida", "dano"];

const LOSS_TYPE_LABELS = {
  perdida: "Perdida",
  dano: "Daño"
};

function getLossTypeLabel(type) {
  return LOSS_TYPE_LABELS[type] || type;
}

function formatTime(d) {
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

// Shared aggregation helpers (used by PDF and Excel)
function buildRoomBreakdown(items) {
  const map = new Map();
  for (const i of items) {
    const key = i.room_number + "|" + i.floor_name;
    if (!map.has(key)) map.set(key, { roomNumber: i.room_number, floorName: i.floor_name, total: 0, items: 0 });
    const r = map.get(key);
    r.total += Number(i.total_price);
    r.items += Number(i.quantity);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function buildFloorBreakdown(items) {
  const map = new Map();
  for (const i of items) {
    if (!map.has(i.floor_name)) map.set(i.floor_name, { floorName: i.floor_name, total: 0, items: 0, rooms: new Set() });
    const f = map.get(i.floor_name);
    f.total += Number(i.total_price);
    f.items += Number(i.quantity);
    f.rooms.add(i.room_number);
  }
  return Array.from(map.values()).map(f => ({ ...f, rooms: f.rooms.size })).sort((a, b) => b.total - a.total);
}

function buildProductBreakdown(items) {
  const map = new Map();
  for (const i of items) {
    const key = i.product_name + "|" + i.loss_type;
    if (!map.has(key)) map.set(key, { name: i.product_name, lossType: i.loss_type, lossTypeLabel: getLossTypeLabel(i.loss_type), categoryName: i.category_name, total: 0, items: 0 });
    const p = map.get(key);
    p.total += Number(i.total_price);
    p.items += Number(i.quantity);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function buildDateBreakdown(items) {
  const map = new Map();
  for (const i of items) {
    const d = new Date(i.registered_at).toLocaleDateString("es-CO");
    if (!map.has(d)) map.set(d, { date: d, total: 0, items: 0, rooms: new Set() });
    const day = map.get(d);
    day.total += Number(i.total_price);
    day.items += Number(i.quantity);
    day.rooms.add(i.room_number);
  }
  return Array.from(map.values()).sort((a, b) => b.items - a.items);
}

// GET /api/perdidas/floors
router.get("/floors", async (req, res) => {
  try {
    const floors = await query("SELECT id, name, floor_number FROM floors ORDER BY floor_number ASC");
    res.json(floors);
  } catch (err) {
    console.error("Error fetching floors:", err);
    res.status(500).json({ error: "Error al cargar pisos" });
  }
});

// GET /api/perdidas/rooms/:floorId
router.get("/rooms/:floorId", async (req, res) => {
  try {
    const rooms = await query(
      "SELECT r.id, r.room_number, f.name AS floor_name FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE r.floor_id = ? ORDER BY r.room_number ASC",
      [req.params.floorId]
    );
    res.json(rooms);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ error: "Error al cargar habitaciones" });
  }
});

// GET /api/perdidas/inventory/:roomId
router.get("/inventory/:roomId", async (req, res) => {
  try {
    const inventory = await query(
      `SELECT rmi.id, rmi.quantity AS current_qty, rmi.expiration_date,
              mp.id AS product_id, mp.name AS product_name, mp.price,
              mc.name AS category_name, mc.display_order AS cat_order,
              mp.display_order AS prod_order
       FROM room_minibar_inventory rmi
       JOIN minibar_products mp ON mp.id = rmi.product_id
       JOIN minibar_categories mc ON mc.id = mp.category_id
       WHERE rmi.room_id = ? AND mp.is_active = 1
       ORDER BY mc.display_order ASC, mp.display_order ASC`,
      [req.params.roomId]
    );
    res.json(inventory);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: "Error al cargar inventario" });
  }
});

// POST /api/perdidas/register
router.post("/register", async (req, res) => {
  try {
    const { floorId, roomId, items, notes } = req.body;

    if (!floorId) return res.status(400).json({ error: "Selecciona un piso." });
    if (!roomId) return res.status(400).json({ error: "Selecciona una habitación." });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Selecciona al menos un producto." });
    }

    const userId = req.session?.user?.id || null;
    const userFullName = req.session?.user?.fullName || "Operador";
    const pool = getDbPool();

    for (const item of items) {
      if (!item.lossType || !LOSS_TYPES.includes(item.lossType)) {
        return res.status(400).json({ error: "Selecciona el tipo de novedad para " + (item.productName || "un producto") + "." });
      }
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        return res.status(400).json({ error: "La cantidad debe ser mayor a cero para " + (item.productName || "un producto") + "." });
      }
      const price = Number(item.unitPrice);
      if (!price || price <= 0) {
        return res.status(400).json({ error: "Este producto no tiene precio configurado: " + (item.productName || "") + "." });
      }
      if (qty > Number(item.currentQty)) {
        return res.status(400).json({ error: "La cantidad no puede superar el inventario disponible para " + (item.productName || "") + "." });
      }
    }

    const totalAmount = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitPrice), 0);

    // Insert loss record
    const status = req.body.status || "pendiente";
    const [recordResult] = await pool.query(
      "INSERT INTO minibar_loss_records (room_id, floor_id, user_id, total_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [roomId, floorId, userId, totalAmount, status, notes || null]
    );
    const recordId = recordResult.insertId;

    // Insert items and update inventory & movements
    for (const item of items) {
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice);
      const totalPrice = qty * price;

      await pool.query(
        "INSERT INTO minibar_loss_record_items (minibar_loss_record_id, product_id, product_name, category_name, loss_type, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [recordId, item.productId, item.productName, item.categoryName, item.lossType, qty, price, totalPrice, item.notes || null]
      );

      // Get current inventory quantity
      const [[invRow]] = await pool.query(
        "SELECT quantity FROM room_minibar_inventory WHERE room_id = ? AND product_id = ?",
        [roomId, item.productId]
      );
      const qtyBefore = invRow ? Number(invRow.quantity) : 0;
      const qtyAfter = Math.max(0, qtyBefore - qty);

      // Update inventory
      await pool.query(
        "UPDATE room_minibar_inventory SET quantity = ? WHERE room_id = ? AND product_id = ?",
        [qtyAfter, roomId, item.productId]
      );

      // Insert movement record
      await pool.query(
        "INSERT INTO minibar_movements (room_id, product_id, movement_type, quantity_before, quantity_moved, quantity_after, user_id, user_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [roomId, item.productId, item.lossType, qtyBefore, qty, qtyAfter, userId, userFullName, "Novedad: " + getLossTypeLabel(item.lossType) + (item.notes ? " - " + item.notes : "")]
      );
    }

    logAudit({
      userId,
      userName: userFullName,
      userRole: req.session?.user?.role,
      moduleName: "Pérdidas",
      actionType: items.some(i => i.lossType === "dano") ? "damage_created" : "loss_created",
      actionDescription: "Registró " + items.map(i => i.productName + " x" + i.quantity + " (" + getLossTypeLabel(i.lossType) + ")").join(", "),
      roomId: Number(roomId),
      floorId: Number(floorId),
      amount: totalAmount,
      newData: { items, notes },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, message: "Pérdida registrada correctamente. Inventario actualizado.", recordId });
  } catch (err) {
    console.error("Error registering loss:", err);
    res.status(500).json({ error: "Error al registrar la pérdida." });
  }
});

// GET /api/perdidas/report
router.get("/report", async (req, res) => {
  try {
    const { from, to, page, limit: pageLimit } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });
    }

    const fromStr = from + " 00:00:00";
    const toStr = to + " 23:59:59";
    const offset = page ? (Number(page) - 1) * Number(pageLimit || 50) : 0;
    const lim = Number(pageLimit || 50);

    // Get total count for pagination
    const [[{ totalCount }]] = await getDbPool().query(
      `SELECT COUNT(*) AS totalCount FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?`,
      [fromStr, toStr]
    );

    // Get detailed records
    const records = await query(
      `SELECT lri.id, lri.product_name, lri.category_name, lri.loss_type, lri.quantity,
              lri.unit_price, lri.total_price, lri.notes AS item_notes,
              lr.id AS record_id, lr.total_amount, lr.notes AS record_notes, lr.registered_at,
              r.room_number, f.name AS floor_name,
              u.full_name AS user_name
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN floors f ON f.id = lr.floor_id
       LEFT JOIN users u ON u.id = lr.user_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       ORDER BY lr.registered_at DESC
       LIMIT ? OFFSET ?`,
      [fromStr, toStr, lim, offset]
    );

    // Summary
    const [[summary]] = await getDbPool().query(
      `SELECT
         COUNT(DISTINCT lr.id) AS totalRecords,
         COALESCE(SUM(lri.quantity), 0) AS totalProducts,
         COALESCE(SUM(lri.total_price), 0) AS totalAmount,
         COALESCE(SUM(CASE WHEN lri.loss_type = 'perdida' THEN lri.quantity ELSE 0 END), 0) AS perdidaCount,
         COALESCE(SUM(CASE WHEN lri.loss_type = 'dano' THEN lri.quantity ELSE 0 END), 0) AS danoCount,
         COALESCE(SUM(CASE WHEN lri.loss_type = 'perdida' THEN lri.total_price ELSE 0 END), 0) AS perdidaAmount,
         COALESCE(SUM(CASE WHEN lri.loss_type = 'dano' THEN lri.total_price ELSE 0 END), 0) AS danoAmount
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?`,
      [fromStr, toStr]
    );

    // Top 10 rooms
    const topRooms = await query(
      `SELECT r.room_number, f.name AS floor_name,
              SUM(lri.quantity) AS totalQty,
              SUM(lri.total_price) AS totalAmount,
              DATE(lr.registered_at) AS criticalDate
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN floors f ON f.id = lr.floor_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       GROUP BY lr.room_id, r.room_number, f.name
       ORDER BY totalAmount DESC LIMIT 10`,
      [fromStr, toStr]
    );

    // Floor ranking
    const floorRanking = await query(
      `SELECT f.name AS floor_name,
              COUNT(DISTINCT lr.room_id) AS affectedRooms,
              SUM(lri.quantity) AS totalQty,
              SUM(lri.total_price) AS totalAmount
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       JOIN floors f ON f.id = lr.floor_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       GROUP BY lr.floor_id, f.name
       ORDER BY totalAmount DESC`,
      [fromStr, toStr]
    );

    // Add percentage to floor ranking
    const grandTotal = Number(summary.totalAmount) || 1;
    const floorRankingWithPct = floorRanking.map(f => ({
      ...f,
      percentage: Math.round((Number(f.totalAmount) / grandTotal) * 100)
    }));

    // Product ranking
    const productRanking = await query(
      `SELECT lri.product_name, lri.category_name, lri.loss_type,
              SUM(lri.quantity) AS totalQty,
              SUM(lri.total_price) AS totalAmount
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       GROUP BY lri.product_name, lri.category_name, lri.loss_type
       ORDER BY totalAmount DESC`,
      [fromStr, toStr]
    );

    // Most common by each loss type
    const [[mostPerdida]] = await getDbPool().query(
      `SELECT product_name, SUM(quantity) AS totalQty
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ? AND lri.loss_type = 'perdida'
       GROUP BY product_name ORDER BY totalQty DESC LIMIT 1`,
      [fromStr, toStr]
    );

    const [[mostDano]] = await getDbPool().query(
      `SELECT product_name, SUM(quantity) AS totalQty
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ? AND lri.loss_type = 'dano'
       GROUP BY product_name ORDER BY totalQty DESC LIMIT 1`,
      [fromStr, toStr]
    );

    // Peak date
    const [[peakDate]] = await getDbPool().query(
      `SELECT DATE(lr.registered_at) AS peak_date,
              SUM(lri.quantity) AS totalQty,
              SUM(lri.total_price) AS totalAmount,
              COUNT(DISTINCT lr.room_id) AS affectedRooms
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       GROUP BY DATE(lr.registered_at)
       ORDER BY totalQty DESC LIMIT 1`,
      [fromStr, toStr]
    );

    // Peak date room details
    let peakDateRooms = [];
    if (peakDate && peakDate.peak_date) {
      peakDateRooms = await query(
        `SELECT DISTINCT r.room_number
         FROM minibar_loss_records lr
         JOIN rooms r ON r.id = lr.room_id
         WHERE lr.registered_at >= ? AND lr.registered_at <= ? AND DATE(lr.registered_at) = ?`,
        [fromStr, toStr, peakDate.peak_date]
      );
    }

    res.json({
      records,
      summary,
      totalCount,
      topRooms,
      floorRanking: floorRankingWithPct,
      productRanking,
      mostPerdida: mostPerdida || null,
      mostDano: mostDano || null,
      peakDate: peakDate || null,
      peakDateRooms: peakDateRooms.map(r => r.room_number),
      page: Number(page || 1),
      limit: lim
    });
  } catch (err) {
    console.error("Error generating loss report:", err);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /api/perdidas/report/pdf
router.get("/report/pdf", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });
    }

    const fromStr = from + " 00:00:00";
    const toStr = to + " 23:59:59";

    // All records for PDF
    const records = await query(
      `SELECT lri.id, lri.product_name, lri.category_name, lri.loss_type, lri.quantity,
              lri.unit_price, lri.total_price, lri.notes AS item_notes,
              lr.total_amount, lr.registered_at,
              r.room_number, f.name AS floor_name,
              u.full_name AS user_name
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN floors f ON f.id = lr.floor_id
       LEFT JOIN users u ON u.id = lr.user_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       ORDER BY lr.registered_at DESC`,
      [fromStr, toStr]
    );

    const hasData = records && records.length > 0;
    const items = (records || []).map(m => ({
      ...m,
      lineTotal: Number(m.total_price)
    }));

    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
    const totalProducts = items.reduce((s, i) => s + Number(i.quantity), 0);

    const typeCounts = {};
    for (const t of LOSS_TYPES) {
      typeCounts[t] = items.filter(i => i.loss_type === t).reduce((s, i) => s + Number(i.quantity), 0);
    }

    const roomBreakdown = buildRoomBreakdown(items);
    const floorBreakdown = buildFloorBreakdown(items);
    const productBreakdown = buildProductBreakdown(items);
    // Generate PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="informe-perdidas-${from}-${to}.pdf"`);

    const userDisplay = req.session?.user?.fullName || "Operador";

    const report = new PDFReport({
      title: "INFORME DE PÉRDIDAS DE MINIBAR",
      subtitle: "RoomTab Minibar App",
      dateFrom: from,
      dateTo: to,
      userName: userDisplay,
      skipCover: true,
    });

    report.pipe(res);

    let y = report.addPageHeader();

    // Extra header info
    const doc = report.doc;
    doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_LIGHT);
    doc.text('Generado: ' + fmtDateTimeLong(report.generatedAt) + ' por ' + userDisplay, MARGIN + 46, MARGIN + 24, { width: CW - 46 });
    y = MARGIN + 44;

    // === 1. RESUMEN GENERAL ===
    y = report.addSectionTitle(1, "Resumen General", y);

    const topLossRoom = roomBreakdown[0]?.roomNumber || 'N/A';
    const topLossFloor = floorBreakdown[0]?.floorName || 'N/A';
    const topLossProduct = productBreakdown[0]?.name || 'N/A';

    const perdidaCount = typeCounts['perdida'] || 0;
    const danoCount = typeCounts['dano'] || 0;

    const execCards = [
      { label: "Total pérdidas", value: formatCOP(totalAmount) },
      { label: "Productos afectados", value: String(totalProducts) },
      { label: "Registros", value: String(records ? records.length : 0) },
      { label: "Hab. con más pérdidas", value: topLossRoom },
      { label: "Piso con más pérdidas", value: topLossFloor },
      { label: "Producto con más novedades", value: topLossProduct },
    ];
    y = report.drawExtendedSummaryCards(execCards, y);

    // === 2. PÉRDIDAS POR PISO ===
    y = report.checkPageBreak(60, y);
    y = report.addSectionTitle(2, "Pérdidas por Piso", y);

    if (hasData) {
      const grandTotalAmt = totalAmount || 1;
      const floorRows = floorBreakdown.map((f, idx) => [
        String(idx + 1) + '. ' + f.floorName,
        String(f.rooms),
        String(f.items),
        formatCOP(f.total),
        Math.round((f.total / grandTotalAmt) * 100) + '%',
      ]);
      y = report.drawTable(
        [
          { label: 'Piso', align: 'left' },
          { label: 'Habs. afectadas', align: 'center' },
          { label: 'Productos', align: 'center' },
          { label: 'Valor total', align: 'right' },
          { label: '%', align: 'right' },
        ],
        floorRows,
        y,
        { widths: [CW * 0.28, CW * 0.16, CW * 0.14, CW * 0.24, CW * 0.18] }
      );
    } else {
      y = report.addBodyText("No se registraron pérdidas durante el periodo seleccionado.", y);
    }

    // === 3. TOP HABITACIONES CON PÉRDIDAS ===
    if (hasData && roomBreakdown.length > 0) {
      y = report.checkPageBreak(100, y);
      y = report.addSectionTitle(3, "Top Habitaciones con Pérdidas", y);

      const topRoomRows = roomBreakdown.slice(0, 5).map((r, i) => [
        String(i + 1),
        r.roomNumber,
        r.floorName,
        String(r.items),
        formatCOP(r.total),
      ]);
      y = report.drawTable(
        [
          { label: '#', align: 'center' },
          { label: 'Habitación', align: 'center' },
          { label: 'Piso', align: 'center' },
          { label: 'Productos', align: 'center' },
          { label: 'Valor total', align: 'right' },
        ],
        topRoomRows,
        y,
        { widths: [CW * 0.08, CW * 0.2, CW * 0.2, CW * 0.18, CW * 0.34] }
      );
    }

    // === 4. PRODUCTOS CON MÁS NOVEDADES ===
    if (hasData && productBreakdown.length > 0) {
      y = report.checkPageBreak(100, y);
      y = report.addSectionTitle(4, "Productos con Más Novedades", y);

      const prodRows = productBreakdown.slice(0, 5).map((p, i) => [
        String(i + 1),
        p.name,
        p.lossTypeLabel || '\u2014',
        String(p.items),
        formatCOP(p.total),
      ]);
      y = report.drawTable(
        [
          { label: '#', align: 'center' },
          { label: 'Producto', align: 'left' },
          { label: 'Tipo', align: 'center' },
          { label: 'Cantidad', align: 'center' },
          { label: 'Valor total', align: 'right' },
        ],
        prodRows,
        y,
        { widths: [CW * 0.07, CW * 0.38, CW * 0.13, CW * 0.14, CW * 0.28] }
      );
    }

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Reportes",
      actionType: "pdf_exported",
      actionDescription: "Exportó reporte de pérdidas en PDF del " + from + " al " + to,
      amount: totalAmount,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    report.finalize();
  } catch (err) {
    console.error("Error generating loss PDF:", err);
    if (!res.headersSent) {
      res.status(500).send("Error al generar PDF");
    }
  }
});

// GET /api/perdidas/report/excel
router.get("/report/excel", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "Debes seleccionar fecha inicial y final" });
    }

    const fromStr = from + " 00:00:00";
    const toStr = to + " 23:59:59";

    const records = await query(
      `SELECT lri.id, lri.product_name, lri.category_name, lri.loss_type, lri.quantity,
              lri.unit_price, lri.total_price, lri.notes AS item_notes,
              lr.total_amount AS record_total, lr.registered_at,
              r.room_number, f.name AS floor_name,
              u.full_name AS user_name
       FROM minibar_loss_record_items lri
       JOIN minibar_loss_records lr ON lr.id = lri.minibar_loss_record_id
       JOIN rooms r ON r.id = lr.room_id
       JOIN floors f ON f.id = lr.floor_id
       LEFT JOIN users u ON u.id = lr.user_id
       WHERE lr.registered_at >= ? AND lr.registered_at <= ?
       ORDER BY lr.registered_at DESC`,
      [fromStr, toStr]
    );

    if (!records || records.length === 0) {
      return res.status(404).send("No se encontraron pérdidas registradas en el rango de fechas seleccionado.");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RoomTab Minibar";
    const primaryColorHex = "0B2E59";

    // Helper to style header row
    function styleHeader(ws, headers) {
      const row = ws.addRow(headers);
      row.font = { bold: true, color: { argb: "FFFFFF" }, size: 11, name: "Calibri" };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primaryColorHex } };
      row.alignment = { horizontal: "center", vertical: "middle" };
      row.height = 22;
      return row;
    }

    // Helper to add a styled title
    function addTitle(ws, title, mergeTo) {
      const row = ws.addRow([title]);
      row.font = { bold: true, size: 14, color: { argb: primaryColorHex }, name: "Calibri" };
      if (mergeTo) ws.mergeCells(1, 1, 1, mergeTo);
      row.height = 28;
    }

    // Sheet 1: Resumen general
    const ws1 = workbook.addWorksheet("Resumen general");
    addTitle(ws1, "INFORME DE PÉRDIDAS", 4);
    ws1.addRow([]);
    const displayFrom = new Date(from).toLocaleDateString("es-CO");
    const displayTo = new Date(to).toLocaleDateString("es-CO");
    ws1.addRow(["Rango de fechas:", displayFrom + " — " + displayTo]);
    ws1.addRow(["Generado:", new Date().toLocaleString("es-CO")]);
    ws1.addRow(["Usuario:", req.session?.user?.fullName || "Operador"]);
    ws1.addRow([]);

    const totalAmount = records.reduce((s, r) => s + Number(r.total_price), 0);
    const typeCounts = {};
    for (const t of LOSS_TYPES) {
      typeCounts[t] = records.filter(r => r.loss_type === t).reduce((s, r) => s + Number(r.quantity), 0);
    }
    const totalProducts = Object.values(typeCounts).reduce((s, c) => s + c, 0);

    styleHeader(ws1, ["Indicador", "Valor"]);
    ws1.addRow(["Total pérdidas", "$" + Math.round(totalAmount).toLocaleString("es-CO") + " COP"]);
    ws1.addRow(["Total registros", records.length]);
    for (const t of LOSS_TYPES) {
      if (typeCounts[t] > 0) {
        ws1.addRow(["Productos - " + getLossTypeLabel(t), typeCounts[t]]);
      }
    }
    ws1.addRow(["Total productos", totalProducts]);
    ws1.getColumn(1).width = 25;
    ws1.getColumn(2).width = 30;

    // Sheet 2: Detalle de pérdidas
    const ws2 = workbook.addWorksheet("Detalle de pérdidas");
    styleHeader(ws2, ["Fecha", "Hora", "Piso", "Habitación", "Producto", "Categoría", "Tipo", "Cantidad", "Precio unitario", "Total", "Usuario", "Observación"]);
    for (const r of records) {
      const d = new Date(r.registered_at);
      ws2.addRow([
        d.toLocaleDateString("es-CO"),
        d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
        r.floor_name,
        r.room_number,
        r.product_name,
        r.category_name,
        getLossTypeLabel(r.loss_type),
        r.quantity,
        Number(r.unit_price),
        Number(r.total_price),
        r.user_name || "",
        r.item_notes || ""
      ]);
    }
    ws2.getColumn(1).width = 14;
    ws2.getColumn(2).width = 10;
    ws2.getColumn(3).width = 12;
    ws2.getColumn(4).width = 12;
    ws2.getColumn(5).width = 22;
    ws2.getColumn(6).width = 16;
    ws2.getColumn(7).width = 12;
    ws2.getColumn(8).width = 10;
    ws2.getColumn(9).width = 16;
    ws2.getColumn(10).width = 16;
    ws2.getColumn(11).width = 20;
    ws2.getColumn(12).width = 20;

    // Sheet 3: Top 10 habitaciones
    const ws3 = workbook.addWorksheet("Top 10 habitaciones");
    const roomBreakdown = buildRoomBreakdown(records);
    const topRooms = roomBreakdown.slice(0, 10);

    styleHeader(ws3, ["Posición", "Habitación", "Piso", "Cantidad total", "Valor total", "Última fecha"]);
    topRooms.forEach((rm, i) => {
      ws3.addRow([i + 1, rm.roomNumber, rm.floorName, rm.items, Number(rm.total), ""]);
    });
    ws3.getColumn(1).width = 10;
    ws3.getColumn(2).width = 14;
    ws3.getColumn(3).width = 12;
    ws3.getColumn(4).width = 14;
    ws3.getColumn(5).width = 16;
    ws3.getColumn(6).width = 16;

    // Sheet 4: Ranking de pisos
    const ws4 = workbook.addWorksheet("Ranking de pisos");
    const floorBreakdown = buildFloorBreakdown(records);
    const grandTotal = totalAmount || 1;

    styleHeader(ws4, ["Posición", "Piso", "Habitaciones afectadas", "Cantidad total", "Valor total", "Porcentaje"]);
    floorBreakdown.forEach((f, i) => {
      const pct = Math.round((f.total / grandTotal) * 100);
      ws4.addRow([i + 1, f.floorName, f.rooms, f.items, Number(f.total), pct + "%"]);
    });
    ws4.getColumn(1).width = 10;
    ws4.getColumn(2).width = 14;
    ws4.getColumn(3).width = 24;
    ws4.getColumn(4).width = 14;
    ws4.getColumn(5).width = 16;
    ws4.getColumn(6).width = 12;

    // Sheet 5: Ranking de productos
    const ws5 = workbook.addWorksheet("Ranking de productos");
    const productBreakdown = buildProductBreakdown(records);

    styleHeader(ws5, ["Posición", "Producto", "Categoría", "Tipo", "Cantidad total", "Valor total"]);
    productBreakdown.forEach((p, i) => {
      ws5.addRow([i + 1, p.name, p.categoryName, p.lossTypeLabel, p.items, Number(p.total)]);
    });
    ws5.getColumn(1).width = 10;
    ws5.getColumn(2).width = 22;
    ws5.getColumn(3).width = 16;
    ws5.getColumn(4).width = 12;
    ws5.getColumn(5).width = 14;
    ws5.getColumn(6).width = 16;

    // Sheet 6: Fechas críticas
    const ws6 = workbook.addWorksheet("Fechas críticas");
    const dateBreakdown = buildDateBreakdown(records);

    styleHeader(ws6, ["Fecha", "Cantidad productos", "Valor total", "Habitaciones afectadas"]);
    dateBreakdown.forEach(d => {
      ws6.addRow([d.date, d.items, Number(d.total), Array.from(d.rooms).join(", ")]);
    });
    ws6.getColumn(1).width = 16;
    ws6.getColumn(2).width = 20;
    ws6.getColumn(3).width = 16;
    ws6.getColumn(4).width = 30;

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Reportes",
      actionType: "excel_exported",
      actionDescription: "Exportó reporte de pérdidas en Excel del " + from + " al " + to,
      amount: totalAmount,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="informe-perdidas-${from}-${to}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error generating loss Excel:", err);
    if (!res.headersSent) {
      res.status(500).send("Error al generar Excel");
    }
  }
});

module.exports = router;
