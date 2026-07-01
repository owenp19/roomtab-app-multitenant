(function () {
  'use strict';

  var currentUser = null;

  async function api(url, opts) {
    var res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
      ...opts
    });
    if (!res.ok) {
      if (res.status === 403) { window.location.href = '/landing.html'; return; }
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.error || 'Error ' + res.status);
    }
    return res.json();
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function switchSection(id) {
    document.querySelectorAll('.ga-nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.section === id); });
    document.querySelectorAll('.ga-section').forEach(function (s) { s.classList.toggle('active', s.id === 'ga-section-' + id); });
    if (id === 'dashboard') loadDashboard();
    else if (id === 'tenants') loadTenants();
    else if (id === 'plans') loadPlans();
    else if (id === 'invoices') loadInvoices();
  }

  document.querySelectorAll('.ga-nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () { switchSection(btn.dataset.section); });
  });

  // ============ DASHBOARD ============
  async function loadDashboard() {
    var el = document.getElementById('ga-dashboard-content');
    if (!el) return;
    el.innerHTML = '<div class="ga-empty"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    try {
      var data = await api('/api/admin/dashboard');
      var html = '<div class="ga-stats">' +
        '<div class="ga-stat-card"><div class="ga-stat-icon"><i class="ph-light ph-buildings"></i></div><div class="ga-stat-value">' + (data.totalTenants || 0) + '</div><div class="ga-stat-label">Hoteles registrados</div></div>' +
        '<div class="ga-stat-card"><div class="ga-stat-icon"><i class="ph-light ph-bed"></i></div><div class="ga-stat-value">' + (data.totalRooms || 0) + '</div><div class="ga-stat-label">Habitaciones totales</div></div>' +
        '<div class="ga-stat-card"><div class="ga-stat-icon"><i class="ph-light ph-user"></i></div><div class="ga-stat-value">' + (data.totalUsers || 0) + '</div><div class="ga-stat-label">Usuarios totales</div></div>' +
        '<div class="ga-stat-card"><div class="ga-stat-icon"><i class="ph-light ph-shopping-bag"></i></div><div class="ga-stat-value">' + (data.totalProducts || 0) + '</div><div class="ga-stat-label">Productos activos</div></div>' +
        '<div class="ga-stat-card"><div class="ga-stat-icon"><i class="ph-light ph-currency-dollar"></i></div><div class="ga-stat-value">' + (data.totalRevenue ? '$' + Number(data.totalRevenue).toLocaleString('es-CO') : '$0') + '</div><div class="ga-stat-label">Ingresos totales</div></div>' +
        '</div>';
      if (data.recentTenants && data.recentTenants.length) {
        html += '<h3 style="font-size:16px;margin:24px 0 12px;color:var(--color-heading)">Últimos hoteles registrados</h3><div class="ga-table-wrap"><table class="ga-table"><thead><tr><th>Hotel</th><th>Slug</th><th>Plan</th><th>Registro</th><th>Estado</th></tr></thead><tbody>';
        data.recentTenants.forEach(function (t) {
          html += '<tr><td><strong>' + esc(t.name) + '</strong></td><td><code>' + esc(t.slug) + '</code></td><td>' + esc(t.plan_name || '—') + '</td><td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString() : '—') + '</td><td><span class="ga-badge ' + (t.active ? 'active' : 'inactive') + '">' + (t.active ? 'Activo' : 'Inactivo') + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
      }
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<div class="ga-empty"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + esc(err.message) + '</p></div>';
    }
  }

  // ============ TENANTS ============
  var tenants = [];

  async function loadTenants() {
    var list = document.getElementById('ga-tenants-list');
    if (!list) return;
    list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    try {
      tenants = await api('/api/admin/tenants');
      renderTenants();
    } catch (err) {
      list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + esc(err.message) + '</p></div>';
    }
  }

  function renderTenants() {
    var list = document.getElementById('ga-tenants-list');
    if (!list) return;
    var search = (document.getElementById('ga-tenant-search').value || '').toLowerCase();
    var statusFilter = document.getElementById('ga-tenant-status-filter').value;

    var filtered = tenants.filter(function (t) {
      if (statusFilter !== '' && String(t.active) !== statusFilter) return false;
      if (search && t.name.toLowerCase().indexOf(search) === -1 && t.slug.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-buildings"></i><h3>No hay hoteles</h3><p>' + (tenants.length ? 'Ninguno coincide con los filtros.' : 'No hay hoteles registrados en la plataforma.') + '</p></div>';
      return;
    }

    var html = '<div class="ga-table-wrap"><table class="ga-table"><thead><tr>' +
      '<th>Hotel</th><th>Slug</th><th>Plan</th><th>Marca</th><th>Colores</th><th>Habs</th><th>Usuarios</th><th>Registro</th><th>Estado</th><th>Acciones</th>' +
      '</tr></thead><tbody>';
    filtered.forEach(function (t) {
      var planName = t.plan_name || '—';
      html += '<tr>' +
        '<td><strong>' + esc(t.name) + '</strong></td>' +
        '<td><code>' + esc(t.slug) + '</code></td>' +
        '<td>' + esc(planName) + '</td>' +
        '<td>' + (t.brand_name ? esc(t.brand_name) : '—') + '</td>' +
        '<td><span class="ga-color-dot" style="background:' + (t.primary_color || '#0B2E59') + '"></span> <span class="ga-color-dot" style="background:' + (t.secondary_color || '#C89B3C') + '"></span></td>' +
        '<td>' + (t.room_count != null ? t.room_count : '—') + '</td>' +
        '<td>' + (t.user_count != null ? t.user_count : '—') + '</td>' +
        '<td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString() : '—') + '</td>' +
        '<td><span class="ga-badge ' + (t.active ? 'active' : 'inactive') + '">' + (t.active ? 'Activo' : 'Inactivo') + '</span></td>' +
        '<td class="ga-actions">' +
          '<button class="ga-edit-tenant" data-id="' + t.id + '" title="Editar"><i class="ph-light ph-pencil"></i></button> ' +
          '<button class="ga-toggle-tenant" data-id="' + t.id + '" title="' + (t.active ? 'Desactivar' : 'Activar') + '"><i class="ph-light ph-' + (t.active ? 'pause' : 'play') + '"></i></button> ' +
          '<button class="ga-stats-tenant" data-id="' + t.id + '" title="Estadísticas"><i class="ph-light ph-chart-bar"></i></button>' +
        '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    list.innerHTML = html;

    list.querySelectorAll('.ga-edit-tenant').forEach(function (btn) {
      btn.addEventListener('click', function () { showTenantModal(Number(btn.dataset.id)); });
    });
    list.querySelectorAll('.ga-toggle-tenant').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleTenant(Number(btn.dataset.id)); });
    });
    list.querySelectorAll('.ga-stats-tenant').forEach(function (btn) {
      btn.addEventListener('click', function () { showTenantStats(Number(btn.dataset.id)); });
    });
  }

  async function showTenantModal(id) {
    var tenant = id ? tenants.find(function (t) { return t.id === id; }) : null;
    var title = tenant ? 'Editar hotel' : 'Nuevo hotel';

    var plans = [];
    try { plans = await api('/api/admin/plans'); } catch (e) {}
    var currentPlanId = tenant ? tenant.plan_id : null;

    var planOptions = '<option value="">Sin plan</option>';
    plans.forEach(function (p) {
      var sel = (p.id === currentPlanId) ? ' selected' : '';
      planOptions += '<option value="' + p.id + '"' + sel + '>' + esc(p.name) + ' ($' + Number(p.price_monthly || 0).toFixed(2) + '/mes)</option>';
    });

    var overlay = document.createElement('div');
    overlay.className = 'ga-modal-overlay';
    overlay.innerHTML =
      '<div class="ga-modal">' +
        '<h3>' + title + '</h3>' +
        '<div class="ga-field"><label>Nombre del hotel</label><input id="ga-modal-tenant-name" value="' + esc(tenant ? tenant.name : '') + '" /></div>' +
        '<div class="ga-field"><label>Slug</label><input id="ga-modal-tenant-slug" value="' + esc(tenant ? tenant.slug : '') + '" ' + (tenant ? 'readonly style="background:var(--color-border-soft)"' : '') + ' /></div>' +
        '<div class="ga-field"><label>Nombre de marca</label><input id="ga-modal-tenant-brand" value="' + esc(tenant ? (tenant.brand_name || '') : '') + '" /></div>' +
        '<div class="ga-field"><label>Color primario</label><input type="color" id="ga-modal-tenant-primary" value="' + (tenant ? tenant.primary_color : '#0B2E59') + '" style="width:60px;height:40px;padding:2px" /></div>' +
        '<div class="ga-field"><label>Color secundario</label><input type="color" id="ga-modal-tenant-secondary" value="' + (tenant ? tenant.secondary_color : '#C89B3C') + '" style="width:60px;height:40px;padding:2px" /></div>' +
        '<div class="ga-field"><label>Plan de suscripción</label><select id="ga-modal-tenant-plan">' + planOptions + '</select></div>' +
        '<div class="ga-modal-actions">' +
          '<button class="ga-btn-cancel ga-modal-close">Cancelar</button>' +
          '<button class="ga-btn-primary" id="ga-modal-tenant-save">' + (tenant ? 'Guardar' : 'Crear') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.ga-modal-close, .ga-modal-overlay').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target === overlay || e.target.classList.contains('ga-modal-close')) overlay.remove(); });
    });

    overlay.querySelector('#ga-modal-tenant-save').addEventListener('click', async function () {
      var body = {
        name: overlay.querySelector('#ga-modal-tenant-name').value.trim(),
        slug: overlay.querySelector('#ga-modal-tenant-slug').value.trim(),
        brandName: overlay.querySelector('#ga-modal-tenant-brand').value.trim(),
        primaryColor: overlay.querySelector('#ga-modal-tenant-primary').value,
        secondaryColor: overlay.querySelector('#ga-modal-tenant-secondary').value
      };
      if (!body.name) { alert('El nombre es obligatorio'); return; }

      var selectedPlanId = overlay.querySelector('#ga-modal-tenant-plan').value;
      var currentPlanStr = currentPlanId != null ? String(currentPlanId) : '';
      var planChanged = selectedPlanId && selectedPlanId !== currentPlanStr;

      try {
        var tenantId = id;
        if (tenant) {
          await api('/api/admin/tenants/' + id, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          var result = await api('/api/admin/tenants', { method: 'POST', body: JSON.stringify(body) });
          tenantId = result.id;
        }
        if (selectedPlanId && tenantId) {
          await api('/api/admin/tenants/' + tenantId + '/plan', { method: 'PUT', body: JSON.stringify({ planId: parseInt(selectedPlanId) }) });
        }
        overlay.remove();
        loadTenants();
      } catch (err) { alert('Error: ' + err.message); }
    });
  }

  async function toggleTenant(id) {
    try {
      await api('/api/admin/tenants/' + id + '/toggle', { method: 'PUT' });
      loadTenants();
    } catch (err) { alert('Error: ' + err.message); }
  }

  async function showTenantStats(id) {
    try {
      var stats = await api('/api/admin/tenants/' + id + '/stats');
      var tenant = tenants.find(function (t) { return t.id === id; });
      var overlay = document.createElement('div');
      overlay.className = 'ga-modal-overlay';
      overlay.innerHTML =
        '<div class="ga-modal">' +
          '<h3>Estadísticas: ' + esc(tenant ? tenant.name : '') + '</h3>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div style="background:var(--color-bg-alt);padding:12px;border-radius:var(--radius-sm);text-align:center"><div style="font-size:24px;font-weight:800;color:var(--color-heading)">' + stats.users + '</div><div style="font-size:12px;color:var(--color-muted)">Usuarios</div></div>' +
            '<div style="background:var(--color-bg-alt);padding:12px;border-radius:var(--radius-sm);text-align:center"><div style="font-size:24px;font-weight:800;color:var(--color-heading)">' + stats.floors + '</div><div style="font-size:12px;color:var(--color-muted)">Pisos</div></div>' +
            '<div style="background:var(--color-bg-alt);padding:12px;border-radius:var(--radius-sm);text-align:center"><div style="font-size:24px;font-weight:800;color:var(--color-heading)">' + stats.rooms + '</div><div style="font-size:12px;color:var(--color-muted)">Habitaciones</div></div>' +
            '<div style="background:var(--color-bg-alt);padding:12px;border-radius:var(--radius-sm);text-align:center"><div style="font-size:24px;font-weight:800;color:var(--color-heading)">' + stats.products + '</div><div style="font-size:12px;color:var(--color-muted)">Productos</div></div>' +
            '<div style="background:var(--color-bg-alt);padding:12px;border-radius:var(--radius-sm);text-align:center;grid-column:1/-1"><div style="font-size:24px;font-weight:800;color:var(--color-heading)">' + stats.consumptions + '</div><div style="font-size:12px;color:var(--color-muted)">Consumos registrados</div></div>' +
          '</div>' +
          '<div class="ga-modal-actions"><button class="ga-btn-cancel ga-modal-close">Cerrar</button></div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.querySelectorAll('.ga-modal-close, .ga-modal-overlay').forEach(function (el) {
        el.addEventListener('click', function (e) { if (e.target === overlay || e.target.classList.contains('ga-modal-close')) overlay.remove(); });
      });
    } catch (err) { alert('Error: ' + err.message); }
  }

  // ============ PLANS ============
  async function loadPlans() {
    var list = document.getElementById('ga-plans-list');
    if (!list) return;
    list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    try {
      var plans = await api('/api/admin/plans');
      if (!plans.length) {
        list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-credit-card"></i><h3>No hay planes</h3><p>Crea el primer plan usando el botón superior.</p></div>';
        return;
      }
      var html = '<div class="ga-plan-cards">';
      plans.forEach(function (p) {
        var features = [];
        if (p.max_rooms != null) features.push(p.max_rooms + ' habitaciones');
        if (p.max_users != null) features.push(p.max_users + ' usuarios');
        if (p.max_floors != null) features.push(p.max_floors + ' pisos');
        if (p.max_products != null) features.push(p.max_products + ' productos');
        if (p.features) {
          try { var extra = typeof p.features === 'string' ? JSON.parse(p.features) : p.features; if (Array.isArray(extra)) features = features.concat(extra); } catch (e) {}
        }
        var price = p.price_monthly ? '$' + Number(p.price_monthly).toFixed(2) + '/mes' : 'Gratuito';
        html +=
          '<div class="ga-plan-card' + (p.active ? '' : ' ga-plan-inactive') + '">' +
            '<div class="ga-plan-name">' + esc(p.name) + '</div>' +
            '<div class="ga-plan-price">' + price + '</div>' +
            '<div class="ga-plan-desc">' + esc(p.description || '') + '</div>' +
            '<div class="ga-plan-features">' + features.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div>' +
            '<div style="margin-top:12px"><button class="btn-secondary ga-edit-plan" data-id="' + p.id + '" style="font-size:12px;padding:6px 12px"><i class="ph-light ph-pencil"></i> Editar</button></div>' +
          '</div>';
      });
      html += '</div>';
      list.innerHTML = html;
      list.querySelectorAll('.ga-edit-plan').forEach(function (btn) {
        btn.addEventListener('click', function () { showPlanModal(Number(btn.dataset.id)); });
      });
    } catch (err) {
      list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + esc(err.message) + '</p></div>';
    }
  }

  async function showPlanModal(id) {
    var plan = null;
    if (id) {
      try {
        var plans = await api('/api/admin/plans');
        plan = plans.find(function (p) { return p.id === id; });
      } catch (e) {}
    }

    var overlay = document.createElement('div');
    overlay.className = 'ga-modal-overlay';
    overlay.innerHTML =
      '<div class="ga-modal">' +
        '<h3>' + (plan ? 'Editar plan' : 'Nuevo plan') + '</h3>' +
        '<div class="ga-field"><label>Nombre</label><input id="ga-plan-name" value="' + esc(plan ? plan.name : '') + '" /></div>' +
        '<div class="ga-field"><label>Slug</label><input id="ga-plan-slug" value="' + esc(plan ? plan.slug : '') + '" /></div>' +
        '<div class="ga-field"><label>Descripción</label><textarea id="ga-plan-desc" rows="2">' + esc(plan ? (plan.description || '') : '') + '</textarea></div>' +
        '<div class="ga-field"><label>Precio mensual ($)</label><input id="ga-plan-price" type="number" step="0.01" min="0" value="' + (plan ? Number(plan.price_monthly || 0).toFixed(2) : '0.00') + '" /></div>' +
        '<div class="ga-field"><label>Máx. habitaciones (vacío = ilimitado)</label><input id="ga-plan-rooms" type="number" min="0" value="' + (plan && plan.max_rooms != null ? plan.max_rooms : '') + '" /></div>' +
        '<div class="ga-field"><label>Máx. usuarios</label><input id="ga-plan-users" type="number" min="0" value="' + (plan && plan.max_users != null ? plan.max_users : '') + '" /></div>' +
        '<div class="ga-field"><label>Máx. pisos</label><input id="ga-plan-floors" type="number" min="0" value="' + (plan && plan.max_floors != null ? plan.max_floors : '') + '" /></div>' +
        '<div class="ga-field"><label>Máx. productos</label><input id="ga-plan-products" type="number" min="0" value="' + (plan && plan.max_products != null ? plan.max_products : '') + '" /></div>' +
        '<div class="ga-field"><label>Características extra (JSON)</label><textarea id="ga-plan-features" rows="2">' + esc(plan && plan.features ? (typeof plan.features === 'string' ? plan.features : JSON.stringify(plan.features)) : '') + '</textarea></div>' +
        '<div class="ga-field"><label><input type="checkbox" id="ga-plan-active" ' + (plan ? (plan.active ? 'checked' : '') : 'checked') + ' /> Activo</label></div>' +
        '<div class="ga-modal-actions">' +
          '<button class="ga-btn-cancel ga-modal-close">Cancelar</button>' +
          '<button class="ga-btn-primary" id="ga-plan-save">' + (plan ? 'Guardar' : 'Crear') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelectorAll('.ga-modal-close, .ga-modal-overlay').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target === overlay || e.target.classList.contains('ga-modal-close')) overlay.remove(); });
    });

    overlay.querySelector('#ga-plan-save').addEventListener('click', async function () {
      var payload = {
        name: overlay.querySelector('#ga-plan-name').value.trim(),
        slug: overlay.querySelector('#ga-plan-slug').value.trim(),
        description: overlay.querySelector('#ga-plan-desc').value.trim(),
        price_monthly: parseFloat(overlay.querySelector('#ga-plan-price').value) || 0,
        active: overlay.querySelector('#ga-plan-active').checked,
        max_rooms: overlay.querySelector('#ga-plan-rooms').value === '' ? null : parseInt(overlay.querySelector('#ga-plan-rooms').value),
        max_users: overlay.querySelector('#ga-plan-users').value === '' ? null : parseInt(overlay.querySelector('#ga-plan-users').value),
        max_floors: overlay.querySelector('#ga-plan-floors').value === '' ? null : parseInt(overlay.querySelector('#ga-plan-floors').value),
        max_products: overlay.querySelector('#ga-plan-products').value === '' ? null : parseInt(overlay.querySelector('#ga-plan-products').value),
        features: overlay.querySelector('#ga-plan-features').value.trim()
      };
      if (!payload.name) { alert('El nombre es obligatorio'); return; }
      try {
        var url = plan ? '/api/admin/plans/' + plan.id : '/api/admin/plans';
        var method = plan ? 'PUT' : 'POST';
        await api(url, { method: method, body: JSON.stringify(payload) });
        overlay.remove();
        loadPlans();
      } catch (err) { alert('Error: ' + err.message); }
    });
  }

  // ============ INVOICES ============
  async function loadInvoices() {
    var list = document.getElementById('ga-invoices-list');
    if (!list) return;
    list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';
    try {
      try { await fetch('/api/admin/billing/generate', { method: 'POST' }); } catch (e) {}
      var filter = document.getElementById('ga-invoice-filter');
      var statusFilter = filter ? filter.value : '';
      var url = '/api/admin/billing/invoices' + (statusFilter ? '?status=' + statusFilter : '');
      var invoices = await api(url);

      // Summary cards
      var totalPending = 0, totalPaid = 0, totalOverdue = 0, totalCancelled = 0;
      var countPending = 0, countPaid = 0, countOverdue = 0, countCancelled = 0;
      invoices.forEach(function (inv) {
        var amt = Number(inv.amount) || 0;
        if (inv.status === 'pending') { totalPending += amt; countPending++; }
        else if (inv.status === 'paid') { totalPaid += amt; countPaid++; }
        else if (inv.status === 'overdue') { totalOverdue += amt; countOverdue++; }
        else if (inv.status === 'cancelled') { totalCancelled += amt; countCancelled++; }
      });

      var html = '<div class="ga-stats" style="margin-bottom:16px">' +
        '<div class="ga-stat-card" style="padding:12px"><div class="ga-stat-value" style="font-size:20px">' + countPending + '</div><div class="ga-stat-label">Pendientes</div><div style="font-size:12px;color:var(--color-muted)">$' + totalPending.toFixed(2) + '</div></div>' +
        '<div class="ga-stat-card" style="padding:12px"><div class="ga-stat-value" style="font-size:20px">' + countPaid + '</div><div class="ga-stat-label">Pagadas</div><div style="font-size:12px;color:var(--color-muted)">$' + totalPaid.toFixed(2) + '</div></div>' +
        '<div class="ga-stat-card" style="padding:12px"><div class="ga-stat-value" style="font-size:20px">' + countOverdue + '</div><div class="ga-stat-label">Vencidas</div><div style="font-size:12px;color:var(--color-muted)">$' + totalOverdue.toFixed(2) + '</div></div>' +
        '<div class="ga-stat-card" style="padding:12px"><div class="ga-stat-value" style="font-size:20px">' + countCancelled + '</div><div class="ga-stat-label">Canceladas</div><div style="font-size:12px;color:var(--color-muted)">$' + totalCancelled.toFixed(2) + '</div></div>' +
        '</div>';

      if (!invoices.length) {
        list.innerHTML = html + '<div class="ga-empty"><i class="ph-light ph-receipt"></i><h3>No hay facturas</h3><p>No se encontraron facturas para los filtros actuales.</p></div>';
        return;
      }
      html += '<div class="ga-table-wrap"><table class="ga-table"><thead><tr><th>#</th><th>Hotel</th><th>Monto</th><th>Período</th><th>Vence</th><th>Estado</th><th>Pagado</th><th>Acciones</th></tr></thead><tbody>';
      invoices.forEach(function (inv) {
        var statusBadge = inv.status === 'paid' ? 'active' : (inv.status === 'overdue' ? 'inactive' : (inv.status === 'cancelled' ? 'inactive' : ''));
        var statusLabel = inv.status === 'paid' ? 'Pagada' : (inv.status === 'pending' ? 'Pendiente' : (inv.status === 'overdue' ? 'Vencida' : 'Cancelada'));
        html += '<tr>' +
          '<td><code>#' + inv.id + '</code></td>' +
          '<td>' + esc(inv.tenant_name || '—') + '</td>' +
          '<td><strong>$' + Number(inv.amount).toFixed(2) + '</strong></td>' +
          '<td>' + inv.period_start + ' al ' + inv.period_end + '</td>' +
          '<td>' + new Date(inv.due_date).toLocaleDateString() + '</td>' +
          '<td><span class="ga-badge ' + statusBadge + '">' + statusLabel + '</span></td>' +
          '<td>' + (inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—') + '</td>' +
          '<td><button class="ga-btn-invoice-detail" data-id="' + inv.id + '" style="padding:4px 8px;border:1px solid var(--color-border);border-radius:4px;background:transparent;color:var(--color-text);cursor:pointer;font-size:12px"><i class="ph-light ph-eye"></i></button></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      list.innerHTML = html;

      list.querySelectorAll('.ga-btn-invoice-detail').forEach(function (btn) {
        btn.addEventListener('click', function () { showInvoiceDetail(Number(btn.dataset.id), invoices); });
      });
    } catch (err) {
      list.innerHTML = '<div class="ga-empty"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + esc(err.message) + '</p></div>';
    }
  }

  function showInvoiceDetail(id, invoices) {
    var inv = invoices.find(function (i) { return i.id === id; });
    if (!inv) return;

    var statusLabel = inv.status === 'paid' ? 'Pagada' : (inv.status === 'pending' ? 'Pendiente' : (inv.status === 'overdue' ? 'Vencida' : 'Cancelada'));
    var statusBadge = inv.status === 'paid' ? 'active' : 'inactive';

    var overlay = document.createElement('div');
    overlay.className = 'ga-modal-overlay';
    overlay.innerHTML =
      '<div class="ga-modal" style="max-width:520px">' +
        '<h3>Factura #' + inv.id + '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Hotel</strong><br>' + esc(inv.tenant_name || '—') + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Estado</strong><br><span class="ga-badge ' + statusBadge + '">' + statusLabel + '</span></div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Monto</strong><br>$' + Number(inv.amount).toFixed(2) + ' ' + (inv.currency || 'COP') + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Período</strong><br>' + inv.period_start + ' al ' + inv.period_end + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Vence</strong><br>' + new Date(inv.due_date).toLocaleDateString() + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Pagado</strong><br>' + (inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—') + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Creada</strong><br>' + new Date(inv.created_at).toLocaleDateString() + '</div>' +
          '<div><strong style="color:var(--color-muted);font-size:11px;text-transform:uppercase">Suscripción</strong><br>#' + (inv.subscription_id || '—') + '</div>' +
        '</div>' +
        '<div class="ga-modal-actions"><button class="ga-btn-cancel ga-modal-close">Cerrar</button></div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelectorAll('.ga-modal-close, .ga-modal-overlay').forEach(function (el) {
      el.addEventListener('click', function (e) { if (e.target === overlay || e.target.classList.contains('ga-modal-close')) overlay.remove(); });
    });
  }

  // ============ EVENTS ============
  document.getElementById('ga-add-tenant-btn').addEventListener('click', function () { showTenantModal(null); });
  document.getElementById('ga-refresh-tenants-btn').addEventListener('click', loadTenants);
  document.getElementById('ga-tenant-search').addEventListener('input', renderTenants);
  document.getElementById('ga-tenant-status-filter').addEventListener('change', renderTenants);

  document.getElementById('ga-add-plan-btn').addEventListener('click', function () { showPlanModal(null); });
  document.getElementById('ga-refresh-plans-btn').addEventListener('click', loadPlans);

  document.getElementById('ga-refresh-invoices-btn').addEventListener('click', loadInvoices);
  document.getElementById('ga-invoice-filter').addEventListener('change', loadInvoices);

  // ============ INIT ============
  // Load user info
  (async function () {
    try {
      var user = await api('/api/auth/me');
      var display = document.getElementById('ga-user-display');
      if (display && user) display.textContent = user.full_name || user.email || '';
    } catch (e) {}
  })();

  loadDashboard();
})();
