'use strict';

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ============ CONSTANTS ============

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 71;
const CW = PAGE_W - 2 * MARGIN;
const CX = PAGE_W / 2;
const FOOTER_Y = PAGE_H - 28;
const CONTENT_MAX_Y = PAGE_H - 55;

const PRIMARY = '#0B2E59';
const TEXT = '#333333';
const TEXT_LIGHT = '#666666';
const TEXT_LIGHTER = '#999999';
const BORDER = '#E0E0E0';
const ALT_ROW = '#F5F5F0';
const WHITE = '#FFFFFF';

const LOGO_PATH = path.join(__dirname, '../public/images/roomtab-logo-dark-transparent.png');

// ============ FORMAT HELPERS ============

function formatCOP(v) {
  return '$' + Math.round(Number(v) || 0).toLocaleString('es-CO') + ' COP';
}

function fmtDateShort(d) {
  return d.toLocaleDateString('es-CO');
}

function fmtDateLong(d) {
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateTimeLong(d) {
  return fmtDateLong(d) + ' a las ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// ============ PDF REPORT CLASS ============

class PDFReport {
  constructor({ title, subtitle, dateFrom, dateTo, userName, skipCover }) {
    this.doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      info: { Title: title, Author: 'RoomTab Minibar App', Subject: subtitle },
    });

    this.title = title;
    this.subtitle = subtitle;
    this.dateFrom = dateFrom ? new Date(dateFrom) : new Date();
    this.dateTo = dateTo ? new Date(dateTo) : new Date();
    this.userName = userName || 'Operador';
    this.generatedAt = new Date();
    this.hasLogo = fs.existsSync(LOGO_PATH);

    this._contentPageNum = skipCover ? 1 : 0;
  }

  pipe(res) {
    this.doc.pipe(res);
  }

  // ============ FOOTER ============

  _drawFooter() {
    if (this._contentPageNum === 0) return;
    const d = this.doc;
    d.save();
    d.fillColor(BORDER);
    d.rect(MARGIN, FOOTER_Y - 6, CW, 0.5).fill();
    d.restore();

    d.font('Helvetica').fontSize(7).fillColor(TEXT_LIGHTER);
    d.text('Sistema de gestión de minibar — RoomTab Minibar App', MARGIN, FOOTER_Y, { width: CW * 0.6, align: 'left' });
    d.text('P\u00e1gina ' + this._contentPageNum, MARGIN, FOOTER_Y, { width: CW, align: 'right' });
  }

  // ============ COVER PAGE ============

  addCoverPage() {
    const d = this.doc;

    if (this.hasLogo) {
      const lw = 150;
      d.image(LOGO_PATH, CX - lw / 2, 120, { width: lw });
    }

    d.save().fillColor(PRIMARY).rect(CX - 55, 278, 110, 1.5).fill().restore();

    d.font('Helvetica-Bold').fontSize(20).fillColor(PRIMARY);
    d.text(this.title, CX, 298, { align: 'center' });

    d.font('Helvetica').fontSize(11).fillColor(TEXT_LIGHT);
    d.text(this.subtitle, CX, 332, { align: 'center' });

    d.save().fillColor(PRIMARY).rect(CX - 55, 362, 110, 1.5).fill().restore();

    const iy = 385;
    d.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    d.text('Periodo del informe:', CX, iy, { align: 'center' });
    d.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT);
    d.text(fmtDateLong(this.dateFrom) + ' \u2014 ' + fmtDateLong(this.dateTo), CX, iy + 18, { align: 'center' });

    d.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    d.text('Generado el:', CX, iy + 50, { align: 'center' });
    d.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT);
    d.text(fmtDateTimeLong(this.generatedAt), CX, iy + 68, { align: 'center' });

    d.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    d.text('Generado por:', CX, iy + 100, { align: 'center' });
    d.font('Helvetica').fontSize(10).fillColor(TEXT_LIGHT);
    d.text(this.userName, CX, iy + 118, { align: 'center' });

    d.font('Helvetica').fontSize(8).fillColor(TEXT_LIGHTER);
    d.text('Sistema de gestión de minibar', CX, PAGE_H - 70, { align: 'center' });
    d.text('RoomTab Minibar App', CX, PAGE_H - 56, { align: 'center' });

    d.addPage();
    this._contentPageNum = 1;
  }

  // ============ PAGE HEADER (for content pages) ============

  addPageHeader() {
    const d = this.doc;

    if (this.hasLogo) {
      d.image(LOGO_PATH, MARGIN, MARGIN - 5, { width: 38 });
    }

    d.font('Helvetica-Bold').fontSize(10).fillColor(PRIMARY);
    d.text(this.title, MARGIN + 46, MARGIN - 2, { width: CW - 46 });

    d.font('Helvetica').fontSize(7.5).fillColor(TEXT_LIGHT);
    const dr = fmtDateShort(this.dateFrom) + ' \u2014 ' + fmtDateShort(this.dateTo);
    d.text(dr, MARGIN + 46, MARGIN + 13);

    d.save().fillColor(PRIMARY).rect(MARGIN, MARGIN + 33, CW, 1).fill().restore();

    this._drawFooter();

    return MARGIN + 40;
  }

  // ============ SECTION TITLE ============

  addSectionTitle(number, text, y) {
    const d = this.doc;
    const label = number ? number + '. ' + text : text;
    d.font('Helvetica-Bold').fontSize(12).fillColor(PRIMARY);
    d.text(label, MARGIN, y, { width: CW });
    return y + 20;
  }

  // ============ SUBSECTION TITLE ============

  addSubSectionTitle(text, y) {
    const d = this.doc;
    d.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    d.text(text, MARGIN, y, { width: CW });
    return y + 17;
  }

  // ============ BODY TEXT ============

  addBodyText(text, y) {
    const d = this.doc;
    d.font('Helvetica').fontSize(9).fillColor(TEXT);
    d.text(text, MARGIN, y, {
      width: CW,
      lineGap: 3,
      align: 'justify',
    });
    return d.y + 8;
  }

  // ============ PAGE BREAK CHECK ============

  checkPageBreak(neededSpace, y) {
    const available = CONTENT_MAX_Y - y;
    if (neededSpace > available) {
      this._contentPageNum++;
      this.doc.addPage();
      return this.addPageHeader();
    }
    return y;
  }

  // ============ SUMMARY CARDS ============

  drawSummaryCards(cards, startY) {
    const d = this.doc;
    const cardW = (CW - 16) / 3;
    const cardH = 52;

    for (let i = 0; i < cards.length; i++) {
      const cx = MARGIN + i * (cardW + 8);
      d.save().fillColor(ALT_ROW).roundedRect(cx, startY, cardW, cardH, 4).fill().restore();

      d.font('Helvetica-Bold').fontSize(8.5).fillColor(PRIMARY);
      d.text(cards[i].label, cx + 8, startY + 6, { width: cardW - 16 });

      d.font('Helvetica-Bold').fontSize(13).fillColor(TEXT);
      d.text(cards[i].value, cx + 8, startY + 24, { width: cardW - 16 });
    }

    return startY + cardH + 16;
  }

  drawExtendedSummaryCards(cards, startY) {
    const d = this.doc;
    const perRow = 2;
    const cardW = (CW - 8) / perRow;
    const cardH = 42;
    let y = startY;

    cards.forEach((card, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const cx = MARGIN + col * (cardW + 8);

      if (row > 0 && col === 0) {
        y += cardH + 6;
      }
      if (i === 0) y = startY;

      const cy = y + row * (cardH + 6);

      d.save().fillColor(ALT_ROW).roundedRect(cx, cy, cardW, cardH, 4).fill().restore();
      d.font('Helvetica-Bold').fontSize(8).fillColor(PRIMARY);
      d.text(card.label, cx + 8, cy + 5, { width: cardW - 16 });
      d.font('Helvetica-Bold').fontSize(11).fillColor(TEXT);
      d.text(card.value, cx + 8, cy + 21, { width: cardW - 16 });
    });

    const rows = Math.ceil(cards.length / perRow);
    return startY + rows * (cardH + 6) + 8;
  }

  // ============ TABLE ============

  drawTable(headers, rows, startY, options = {}) {
    const d = this.doc;
    const {
      widths,
      headerBg = PRIMARY,
      headerColor = WHITE,
      altColor = ALT_ROW,
      borderColor = BORDER,
      fontSize = 8.5,
      rowH = 17,
      headerH = 20,
    } = options;

    const colWidths = widths || headers.map(() => CW / headers.length);
    let y = startY;

    const drawHeader = (yPos) => {
      d.save().fillColor(headerBg).rect(MARGIN, yPos, CW, headerH).fill().restore();
      d.font('Helvetica-Bold').fontSize(fontSize).fillColor(headerColor);
      let x = MARGIN;
      headers.forEach((h, i) => {
        d.text(h.label, x + 4, yPos + 5, { width: colWidths[i] - 8, align: h.align || 'left' });
        x += colWidths[i];
      });
      return yPos + headerH;
    };

    if (y + headerH + rowH + 10 > CONTENT_MAX_Y) {
      this._contentPageNum++;
      d.addPage();
      y = this.addPageHeader();
    }

    y = drawHeader(y);

    rows.forEach((row, ri) => {
      if (y + rowH + 8 > CONTENT_MAX_Y) {
        d.save().strokeColor(borderColor).lineWidth(0.5)
          .moveTo(MARGIN, y).lineTo(MARGIN + CW, y).stroke().restore();

        this._contentPageNum++;
        d.addPage();
        y = this.addPageHeader();
        y = drawHeader(y);
      }

      if (ri % 2 === 1) {
        d.save().fillColor(altColor).rect(MARGIN, y, CW, rowH).fill().restore();
      }

      d.font('Helvetica').fontSize(fontSize).fillColor(TEXT);
      let x = MARGIN;
      row.forEach((cell, ci) => {
        d.text(String(cell), x + 4, y + 4, {
          width: colWidths[ci] - 8,
          align: headers[ci]?.align || 'left',
        });
        x += colWidths[ci];
      });

      d.save().strokeColor(borderColor).lineWidth(0.4)
        .moveTo(MARGIN, y + rowH).lineTo(MARGIN + CW, y + rowH).stroke().restore();

      y += rowH;
    });

    return y + 6;
  }

  // ============ OBSERVATION BULLET ============

  drawObservation(text, y) {
    const d = this.doc;
    d.font('Helvetica').fontSize(9).fillColor(TEXT);
    d.text('\u2022  ' + text, MARGIN + 6, y, {
      width: CW - 12,
      lineGap: 2,
    });
    return d.y + 4;
  }

  // ============ MULTI-COLUMN LIST ============

  drawColumnList(items, startY, options = {}) {
    const d = this.doc;
    const { columns = 3, gap = 12, fontSize = 9, prefix = '' } = options;
    const colW = (CW - gap * (columns - 1)) / columns;

    let x = MARGIN;
    let y = startY;
    let maxY = y;

    items.forEach((item, i) => {
      const col = i % columns;
      if (col === 0 && i > 0) {
        y = maxY + 16;
        maxY = y;
      }
      const cx = MARGIN + col * (colW + gap);

      d.font('Helvetica').fontSize(fontSize).fillColor(TEXT);
      const label = prefix ? prefix + item : item;
      d.text(label, cx, y, { width: colW });

      const itemY = d.y;
      if (itemY > maxY) maxY = itemY;
    });

    return maxY + 10;
  }

  // ============ ROOMS WITHOUT CONSUMPTION BY FLOOR ============

  drawRoomsByFloor(floorGroups, startY) {
    const d = this.doc;
    let y = startY;

    for (const [floor, rooms] of Object.entries(floorGroups)) {
      if (y > CONTENT_MAX_Y - 30) {
        this._contentPageNum++;
        d.addPage();
        y = this.addPageHeader();
      }

      d.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARY);
      d.text(floor + ':', MARGIN, y, { width: CW });
      y += 15;

      const line = rooms.join(', ');

      d.font('Helvetica').fontSize(9).fillColor(TEXT);
      d.text(line, MARGIN, y, { width: CW, lineGap: 2 });
      y = d.y + 10;
    }

    return y + 4;
  }

  // ============ FINALIZE ============

  finalize() {
    this.doc.end();
  }
}

module.exports = { PDFReport, formatCOP, fmtDateShort, fmtDateLong, fmtDateTimeLong, CW, MARGIN, TEXT, TEXT_LIGHT, TEXT_LIGHTER, BORDER, ALT_ROW, WHITE, PRIMARY };
