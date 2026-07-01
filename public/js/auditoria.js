(function () {
  'use strict';

  const el = {
    filterFrom: document.getElementById('filter-from'),
    filterTo: document.getElementById('filter-to'),
    filterUser: document.getElementById('filter-user'),
    filterModule: document.getElementById('filter-module'),
    filterAction: document.getElementById('filter-action'),
    filterSearch: document.getElementById('filter-search'),
    filterApply: document.getElementById('filter-apply-btn'),
    filterClear: document.getElementById('filter-clear-btn'),

    exportPdf: document.getElementById('export-pdf-btn'),
    exportExcel: document.getElementById('export-excel-btn'),

    auditContent: document.getElementById('audit-content'),
    auditSubtitle: document.getElementById('audit-subtitle'),
    paginationTop: document.getElementById('audit-pagination-top'),
    paginationBottom: document.getElementById('audit-pagination-bottom'),
    auditStatus: document.getElementById('audit-status'),

    summaryTotal: document.getElementById('summary-total'),
    summaryTopUser: document.getElementById('summary-top-user'),
    summaryTopModule: document.getElementById('summary-top-module'),
    summaryConsumptions: document.getElementById('summary-consumptions'),
    summaryRestocks: document.getElementById('summary-restocks'),
    summaryLosses: document.getElementById('summary-losses'),
    summaryReports: document.getElementById('summary-reports'),
    summaryLastAction: document.getElementById('summary-last-action'),

    detailModal: document.getElementById('detail-modal'),
    detailBody: document.getElementById('detail-body'),
    closeDetailBtn: document.getElementById('close-detail-btn'),
    closeDetailBtn2: document.getElementById('close-detail-btn2')
  };

  let currentPage = 1;
  let currentFilters = {};

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

  function setStatus(msg, type) {
    if (!el.auditStatus) return;
    el.auditStatus.textContent = msg;
    el.auditStatus.className = 'status' + (type ? ' ' + type : '');
  }

  function getFilters() {
    return {
      from: el.filterFrom.value || '',
      to: el.filterTo.value || '',
      userId: el.filterUser.value || '',
      moduleName: el.filterModule.value || '',
      actionType: el.filterAction.value || '',
      search: el.filterSearch.value.trim() || ''
    };
  }

  function buildQueryString(filters, page) {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.moduleName) params.set('moduleName', filters.moduleName);
    if (filters.actionType) params.set('actionType', filters.actionType);
    if (filters.search) params.set('search', filters.search);
    if (page) params.set('page', page);
    params.set('limit', '50');
    return params.toString();
  }

  const ACTION_LABELS = {
    login: { label: 'Inicio de sesión', icon: 'ph-light ph-sign-in' },
    logout: { label: 'Cierre de sesión', icon: 'ph-light ph-sign-out' },
    consumption_created: { label: 'Consumo registrado', icon: 'ph-light ph-shopping-bag' },
    whatsapp_sent: { label: 'WhatsApp enviado', icon: 'ph-light ph-whatsapp-logo' },
    restock_created: { label: 'Reposición registrada', icon: 'ph-light ph-plus-square' },
    loss_created: { label: 'Pérdida registrada', icon: 'ph-light ph-warning-circle' },
    damage_created: { label: 'Daño registrado', icon: 'ph-light ph-warning' },
    inventory_adjusted: { label: 'Inventario ajustado', icon: 'ph-light ph-wrench' },
    room_status_changed: { label: 'Estado de habitación cambiado', icon: 'ph-light ph-door' },
    report_generated: { label: 'Reporte generado', icon: 'ph-light ph-file-text' },
    pdf_exported: { label: 'PDF exportado', icon: 'ph-light ph-file-pdf' },
    excel_exported: { label: 'Excel exportado', icon: 'ph-light ph-file' },
    product_created: { label: 'Producto creado', icon: 'ph-light ph-package' },
    product_updated: { label: 'Producto editado', icon: 'ph-light ph-pencil' },
    product_disabled: { label: 'Producto desactivado', icon: 'ph-light ph-prohibit' },
    price_updated: { label: 'Precio actualizado', icon: 'ph-light ph-currency-dollar' },
    ideal_qty_updated: { label: 'Cantidad ideal actualizada', icon: 'ph-light ph-sort-ascending' },
    profile_updated: { label: 'Perfil actualizado', icon: 'ph-light ph-user-check' },
    profile_photo_changed: { label: 'Foto de perfil cambiada', icon: 'ph-light ph-camera' },
    record_voided: { label: 'Registro anulado', icon: 'ph-light ph-arrow-u-up-left' },
    login_records_cleared: { label: 'Registros de inicio de sesión eliminados', icon: 'ph-light ph-prohibit' }
  };

  function getActionInfo(type) {
    return ACTION_LABELS[type] || { label: type || '—', icon: 'ph-light ph-question' };
  }

  function formatDate(d) {
    return d.toLocaleDateString('es-CO');
  }

  function formatTime(d) {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function formatCOP(value) {
    const n = Number(value) || 0;
    return '$' + Math.round(n).toLocaleString('es-CO') + ' COP';
  }

  // --- Load filters data ---
  async function loadFilterOptions() {
    try {
      const [users, modules, actions] = await Promise.all([
        apiFetch('/api/audit/users'),
        apiFetch('/api/audit/modules'),
        apiFetch('/api/audit/action-types')
      ]);

      el.filterUser.innerHTML = '<option value="">Todos los usuarios</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.user_id;
        opt.textContent = u.user_name;
        el.filterUser.appendChild(opt);
      });

      el.filterModule.innerHTML = '<option value="">Todos los módulos</option>';
      modules.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        el.filterModule.appendChild(opt);
      });

      el.filterAction.innerHTML = '<option value="">Todas las acciones</option>';
      actions.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        const info = getActionInfo(a);
        opt.textContent = info.label;
        el.filterAction.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading filter options:', err);
    }
  }

  // --- Summary ---
  async function loadSummary() {
    try {
      const filters = getFilters();
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const data = await apiFetch('/api/audit/summary?' + params.toString());

      el.summaryTotal.textContent = data.totalActions.toLocaleString('es-CO');
      el.summaryTopUser.textContent = data.topUser;
      el.summaryTopModule.textContent = data.topModule;
      el.summaryConsumptions.textContent = data.consumptionCount.toLocaleString('es-CO');
      el.summaryRestocks.textContent = data.restockCount.toLocaleString('es-CO');
      el.summaryLosses.textContent = data.lossCount.toLocaleString('es-CO');
      el.summaryReports.textContent = data.reportCount.toLocaleString('es-CO');
      if (data.lastAction) {
        const d = new Date(data.lastAction.created_at);
        el.summaryLastAction.textContent = getActionInfo(data.lastAction.action_type).label + ' - ' + formatDate(d) + ' ' + formatTime(d);
      } else {
        el.summaryLastAction.textContent = '—';
      }
    } catch (err) {
      console.error('Error loading summary:', err);
    }
  }

  // --- Load logs ---
  async function loadLogs(page) {
    currentPage = page || 1;
    currentFilters = getFilters();

    el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';

    try {
      const qs = buildQueryString(currentFilters, currentPage);
      const result = await apiFetch('/api/audit/logs?' + qs);

      const logs = result.data || [];
      const pagination = result.pagination || { page: 1, total: 0, totalPages: 0 };

      el.auditSubtitle.textContent = 'Total: ' + pagination.total + ' registros';

      if (!logs.length) {
        el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-clipboard-text"></i><h3>Sin registros</h3><p>No se encontraron registros con los filtros actuales.</p></div>';
        renderPagination(pagination);
        return;
      }

      let html = '<div class="audit-table-wrap"><table class="audit-table"><thead><tr>' +
        '<th class="sortable" data-sort="created_at">Fecha <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Hora</th>' +
        '<th class="sortable" data-sort="user_name">Usuario <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Rol</th>' +
        '<th class="sortable" data-sort="module_name">Módulo <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th class="sortable" data-sort="action_type">Acción <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Piso</th>' +
        '<th>Habitación</th>' +
        '<th>Valor</th>' +
        '<th></th>' +
        '</tr></thead><tbody>';

      for (const log of logs) {
        const d = new Date(log.created_at);
        const actionInfo = getActionInfo(log.action_type);
        const amount = log.amount ? formatCOP(log.amount) : '—';
        const roomLabel = log.room_number ? 'Hab ' + log.room_number : '—';
        const floorLabel = log.floor_name || '—';

        html += '<tr>' +
          '<td class="audit-date">' + formatDate(d) + '</td>' +
          '<td class="audit-time">' + formatTime(d) + '</td>' +
          '<td><strong>' + (log.user_name || '—') + '</strong></td>' +
          '<td><span class="audit-role-badge">' + (log.user_role || '—') + '</span></td>' +
          '<td>' + (log.module_name || '—') + '</td>' +
          '<td><span class="audit-action-badge ' + log.action_type + '"><i class="' + actionInfo.icon + '"></i> ' + actionInfo.label + '</span></td>' +
          '<td>' + floorLabel + '</td>' +
          '<td>' + roomLabel + '</td>' +
          '<td class="audit-amount">' + amount + '</td>' +
          '<td><button class="btn-icon btn-detail-audit" data-id="' + log.id + '" title="Ver detalle"><i class="ph-light ph-eye"></i></button></td>' +
          '</tr>';
      }

      html += '</tbody></table></div>';
      el.auditContent.innerHTML = html;
      renderPagination(pagination);

      // Sort click handlers
      el.auditContent.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const sortBy = th.dataset.sort;
          const currentQs = buildQueryString(currentFilters, currentPage);
          const currentParams = new URLSearchParams(currentQs);
          const currentSort = currentParams.get('sortBy') || 'created_at';
          const currentDir = currentParams.get('sortDir') || 'DESC';

          let newDir = 'ASC';
          if (currentSort === sortBy && currentDir === 'ASC') {
            newDir = 'DESC';
          }

          loadLogsWithSort(sortBy, newDir);
        });
      });

      // Detail click handlers
      el.auditContent.querySelectorAll('.btn-detail-audit').forEach(btn => {
        btn.addEventListener('click', () => showDetail(Number(btn.dataset.id)));
      });
    } catch (err) {
      el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function loadLogsWithSort(sortBy, sortDir) {
    currentFilters = getFilters();
    const params = new URLSearchParams(buildQueryString(currentFilters, currentPage));
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    loadLogsWithParams(params);
  }

  async function loadLogsWithParams(params) {
    el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    try {
      const result = await apiFetch('/api/audit/logs?' + params.toString());
      const logs = result.data || [];
      const pagination = result.pagination || { page: 1, total: 0, totalPages: 0 };

      el.auditSubtitle.textContent = 'Total: ' + pagination.total + ' registros';

      if (!logs.length) {
        el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-clipboard-text"></i><h3>Sin registros</h3><p>No se encontraron registros con los filtros actuales.</p></div>';
        renderPagination(pagination);
        return;
      }

      let html = '<div class="audit-table-wrap"><table class="audit-table"><thead><tr>' +
        '<th class="sortable" data-sort="created_at">Fecha <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Hora</th>' +
        '<th class="sortable" data-sort="user_name">Usuario <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Rol</th>' +
        '<th class="sortable" data-sort="module_name">Módulo <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th class="sortable" data-sort="action_type">Acción <i class="ph-light ph-arrows-down-up"></i></th>' +
        '<th>Piso</th>' +
        '<th>Habitación</th>' +
        '<th>Valor</th>' +
        '<th></th>' +
        '</tr></thead><tbody>';

      for (const log of logs) {
        const d = new Date(log.created_at);
        const actionInfo = getActionInfo(log.action_type);
        const amount = log.amount ? formatCOP(log.amount) : '—';
        const roomLabel = log.room_number ? 'Hab ' + log.room_number : '—';
        const floorLabel = log.floor_name || '—';

        html += '<tr>' +
          '<td class="audit-date">' + formatDate(d) + '</td>' +
          '<td class="audit-time">' + formatTime(d) + '</td>' +
          '<td><strong>' + (log.user_name || '—') + '</strong></td>' +
          '<td><span class="audit-role-badge">' + (log.user_role || '—') + '</span></td>' +
          '<td>' + (log.module_name || '—') + '</td>' +
          '<td><span class="audit-action-badge ' + log.action_type + '"><i class="' + actionInfo.icon + '"></i> ' + actionInfo.label + '</span></td>' +
          '<td>' + floorLabel + '</td>' +
          '<td>' + roomLabel + '</td>' +
          '<td class="audit-amount">' + amount + '</td>' +
          '<td><button class="btn-icon btn-detail-audit" data-id="' + log.id + '" title="Ver detalle"><i class="ph-light ph-eye"></i></button></td>' +
          '</tr>';
      }

      html += '</tbody></table></div>';
      el.auditContent.innerHTML = html;
      renderPagination(pagination);

      el.auditContent.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const sb = th.dataset.sort;
          const p = new URLSearchParams(params.toString());
          const currentSort = p.get('sortBy') || 'created_at';
          const currentDir = p.get('sortDir') || 'DESC';
          let newDir = 'ASC';
          if (currentSort === sb && currentDir === 'ASC') newDir = 'DESC';
          p.set('sortBy', sb);
          p.set('sortDir', newDir);
          loadLogsWithParams(p);
        });
      });

      el.auditContent.querySelectorAll('.btn-detail-audit').forEach(btn => {
        btn.addEventListener('click', () => showDetail(Number(btn.dataset.id)));
      });
    } catch (err) {
      el.auditContent.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function renderPagination(pagination) {
    const { page, totalPages, total } = pagination;

    const render = (container) => {
      if (!container) return;
      if (totalPages <= 1 && total <= 50) {
        container.innerHTML = '';
        return;
      }
      let html = '<div class="pagination-controls">';
      html += '<button class="btn-ghost btn-sm" ' + (page <= 1 ? 'disabled' : '') + ' data-page="' + (page - 1) + '"><i class="ph-light ph-caret-left"></i> Anterior</button>';
      html += '<span class="pagination-info">Página ' + page + ' de ' + totalPages + ' (' + total + ' registros)</span>';
      html += '<button class="btn-ghost btn-sm" ' + (page >= totalPages ? 'disabled' : '') + ' data-page="' + (page + 1) + '">Siguiente <i class="ph-light ph-caret-right"></i></button>';
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = Number(btn.dataset.page);
          if (p > 0 && p <= totalPages) {
            loadLogs(p);
          }
        });
      });
    };

    render(el.paginationTop);
    render(el.paginationBottom);
  }

  // --- Detail ---
  async function showDetail(id) {
    el.detailModal.classList.add('modal-open');
    el.detailModal.setAttribute('aria-hidden', 'false');
    el.detailBody.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando detalle...</h3></div>';

    try {
      const log = await apiFetch('/api/audit/logs/' + id);
      const d = new Date(log.created_at);
      const actionInfo = getActionInfo(log.action_type);
      const amount = log.amount ? formatCOP(log.amount) : '—';

      let prevHtml = '—';
      let newHtml = '—';
      try {
        if (log.previous_data) {
          const prev = typeof log.previous_data === 'string' ? JSON.parse(log.previous_data) : log.previous_data;
          prevHtml = '<pre class="audit-json">' + JSON.stringify(prev, null, 2) + '</pre>';
        }
        if (log.new_data) {
          const nd = typeof log.new_data === 'string' ? JSON.parse(log.new_data) : log.new_data;
          newHtml = '<pre class="audit-json">' + JSON.stringify(nd, null, 2) + '</pre>';
        }
      } catch (e) {
        // ignore parse errors
      }

      const html = '<div class="audit-detail-grid">' +
        '<div class="audit-detail-section"><h4>Información del usuario</h4>' +
        '<table class="audit-detail-table"><tr><td>Nombre</td><td><strong>' + (log.user_name || '—') + '</strong></td></tr>' +
        '<tr><td>ID</td><td>' + (log.user_id || '—') + '</td></tr>' +
        '<tr><td>Rol</td><td><span class="audit-role-badge">' + (log.user_role || '—') + '</span></td></tr></table></div>' +

        '<div class="audit-detail-section"><h4>Acción realizada</h4>' +
        '<table class="audit-detail-table"><tr><td>Módulo</td><td>' + (log.module_name || '—') + '</td></tr>' +
        '<tr><td>Acción</td><td><span class="audit-action-badge ' + log.action_type + '"><i class="' + actionInfo.icon + '"></i> ' + actionInfo.label + '</span></td></tr>' +
        '<tr><td>Descripción</td><td>' + (log.action_description || '—') + '</td></tr>' +
        '<tr><td>Estado</td><td><span class="audit-status-badge ' + log.status + '">' + (log.status || '—') + '</span></td></tr></table></div>' +

        '<div class="audit-detail-section"><h4>Ubicación</h4>' +
        '<table class="audit-detail-table"><tr><td>Piso</td><td>' + (log.floor_name || '—') + '</td></tr>' +
        '<tr><td>Habitación</td><td>' + (log.room_number ? 'Hab ' + log.room_number : '—') + '</td></tr></table></div>' +

        '<div class="audit-detail-section"><h4>Valores</h4>' +
        '<table class="audit-detail-table"><tr><td>Cantidad anterior</td><td>' + (log.quantity_before != null ? log.quantity_before : '—') + '</td></tr>' +
        '<tr><td>Cantidad nueva</td><td>' + (log.quantity_after != null ? log.quantity_after : '—') + '</td></tr>' +
        '<tr><td>Valor total</td><td class="audit-amount">' + amount + '</td></tr></table></div>' +

        '<div class="audit-detail-section audit-detail-full"><h4>Datos anteriores</h4>' + prevHtml + '</div>' +
        '<div class="audit-detail-section audit-detail-full"><h4>Datos nuevos</h4>' + newHtml + '</div>' +

        '<div class="audit-detail-section"><h4>Información técnica</h4>' +
        '<table class="audit-detail-table"><tr><td>Fecha</td><td>' + formatDate(d) + '</td></tr>' +
        '<tr><td>Hora</td><td>' + formatTime(d) + '</td></tr>' +
        '<tr><td>IP</td><td>' + (log.ip_address || '—') + '</td></tr>' +
        '<tr><td>Dispositivo</td><td style="font-size:11px;word-break:break-all;">' + (log.device_info || '—') + '</td></tr></table></div>' +
        '</div>';

      el.detailBody.innerHTML = html;
    } catch (err) {
      el.detailBody.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function closeDetail() {
    el.detailModal.classList.remove('modal-open');
    el.detailModal.setAttribute('aria-hidden', 'true');
  }

  // --- Export ---
  function buildExportParams() {
    const filters = getFilters();
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.moduleName) params.set('moduleName', filters.moduleName);
    if (filters.actionType) params.set('actionType', filters.actionType);
    return params.toString();
  }

  function exportPDF() {
    const params = buildExportParams();
    window.open('/api/audit/export/pdf?' + params, '_blank');
  }

  function exportExcel() {
    const params = buildExportParams();
    window.open('/api/audit/export/excel?' + params, '_blank');
  }

  // --- Charts ---
  var _auditCharts = {};

  function destroyCharts() {
    for (var key in _auditCharts) {
      if (_auditCharts[key]) { _auditCharts[key].destroy(); delete _auditCharts[key]; }
    }
  }

  function renderChart(id, config) {
    var canvas = document.getElementById(id);
    if (!canvas) return null;
    if (_auditCharts[id]) { _auditCharts[id].destroy(); delete _auditCharts[id]; }
    var ctx = canvas.getContext('2d');
    try {
      _auditCharts[id] = new Chart(ctx, config);
    } catch (e) {
      console.warn('Chart error for ' + id + ':', e.message);
    }
  }

  var CHART_COLORS = [
    '#0B2E59', '#C89B3C', '#2E7D5E', '#d1453b', '#e8a838',
    '#4a90d9', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
  ];

  function loadCharts() {
    var params = new URLSearchParams();
    if (el.filterFrom.value) params.set('days', '90');
    else params.set('days', '30');

    apiFetch('/api/audit/chart-data?' + params.toString()).then(function(data) {
      if (!data) return;
      destroyCharts();

      // Actions by day (line chart)
      if (data.byDay && data.byDay.length) {
        renderChart('chart-actions-by-day', {
          type: 'line',
          data: {
            labels: data.byDay.map(function(d) { return d.day ? d.day.slice(5) : ''; }),
            datasets: [{
              label: 'Acciones',
              data: data.byDay.map(function(d) { return Number(d.count); }),
              borderColor: '#0B2E59',
              backgroundColor: 'rgba(11, 46, 89, 0.1)',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        });
      }

      // Actions by type (doughnut)
      if (data.byType && data.byType.length) {
        renderChart('chart-actions-by-type', {
          type: 'doughnut',
          data: {
            labels: data.byType.map(function(d) { return d.action_type; }),
            datasets: [{
              data: data.byType.map(function(d) { return Number(d.count); }),
              backgroundColor: CHART_COLORS
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } }
            }
          }
        });
      }

      // Actions by module (bar)
      if (data.byModule && data.byModule.length) {
        renderChart('chart-actions-by-module', {
          type: 'bar',
          data: {
            labels: data.byModule.map(function(d) { return d.module_name; }),
            datasets: [{
              label: 'Acciones',
              data: data.byModule.map(function(d) { return Number(d.count); }),
              backgroundColor: CHART_COLORS
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        });
      }

      // Actions by user (horizontal bar)
      if (data.byUser && data.byUser.length) {
        renderChart('chart-actions-by-user', {
          type: 'bar',
          data: {
            labels: data.byUser.map(function(d) { return d.user_name || 'Anónimo'; }),
            datasets: [{
              label: 'Acciones',
              data: data.byUser.map(function(d) { return Number(d.count); }),
              backgroundColor: CHART_COLORS
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        });
      }
    }).catch(function(err) {
      console.warn('Error loading chart data:', err);
    });
  }

  // --- Init ---
  function init() {
    loadFilterOptions();
    loadSummary();
    loadLogs(1);
    loadCharts();

    el.filterApply.addEventListener('click', () => { loadLogs(1); loadCharts(); });
    el.filterClear.addEventListener('click', async () => {
      if (!confirm('¿Estás seguro de eliminar todos los registros de inicio de sesión?')) return;
      try {
        const result = await apiFetch('/api/audit/clear-logins', { method: 'POST' });
        setStatus('Se eliminaron ' + result.deleted + ' registros de inicio de sesión.', 'success');
        loadLogs(1);
        loadSummary();
        loadCharts();
      } catch (err) {
        setStatus(err.message, 'error');
      }
    });

    el.filterFrom.addEventListener('change', function() { loadSummary(); loadCharts(); });
    el.filterTo.addEventListener('change', function() { loadSummary(); loadCharts(); });

    el.exportPdf.addEventListener('click', exportPDF);
    el.exportExcel.addEventListener('click', exportExcel);

    el.closeDetailBtn.addEventListener('click', closeDetail);
    el.closeDetailBtn2.addEventListener('click', closeDetail);
    el.detailModal.addEventListener('click', (e) => {
      if (e.target === el.detailModal) closeDetail();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetail();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
