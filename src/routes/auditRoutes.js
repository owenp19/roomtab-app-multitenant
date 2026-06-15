const express = require("express");
const { PDFReport, fmtDateTimeLong, CW, MARGIN, TEXT_LIGHT } = require("../pdfHelper");
const ExcelJS = require("exceljs");
const router = express.Router();
const { query, getDbPool } = require("../config/db");
const { getSessionUser, getClientIp, getDeviceInfo, logAudit, MODULES, ACTION_TYPES } = require("../auditLogger");

function formatCOP(value) {
  const n = Number(value) || 0;
  return "$" + Math.round(n).toLocaleString("es-CO") + " COP";
}

function formatDate(d) {
  return d.toLocaleDateString("es-CO");
}

function formatDateTime(d) {
  return d.toLocaleDateString("es-CO") + " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

// POST /api/audit/log — frontend-initiated audit log (e.g. whatsapp send)
router.post("/log", async (req, res) => {
  try {
    const { moduleName, actionType, actionDescription, roomId, floorId, amount } = req.body;
    const user = getSessionUser(req);

    await logAudit({
      userId: user?.id,
      userName: user?.fullName,
      userRole: user?.role,
      moduleName: moduleName || "Sistema",
      actionType: actionType || "unknown",
      actionDescription: actionDescription || "",
      roomId: roomId ? Number(roomId) : null,
      floorId: floorId ? Number(floorId) : null,
      amount: amount != null ? Number(amount) : null,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error logging audit from frontend:", err);
    res.status(500).json({ error: "Error al registrar auditoría" });
  }
});

// GET /api/audit/logs — paginated, filterable audit log list
router.get("/logs", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      from,
      to,
      userId,
      moduleName,
      actionType,
      floorId,
      roomId,
      search,
      sortBy = "created_at",
      sortDir = "DESC"
    } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const allowedSort = ["created_at", "user_name", "module_name", "action_type"];
    const orderCol = allowedSort.includes(sortBy) ? sortBy : "created_at";
    const orderDir = sortDir === "ASC" ? "ASC" : "DESC";

    const conditions = [];
    const params = [];

    if (from) {
      conditions.push("a.created_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("a.created_at <= ?");
      params.push(to + " 23:59:59");
    }
    if (userId) {
      conditions.push("a.user_id = ?");
      params.push(Number(userId));
    }
    if (moduleName) {
      conditions.push("a.module_name = ?");
      params.push(moduleName);
    }
    if (actionType) {
      conditions.push("a.action_type = ?");
      params.push(actionType);
    }
    if (floorId) {
      conditions.push("a.floor_id = ?");
      params.push(Number(floorId));
    }
    if (roomId) {
      conditions.push("a.room_id = ?");
      params.push(Number(roomId));
    }
    if (search) {
      conditions.push("(a.user_name LIKE ? OR a.action_description LIKE ? OR a.module_name LIKE ?)");
      const like = "%" + search + "%";
      params.push(like, like, like);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const countRows = await query(
      `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const rows = await query(
      `SELECT a.*, COALESCE(r.room_number, '') AS room_number, COALESCE(f.name, '') AS floor_name
       FROM audit_logs a
       LEFT JOIN rooms r ON r.id = a.room_id
       LEFT JOIN floors f ON f.id = a.floor_id
       ${where}
       ORDER BY a.${orderCol} ${orderDir}
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ error: "Error al cargar auditoría" });
  }
});

// GET /api/audit/logs/:id — single audit log detail
router.get("/logs/:id", async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.*, r.room_number, f.name AS floor_name
       FROM audit_logs a
       LEFT JOIN rooms r ON r.id = a.room_id
       LEFT JOIN floors f ON f.id = a.floor_id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching audit log:", err);
    res.status(500).json({ error: "Error al cargar registro" });
  }
});

// GET /api/audit/users — list of users who have audit records
router.get("/users", async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT user_id, user_name, user_role FROM audit_logs WHERE user_id IS NOT NULL ORDER BY user_name`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching audit users:", err);
    res.status(500).json({ error: "Error al cargar usuarios" });
  }
});

// GET /api/audit/summary — summary indicators
router.get("/summary", async (req, res) => {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    if (from) {
      conditions.push("created_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("created_at <= ?");
      params.push(to + " 23:59:59");
    }
    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const totalActions = await query(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, params);
    const topUser = await query(
      `SELECT user_name, COUNT(*) AS cnt FROM audit_logs ${where} GROUP BY user_name ORDER BY cnt DESC LIMIT 1`,
      params
    );
    const topModule = await query(
      `SELECT module_name, COUNT(*) AS cnt FROM audit_logs ${where} GROUP BY module_name ORDER BY cnt DESC LIMIT 1`,
      params
    );
    const whereAnd = where ? where + " AND" : "WHERE";
    const consumptionCount = await query(
      `SELECT COUNT(*) AS cnt FROM audit_logs ${whereAnd} action_type = 'consumption_created'`,
      where ? params : []
    );
    const restockCount = await query(
      `SELECT COUNT(*) AS cnt FROM audit_logs ${whereAnd} action_type = 'restock_created'`,
      where ? params : []
    );
    const lossCount = await query(
      `SELECT COUNT(*) AS cnt FROM audit_logs ${whereAnd} action_type IN ('loss_created','damage_created')`,
      where ? params : []
    );
    const reportCount = await query(
      `SELECT COUNT(*) AS cnt FROM audit_logs ${whereAnd} action_type IN ('report_generated','pdf_exported','excel_exported')`,
      where ? params : []
    );
    const lastAction = await query(
      `SELECT action_type, module_name, user_name, created_at FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 1`,
      params
    );

    res.json({
      totalActions: Number(totalActions[0]?.total || 0),
      topUser: topUser[0]?.user_name || "—",
      topUserCount: Number(topUser[0]?.cnt || 0),
      topModule: topModule[0]?.module_name || "—",
      topModuleCount: Number(topModule[0]?.cnt || 0),
      consumptionCount: Number(consumptionCount[0]?.cnt || 0),
      restockCount: Number(restockCount[0]?.cnt || 0),
      lossCount: Number(lossCount[0]?.cnt || 0),
      reportCount: Number(reportCount[0]?.cnt || 0),
      lastAction: lastAction[0] || null
    });
  } catch (err) {
    console.error("Error fetching audit summary:", err);
    res.status(500).json({ error: "Error al cargar resumen" });
  }
});

// GET /api/audit/modules — distinct modules
router.get("/modules", async (req, res) => {
  try {
    const rows = await query(`SELECT DISTINCT module_name FROM audit_logs ORDER BY module_name`);
    res.json(rows.map(r => r.module_name));
  } catch (err) {
    console.error("Error fetching audit modules:", err);
    res.status(500).json({ error: "Error al cargar módulos" });
  }
});

// GET /api/audit/action-types — distinct action types
router.get("/action-types", async (req, res) => {
  try {
    const rows = await query(`SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type`);
    res.json(rows.map(r => r.action_type));
  } catch (err) {
    console.error("Error fetching audit action types:", err);
    res.status(500).json({ error: "Error al cargar tipos de acción" });
  }
});

// GET /api/audit/export/pdf
router.get("/export/pdf", async (req, res) => {
  try {
    const { from, to, userId, moduleName, actionType } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push("a.created_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("a.created_at <= ?");
      params.push(to + " 23:59:59");
    }
    if (userId) {
      conditions.push("a.user_id = ?");
      params.push(Number(userId));
    }
    if (moduleName) {
      conditions.push("a.module_name = ?");
      params.push(moduleName);
    }
    if (actionType) {
      conditions.push("a.action_type = ?");
      params.push(actionType);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const rows = await query(
      `SELECT a.*, COALESCE(r.room_number, '') AS room_number, COALESCE(f.name, '') AS floor_name
       FROM audit_logs a
       LEFT JOIN rooms r ON r.id = a.room_id
       LEFT JOIN floors f ON f.id = a.floor_id
       ${where}
       ORDER BY a.created_at DESC`,
      params
    );

    const user = getSessionUser(req);
    const now = new Date();

    const report = new PDFReport({
      title: "Reporte de Auditoría",
      subtitle: "Minibar management system",
      dateFrom: from ? new Date(from) : null,
      dateTo: to ? new Date(to) : null,
      userName: user?.fullName || "Sistema",
      skipCover: false
    });

    const doc = report.doc;

    // Header
    doc.fontSize(10).fillColor("#333").text("Reporte de Auditoría", { align: "center" });
    doc.fontSize(8).fillColor(TEXT_LIGHT).text("Minibar management system", { align: "center" });
    doc.moveDown(0.3);

    if (from && to) {
      doc.fontSize(7).fillColor(TEXT_LIGHT).text(`Período: ${formatDate(new Date(from))} - ${formatDate(new Date(to))}`, { align: "center" });
    }
    doc.fontSize(7).fillColor(TEXT_LIGHT).text(`Generado: ${fmtDateTimeLong(now)} por ${user?.fullName || "Sistema"}`, { align: "center" });
    doc.moveDown(0.5);

    doc.fontSize(7).fillColor("#333").text(`Total de acciones: ${rows.length}`, { align: "left" });
    doc.moveDown(0.3);

    // Table header
    const colX = [MARGIN, MARGIN + 80, MARGIN + 160, MARGIN + 240, MARGIN + 320, MARGIN + 400];
    const colW = [80, 80, 80, 80, 80, 80];

    function drawHeader(y) {
      doc.rect(MARGIN, y, CW, 14).fill("#0B2E59");
      doc.fillColor("#FFFFFF").fontSize(6).font("Helvetica-Bold");
      doc.text("Fecha/Hora", colX[0] + 2, y + 3, { width: colW[0] - 2 });
      doc.text("Usuario", colX[1] + 2, y + 3, { width: colW[1] - 2 });
      doc.text("Módulo", colX[2] + 2, y + 3, { width: colW[2] - 2 });
      doc.text("Acción", colX[3] + 2, y + 3, { width: colW[3] - 2 });
      doc.text("Habitación", colX[4] + 2, y + 3, { width: colW[4] - 2 });
      doc.text("Valor", colX[5] + 2, y + 3, { width: colW[5] - 2 });
      return y + 14;
    }

    let y = doc.y;
    y = drawHeader(y);

    let rowNum = 0;
    for (const r of rows) {
      if (y > 720) {
        doc.addPage();
        y = MARGIN;
        y = drawHeader(y);
      }

      const bgColor = rowNum % 2 === 0 ? "#F5F5F0" : "#FFFFFF";
      doc.rect(MARGIN, y, CW, 12).fill(bgColor);
      doc.fillColor("#333").fontSize(5.5).font("Helvetica");

      doc.text(formatDateTime(new Date(r.created_at)), colX[0] + 2, y + 2, { width: colW[0] - 2 });
      doc.text(r.user_name || "—", colX[1] + 2, y + 2, { width: colW[1] - 2 });
      doc.text(r.module_name || "—", colX[2] + 2, y + 2, { width: colW[2] - 2 });
      doc.text(r.action_type || "—", colX[3] + 2, y + 2, { width: colW[3] - 2 });
      doc.text(r.room_number ? "Hab " + r.room_number : "—", colX[4] + 2, y + 2, { width: colW[4] - 2 });
      doc.text(r.amount ? formatCOP(r.amount) : "—", colX[5] + 2, y + 2, { width: colW[5] - 2 });

      y += 12;
      rowNum++;
    }

    // Footer
    doc.fontSize(7).fillColor(TEXT_LIGHT);
    doc.text(`Generado el ${fmtDateTimeLong(now)} por ${user?.fullName || "Sistema"}`, MARGIN, 760, { align: "center", width: CW });

    doc.end();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="auditoria_${formatDate(now).replace(/\//g, "-")}.pdf"`);
    doc.pipe(res);
  } catch (err) {
    console.error("Error exporting audit PDF:", err);
    res.status(500).json({ error: "Error al exportar PDF" });
  }
});

// GET /api/audit/export/excel
router.get("/export/excel", async (req, res) => {
  try {
    const { from, to, userId, moduleName, actionType } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      conditions.push("a.created_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("a.created_at <= ?");
      params.push(to + " 23:59:59");
    }
    if (userId) {
      conditions.push("a.user_id = ?");
      params.push(Number(userId));
    }
    if (moduleName) {
      conditions.push("a.module_name = ?");
      params.push(moduleName);
    }
    if (actionType) {
      conditions.push("a.action_type = ?");
      params.push(actionType);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const rows = await query(
      `SELECT a.*, COALESCE(r.room_number, '') AS room_number, COALESCE(f.name, '') AS floor_name
       FROM audit_logs a
       LEFT JOIN rooms r ON r.id = a.room_id
       LEFT JOIN floors f ON f.id = a.floor_id
       ${where}
       ORDER BY a.created_at DESC`,
      params
    );

    const user = getSessionUser(req);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = user?.fullName || "Sistema";
    const ws = workbook.addWorksheet("Auditoría");

    ws.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Hora", key: "hora", width: 10 },
      { header: "Usuario", key: "user_name", width: 20 },
      { header: "Rol", key: "user_role", width: 12 },
      { header: "Módulo", key: "module_name", width: 16 },
      { header: "Acción", key: "action_type", width: 24 },
      { header: "Descripción", key: "action_description", width: 40 },
      { header: "Piso", key: "floor_name", width: 12 },
      { header: "Habitación", key: "room_number", width: 12 },
      { header: "Valor", key: "amount", width: 16 },
      { header: "Estado", key: "status", width: 10 },
      { header: "IP", key: "ip_address", width: 16 },
      { header: "Dispositivo", key: "device_info", width: 30 }
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0B2E59" } };

    for (const r of rows) {
      const d = new Date(r.created_at);
      ws.addRow({
        id: r.id,
        fecha: d.toLocaleDateString("es-CO"),
        hora: d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
        user_name: r.user_name || "",
        user_role: r.user_role || "",
        module_name: r.module_name || "",
        action_type: r.action_type || "",
        action_description: r.action_description || "",
        floor_name: r.floor_name || "",
        room_number: r.room_number || "",
        amount: r.amount ? Number(r.amount) : "",
        status: r.status || "",
        ip_address: r.ip_address || "",
        device_info: r.device_info || ""
      });
    }

    const now = new Date();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="auditoria_${formatDate(now).replace(/\//g, "-")}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

    logAudit({
      userId: user?.id,
      userName: user?.fullName,
      userRole: user?.role,
      moduleName: "Reportes",
      actionType: "excel_exported",
      actionDescription: "Exportó reporte de auditoría en Excel",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });
  } catch (err) {
    console.error("Error exporting audit Excel:", err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

// POST /api/audit/clear-logins — delete all login audit records
router.post("/clear-logins", async (req, res) => {
  try {
    const user = getSessionUser(req);

    const result = await query(`DELETE FROM audit_logs WHERE action_type = 'login'`);

    logAudit({
      userId: user?.id,
      userName: user?.fullName,
      userRole: user?.role,
      moduleName: "Auditoría",
      actionType: "login_records_cleared",
      actionDescription: "Eliminó todos los registros de inicio de sesión",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ deleted: result.affectedRows || 0 });
  } catch (err) {
    console.error("Error clearing login audit records:", err);
    res.status(500).json({ error: "Error al limpiar registros de inicio de sesión" });
  }
});

module.exports = router;
