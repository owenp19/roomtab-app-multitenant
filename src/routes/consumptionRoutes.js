const express = require("express");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const {
  createConsumptionWithItems,
  getConsumptionWithItemsById,
  getConsumptionsByDateRange,
} = require("../repositories/consumptionRepository");

const router = express.Router();

function formatCOP(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function safeText(v) {
  return String(v ?? "").trim();
}

router.post("/", async (req, res) => {
  try {
    const { roomId, note, items } = req.body || {};
    const id = await createConsumptionWithItems(roomId, note, items);

    res.status(201).json({
      id,
      invoiceUrl: `/api/consumptions/${id}/invoice.pdf`,
    });
  } catch (err) {
    res.status(400).json({ message: err.message || "Error creando consumo" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    const consumptions = await getConsumptionsByDateRange(from, to);
    res.json(consumptions);
  } catch (err) {
    res.status(500).json({ message: "Error consultando consumos" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const c = await getConsumptionWithItemsById(req.params.id);
    if (!c) return res.status(404).json({ message: "Consumo no encontrado" });
    res.json(c);
  } catch (err) {
    res.status(500).json({ message: "Error consultando consumo" });
  }
});

router.get("/:id/invoice.pdf", async (req, res) => {
  try {
    const c = await getConsumptionWithItemsById(req.params.id);
    if (!c) return res.status(404).send("Consumo no encontrado");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="consumo-${c.id}.pdf"`
    );

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;

    const logoPath = path.join(__dirname, "../../public/images/roomtab-logo-dark-transparent.png");
    const hasLogo = fs.existsSync(logoPath);

    const headerY = 40;
    const logoW = 60;
    const logoH = 60;

    doc.font("Helvetica-Bold").fontSize(16);
    doc.text("CUENTA DE COBRO - MINIBAR NATTIVO", left, headerY, {
      width: right - left - (hasLogo ? (logoW + 12) : 0),
      align: "left",
    });

    if (hasLogo) {
      doc.image(logoPath, right - logoW, headerY - 6, {
        width: logoW,
        height: logoH,
      });
    }

    doc.moveDown(2);

    doc.font("Helvetica").fontSize(11);
    const created = c.createdAt ? new Date(c.createdAt) : new Date();
    const fecha = created.toLocaleDateString("es-CO");
    const hora = created.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.text(`Habitación: ${safeText(c.roomNumber) || "N/A"}`);
    doc.text(`Fecha: ${fecha}   Hora: ${hora}`);
    if (safeText(c.note)) doc.text(`Nota: ${safeText(c.note)}`);

    doc.moveDown(1);

    const yTableTop = doc.y + 8;
    doc.moveTo(left, yTableTop).lineTo(right, yTableTop).strokeColor("#999").stroke();

    const colCant = left;
    const colProd = left + 55;
    const colValor = right - 160;
    const colTotal = right - 70;

    doc.font("Helvetica-Bold").fontSize(10);
    const yHeader = yTableTop + 10;

    doc.text("CANT.", colCant, yHeader, { width: 50, align: "left" });
    doc.text("PRODUCTO", colProd, yHeader, { width: colValor - colProd - 10, align: "left" });
    doc.text("VALOR", colValor, yHeader, { width: 80, align: "right" });
    doc.text("TOTAL", colTotal, yHeader, { width: 70, align: "right" });

    const yHeaderLine = yHeader + 16;
    doc.moveTo(left, yHeaderLine).lineTo(right, yHeaderLine).strokeColor("#ddd").stroke();

    doc.font("Helvetica").fontSize(10);

    let y = yHeaderLine + 8;

    for (const it of c.items || []) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const lineTotal = qty * price;

      const name = safeText(it.name) || "Producto";

      const rowHeight = 16;

      doc.text(String(qty), colCant, y, { width: 50, align: "left" });
      doc.text(name, colProd, y, { width: colValor - colProd - 10, align: "left" });
      doc.text(formatCOP(price), colValor, y, { width: 80, align: "right" });
      doc.text(formatCOP(lineTotal), colTotal, y, { width: 70, align: "right" });

      y += rowHeight;

      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 60;
      }
    }

    doc.moveTo(left, y + 6).lineTo(right, y + 6).strokeColor("#999").stroke();

    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("TOTAL", colValor, y + 14, { width: 80, align: "right" });
    doc.text(formatCOP(c.total), colTotal, y + 14, { width: 70, align: "right" });

    doc.end();
  } catch (err) {
    res.status(500).send("Error generando PDF");
  }
});

module.exports = router;
