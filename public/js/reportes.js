(function () {
  'use strict';

  const el = {
    reportFrom: document.getElementById('report-from'),
    reportTo: document.getElementById('report-to'),
    generateAllBtn: document.getElementById('generate-all-btn'),
    reportStatus: document.getElementById('report-status'),
    reportTypeRadios: document.querySelectorAll('input[name="report-type"]'),

    consumosSection: document.getElementById('report-consumos-section'),
    consumosContent: document.getElementById('report-consumos-content'),
    consumosSubtitle: document.getElementById('report-consumos-subtitle'),
    exportConsumosPdf: document.getElementById('export-consumos-pdf-btn'),
    exportConsumosExcel: document.getElementById('export-consumos-excel-btn'),

    perdidasSection: document.getElementById('report-perdidas-section'),
    perdidasContent: document.getElementById('report-perdidas-content'),
    perdidasSubtitle: document.getElementById('report-perdidas-subtitle'),
    exportPerdidasPdf: document.getElementById('export-perdidas-pdf-btn'),
    exportPerdidasExcel: document.getElementById('export-perdidas-excel-btn'),

    comparePeriodBtn: document.getElementById('compare-period-btn'),
    compareYearBtn: document.getElementById('compare-year-btn'),
    compareResults: document.getElementById('report-compare-results')
  };

  let lastFrom = '';
  let lastTo = '';

  function apiFetch(url, options = {}) {
    return fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Error ' + res.status);
      }
      return res.json();
    });
  }

  function getSelectedReportType() {
    for (const radio of el.reportTypeRadios) {
      if (radio.checked) return radio.value;
    }
    return 'both';
  }

  function setStatus(msg, type) {
    el.reportStatus.textContent = msg;
    el.reportStatus.className = 'status' + (type ? ' ' + type : '');
  }

  function clearStatus() {
    el.reportStatus.textContent = '';
    el.reportStatus.className = 'status';
  }

  function formatCOP(value) {
    const n = Number(value) || 0;
    return '$' + Math.round(n).toLocaleString('es-CO') + ' COP';
  }

  function renderConsumosSummary(data) {
    if (!data || !data.summary) {
      el.consumosContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Sin datos</h3><p>No hay consumos en el rango seleccionado.</p></div>';
      return;
    }
    const s = data.summary;
    let html = '<div class="report-summary-cards">';
    const cards = [
      { label: 'Total consumido', value: formatCOP(s.totalAmount), icon: 'ph-light ph-currency-circle-dollar' },
      { label: 'Productos consumidos', value: String(s.totalProducts), icon: 'ph-light ph-shopping-bag' },
      { label: 'Movimientos', value: String(s.totalMovements), icon: 'ph-light ph-list-dashes' },
      { label: 'Habitaciones', value: String(s.totalRoomsWithConsumption), icon: 'ph-light ph-bed' }
    ];
    for (const card of cards) {
      html += '<div class="report-card">' +
        '<div class="report-card-icon"><i class="' + card.icon + '"></i></div>' +
        '<div class="report-card-value">' + card.value + '</div>' +
        '<div class="report-card-label">' + card.label + '</div>' +
      '</div>';
    }
    html += '</div>';

    if (s.categoryBreakdown && s.categoryBreakdown.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Consumo por categoría</h3>';
      for (const cat of s.categoryBreakdown) {
        html += '<div class="report-row"><span class="report-row-label">' + cat.name + '</span><span class="report-row-value">' + formatCOP(cat.total) + '</span></div>';
      }
      html += '</div>';
    }

    if (s.floorBreakdown && s.floorBreakdown.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Consumo por piso</h3>';
      for (const f of s.floorBreakdown) {
        html += '<div class="report-row"><span class="report-row-label">' + f.floorName + '</span><span class="report-row-value">' + formatCOP(f.total) + '</span></div>';
      }
      html += '</div>';
    }

    if (s.top5Rooms && s.top5Rooms.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Top 5 habitaciones que más consumieron</h3>';
      html += '<div class="report-ranking">';
      s.top5Rooms.forEach((r, i) => {
        html += '<div class="report-rank-item"><span class="report-rank-num">#' + (i + 1) + '</span><span class="report-rank-label">Habitación ' + r.roomNumber + '</span><span class="report-rank-value">' + formatCOP(r.total) + '</span></div>';
      });
      html += '</div></div>';
    }

    if (s.mostConsumedProducts && s.mostConsumedProducts.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Productos más consumidos</h3>';
      html += '<div class="report-ranking">';
      s.mostConsumedProducts.forEach((p, i) => {
        html += '<div class="report-rank-item"><span class="report-rank-num">#' + (i + 1) + '</span><span class="report-rank-label">' + p.name + '</span><span class="report-rank-value">' + p.items + ' uds</span></div>';
      });
      html += '</div></div>';
    }

    if (data.observations && data.observations.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Observaciones</h3><ul class="report-observations">';
      for (const obs of data.observations) {
        html += '<li>' + obs + '</li>';
      }
      html += '</ul></div>';
    }

    html += '<p class="report-generated-at">Generado: ' + new Date(s.generatedAt).toLocaleString('es-CO') + '</p>';
    el.consumosContent.innerHTML = html;
    el.consumosSubtitle.textContent = 'Consumos del ' + lastFrom + ' al ' + lastTo;
  }

  const LOSS_TYPE_LABELS = {
    perdida: 'Perdida',
    dano: 'Daño'
  };

  const LOSS_TYPES = ['perdida', 'dano'];

  function renderPerdidasSummary(data) {
    if (!data || !data.summary || !data.totalCount || data.totalCount === 0) {
      el.perdidasContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Sin datos</h3><p>No hay pérdidas en el rango seleccionado.</p></div>';
      return;
    }
    const s = data.summary;
    let html = '<div class="report-summary-cards">';
    const cards = [
      { label: 'Total pérdidas', value: formatCOP(s.totalAmount), icon: 'ph-light ph-currency-circle-dollar' },
      { label: 'Registros', value: String(s.totalRecords), icon: 'ph-light ph-list-dashes' },
      { label: 'Total productos', value: String(s.totalProducts), icon: 'ph-light ph-shopping-bag' }
    ];
    for (const card of cards) {
      html += '<div class="report-card">' +
        '<div class="report-card-icon"><i class="' + card.icon + '"></i></div>' +
        '<div class="report-card-value">' + card.value + '</div>' +
        '<div class="report-card-label">' + card.label + '</div>' +
      '</div>';
    }
    html += '</div>';

    // Breakdown by loss type
    html += '<div class="report-section"><h3 class="report-section-title">Novedades por tipo</h3>';
    html += '<div class="report-ranking">';
    for (const t of LOSS_TYPES) {
      const countKey = t + 'Count';
      const amountKey = t + 'Amount';
      if (s[countKey] > 0) {
        html += '<div class="report-rank-item"><span class="report-rank-label">' + LOSS_TYPE_LABELS[t] + '</span><span class="report-rank-value">' + s[countKey] + ' uds - ' + formatCOP(s[amountKey]) + '</span></div>';
      }
    }
    html += '</div></div>';

    if (data.floorRanking && data.floorRanking.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Pérdidas por piso</h3>';
      for (const f of data.floorRanking) {
        html += '<div class="report-row"><span class="report-row-label">' + f.floor_name + '</span><span class="report-row-value">' + formatCOP(f.totalAmount) + '</span></div>';
      }
      html += '</div>';
    }

    if (data.topRooms && data.topRooms.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Top 10 habitaciones con más pérdidas</h3>';
      html += '<div class="report-ranking">';
      data.topRooms.forEach((r, i) => {
        html += '<div class="report-rank-item"><span class="report-rank-num">#' + (i + 1) + '</span><span class="report-rank-label">Habitación ' + r.room_number + '</span><span class="report-rank-value">' + formatCOP(r.totalAmount) + '</span></div>';
      });
      html += '</div></div>';
    }

    if (data.productRanking && data.productRanking.length) {
      html += '<div class="report-section"><h3 class="report-section-title">Productos más perdidos</h3>';
      html += '<div class="report-ranking">';
      data.productRanking.forEach((p, i) => {
        html += '<div class="report-rank-item"><span class="report-rank-num">#' + (i + 1) + '</span><span class="report-rank-label">' + p.product_name + '</span><span class="report-rank-value">' + p.totalQty + ' uds</span></div>';
      });
      html += '</div></div>';
    }

    html += '<p class="report-generated-at">Generado: ' + new Date().toLocaleString('es-CO') + '</p>';
    el.perdidasContent.innerHTML = html;
    el.perdidasSubtitle.textContent = 'Pérdidas del ' + lastFrom + ' al ' + lastTo;
  }

  function getCompareLang(key) {
    if (typeof translations !== 'undefined' && translations[getCurrentLang()]) {
      return translations[getCurrentLang()][key] || translations.es[key] || key;
    }
    const i18n = window.__i18n || {};
    return i18n[key] || key;
  }

  async function loadCompare(type) {
    const from = el.reportFrom.value;
    const to = el.reportTo.value;

    if (!from || !to) {
      setStatus('Selecciona fecha inicial y final.', 'error');
      return;
    }

    el.compareResults.style.display = 'block';
    el.compareResults.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';

    try {
      const endpoint = type === 'year'
        ? '/api/minibar/reports/compare-year'
        : '/api/minibar/reports/compare';
      const data = await apiFetch(endpoint + '?from=' + from + '&to=' + to);
      renderCompareResults(data, type);
    } catch (err) {
      el.compareResults.innerHTML = '<div class="empty-state" style="color:var(--color-danger);"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function renderCompareResults(data, type) {
    if (!data || !data.current || !data.previous) {
      el.compareResults.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Sin datos</h3><p>No hay suficientes datos para la comparaci&oacute;n.</p></div>';
      return;
    }

    const c = data.current;
    const p = data.previous;
    const comp = data.comparison;

    function pctHtml(val, pct) {
      let cls = 'neutral';
      let arrow = '';
      if (val > 0) { cls = 'positive'; arrow = '\u2191'; }
      else if (val < 0) { cls = 'negative'; arrow = '\u2193'; }
      const label = val > 0 ? 'aumento' : (val < 0 ? 'disminuci\u00f3n' : 'sin cambio');
      return '<span class="report-compare-change ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(1) + '% (' + label + ')</span>';
    }

    function fmt(v) {
      return '$' + Math.round(v).toLocaleString('es-CO') + ' COP';
    }

    function num(v) {
      return Number(v).toLocaleString('es-CO');
    }

    let html = '';

    // Period labels
    const periodLabel = type === 'year'
      ? 'Per\u00edodo actual vs mismo per\u00edodo a\u00f1o anterior'
      : 'Per\u00edodo actual vs per\u00edodo anterior';

    html += '<div class="report-compare-section-title">' + periodLabel + '</div>';
    html += '<div style="font-size:12px;color:var(--color-text-light);margin-bottom:12px;">';
    html += '<strong>Actual:</strong> ' + c.period.from + ' al ' + c.period.to;
    html += ' &mdash; <strong>Anterior:</strong> ' + p.period.from + ' al ' + p.period.to;
    html += '</div>';

    // Metric cards grid
    const metrics = [
      {
        label: 'Total consumido',
        cur: fmt(c.totalAmount),
        prev: fmt(p.totalAmount),
        change: comp.amountChange,
        pct: comp.amountChangePct
      },
      {
        label: 'Movimientos',
        cur: num(c.totalMovements),
        prev: num(p.totalMovements),
        change: comp.movementsChange,
        pct: comp.movementsChangePct
      },
      {
        label: 'Productos',
        cur: num(c.totalProducts),
        prev: num(p.totalProducts),
        change: comp.productsChange,
        pct: comp.productsChangePct
      },
      {
        label: 'Promedio diario',
        cur: fmt(c.avgDaily),
        prev: fmt(p.avgDaily),
        change: comp.avgDailyChange,
        pct: comp.avgDailyChangePct
      },
      {
        label: 'Habitaciones',
        cur: num(c.roomsWithConsumption),
        prev: num(p.roomsWithConsumption),
        change: comp.roomsChange,
        pct: comp.roomsChangePct
      }
    ];

    html += '<div class="report-compare-grid">';
    for (const m of metrics) {
      html += '<div class="report-card">';
      html += '<div class="report-card-value">' + m.cur + '</div>';
      html += '<div class="report-card-label">' + m.label + '</div>';
      html += '<div style="font-size:11px;color:var(--color-text-light);margin-top:2px;">Anterior: ' + m.prev + '</div>';
      html += pctHtml(m.change, m.pct);
      html += '</div>';
    }
    html += '</div>';

    // Top products side by side
    html += '<div class="report-compare-section-title">Productos m\u00e1s consumidos</div>';
    html += '<div class="report-compare-side">';

    html += '<div class="report-compare-side-col"><h4>Actual</h4>';
    for (const prod of c.topProducts) {
      html += '<div class="report-compare-product-row"><span>' + prod.name + '</span><span>' + num(prod.quantity) + ' uds &middot; ' + fmt(prod.amount) + '</span></div>';
    }
    if (c.topProducts.length === 0) html += '<div style="font-size:12px;color:var(--color-text-light);">Sin datos</div>';
    html += '</div>';

    html += '<div class="report-compare-side-col"><h4>Anterior</h4>';
    for (const prod of p.topProducts) {
      html += '<div class="report-compare-product-row"><span>' + prod.name + '</span><span>' + num(prod.quantity) + ' uds &middot; ' + fmt(prod.amount) + '</span></div>';
    }
    if (p.topProducts.length === 0) html += '<div style="font-size:12px;color:var(--color-text-light);">Sin datos</div>';
    html += '</div>';

    html += '</div>';

    // Floor comparison
    html += '<div class="report-compare-section-title">Consumo por piso</div>';
    html += '<div class="report-compare-side">';

    html += '<div class="report-compare-side-col"><h4>Actual</h4>';
    for (const f of c.floorBreakdown) {
      html += '<div class="report-compare-floor-row"><span>' + f.floorName + '</span><span>' + fmt(f.total) + '</span></div>';
    }
    if (c.floorBreakdown.length === 0) html += '<div style="font-size:12px;color:var(--color-text-light);">Sin datos</div>';
    html += '</div>';

    html += '<div class="report-compare-side-col"><h4>Anterior</h4>';
    for (const f of p.floorBreakdown) {
      html += '<div class="report-compare-floor-row"><span>' + f.floorName + '</span><span>' + fmt(f.total) + '</span></div>';
    }
    if (p.floorBreakdown.length === 0) html += '<div style="font-size:12px;color:var(--color-text-light);">Sin datos</div>';
    html += '</div>';

    html += '</div>';

    el.compareResults.innerHTML = html;
  }

  async function generateAll() {
    const from = el.reportFrom.value;
    const to = el.reportTo.value;

    if (!from || !to) {
      setStatus('Selecciona fecha inicial y final.', 'error');
      return;
    }

    const type = getSelectedReportType();
    lastFrom = from;
    lastTo = to;
    clearStatus();

    const showConsumos = type === 'both' || type === 'consumos';
    const showPerdidas = type === 'both' || type === 'perdidas';

    el.consumosSection.style.display = showConsumos ? 'block' : 'none';
    el.perdidasSection.style.display = showPerdidas ? 'block' : 'none';

    if (showConsumos) {
      el.consumosContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    }
    if (showPerdidas) {
      el.perdidasContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    }

    try {
      const promises = [];
      if (showConsumos) promises.push(apiFetch('/api/minibar/reports?from=' + from + '&to=' + to));
      if (showPerdidas) promises.push(apiFetch('/api/perdidas/report?from=' + from + '&to=' + to));

      if (promises.length === 0) {
        setStatus('Selecciona un tipo de reporte.', 'error');
        return;
      }

      const results = await Promise.all(promises);
      let idx = 0;
      if (showConsumos) renderConsumosSummary(results[idx++]);
      if (showPerdidas) renderPerdidasSummary(results[idx]);

      setStatus('Reportes generados correctamente.', 'success');
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  }

  async function downloadPdf(endpoint) {
    const from = el.reportFrom.value;
    const to = el.reportTo.value;
    if (!from || !to) {
      setStatus('Selecciona fecha inicial y final.', 'error');
      return;
    }
    setStatus('Generando PDF...', '');
    try {
      const res = await fetch(endpoint + '?from=' + from + '&to=' + to, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Error al generar PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const label = endpoint.includes('perdidas') ? 'perdidas' : 'consumos';
      a.href = url;
      a.download = 'informe-' + label + '-' + from + '-' + to + '.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('PDF descargado correctamente.', 'success');
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  }

  async function downloadExcel(endpoint) {
    const from = el.reportFrom.value;
    const to = el.reportTo.value;
    if (!from || !to) {
      setStatus('Selecciona fecha inicial y final.', 'error');
      return;
    }
    setStatus('Generando Excel...', '');
    try {
      const res = await fetch(endpoint + '?from=' + from + '&to=' + to, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Error al generar Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const label = endpoint.includes('perdidas') ? 'perdidas' : 'consumos';
      a.href = url;
      a.download = 'informe-' + label + '-' + from + '-' + to + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Excel descargado correctamente.', 'success');
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  }

  // Init date defaults
  (function initDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    el.reportFrom.value = firstDay.toISOString().split('T')[0];
    el.reportTo.value = today.toISOString().split('T')[0];
  })();

  // Events
  el.generateAllBtn.addEventListener('click', generateAll);

  el.exportConsumosPdf.addEventListener('click', () => downloadPdf('/api/minibar/reports/pdf'));
  el.exportConsumosExcel.addEventListener('click', () => downloadExcel('/api/minibar/reports/excel'));
  el.exportPerdidasPdf.addEventListener('click', () => downloadPdf('/api/perdidas/report/pdf'));
  el.exportPerdidasExcel.addEventListener('click', () => downloadExcel('/api/perdidas/report/excel'));

  el.comparePeriodBtn.addEventListener('click', () => loadCompare('period'));
  el.compareYearBtn.addEventListener('click', () => loadCompare('year'));

  if (typeof initTheme === 'function') initTheme();
  if (typeof initLanguage === 'function') initLanguage();
  if (typeof setupThemeSwitcher === 'function') setupThemeSwitcher(document.getElementById('app-theme-switcher'));
  if (typeof setupLangSelector === 'function') setupLangSelector(document.getElementById('app-lang-selector'));
  if (typeof loadCurrentUser === 'function') loadCurrentUser();
})();
