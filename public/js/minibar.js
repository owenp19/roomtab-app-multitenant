(function () {
  'use strict';

  let floors = [];
  let rooms = [];
  let inventory = [];
  let selectedFloorId = null;
  let selectedRoomId = null;
  let movements = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const el = {
    viewFloors: $('#view-floors'),
    viewRooms: $('#view-rooms'),
    viewRoomDetail: $('#view-room-detail'),
    floorsContainer: $('#floors-container'),
    roomsContainer: $('#rooms-container'),
    roomsHeading: $('#rooms-heading'),
    roomsSubtitle: $('#rooms-subtitle'),
    rdFloorName: $('#rd-floor-name'),
    rdRoomName: $('#rd-room-name'),
    breadcrumb: $('#breadcrumb'),
    pageDescription: $('#page-description'),
    roomDetailSubtitle: $('#room-detail-subtitle'),
    backToFloorsBtn: $('#back-to-floors-btn'),
    backToRoomsBtn: $('#back-to-rooms-btn'),

    inventoryContainer: $('#inventory-container'),
    invSaveStatus: $('#inv-save-status'),
    refreshInventoryBtn: $('#refresh-inventory-btn'),

    consumptionProducts: $('#consumption-products-container'),
    consumptionTotal: $('#consumption-total'),
    saveConsumptionBtn: $('#save-consumption-btn'),
    saveAndSendBtn: $('#save-and-send-btn'),
    consumptionStatus: $('#consumption-status'),

    restockProducts: $('#restock-products-container'),
    saveRestockBtn: $('#save-restock-btn'),
    restockStatus: $('#restock-status'),

    adjustProducts: $('#adjust-products-container'),
    saveAdjustBtn: $('#save-adjust-btn'),
    adjustStatus: $('#adjust-status'),

    historyContainer: $('#history-container'),
    refreshHistoryBtn: $('#refresh-history-btn'),

    previewModal: $('#preview-modal'),
    previewContent: $('#preview-content'),
    previewCopyBtn: $('#preview-copy-btn'),
    previewSendBtn: $('#preview-send-btn'),
    closePreviewBtn: $('#close-preview-btn'),
    closePreviewBtn2: $('#close-preview-btn2')
  };

  function showView(viewId) {
    $$('.view-section').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }

  function switchTab(tabName) {
    $$('.room-tab').forEach((t) => t.classList.remove('active'));
    $$('.tab-content').forEach((c) => c.classList.remove('active'));
    const tabBtn = $(`.room-tab[data-tab="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabContent = $(`#tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');

    // Load data on demand per tab
    if (tabName === 'inventory') renderInventory();
    else if (tabName === 'consumption') renderConsumptionForm();
    else if (tabName === 'restock') renderRestockForm();
    else if (tabName === 'adjust') renderAdjustForm();
    else if (tabName === 'history') loadAndRenderHistory();
  }

  function updateBreadcrumb(view, floorName, roomNumber) {
    if (!el.breadcrumb) return;
    if (view === 'view-floors') {
      el.breadcrumb.innerHTML = `
        <span class="crumb">
          <i class="ph-light ph-house"></i>
          <span class="crumb-current">Minibares</span>
        </span>
      `;
      if (el.pageDescription) {
        el.pageDescription.textContent = 'Selecciona un piso para ver sus habitaciones y gestionar el minibar.';
      }
    } else if (view === 'view-rooms') {
      el.breadcrumb.innerHTML = `
        <span class="crumb">
          <i class="ph-light ph-house"></i>
          <span class="crumb-link" id="crumb-link-floors">Minibares</span>
        </span>
        <span class="crumb-sep"><i class="ph-light ph-caret-right"></i></span>
        <span class="crumb">
          <span class="crumb-current">${floorName || 'Piso'}</span>
        </span>
      `;
      const link = document.getElementById('crumb-link-floors');
      if (link) link.addEventListener('click', goBackToFloors);
      if (el.pageDescription) {
        el.pageDescription.textContent = 'Selecciona una habitaci\u00f3n del ' + (floorName || 'Piso') + ' para gestionar su minibar.';
      }
    } else if (view === 'view-room-detail') {
      el.breadcrumb.innerHTML = `
        <span class="crumb">
          <i class="ph-light ph-house"></i>
          <span class="crumb-link" id="crumb-link-floors-det">Minibares</span>
        </span>
        <span class="crumb-sep"><i class="ph-light ph-caret-right"></i></span>
        <span class="crumb">
          <span class="crumb-link" id="crumb-link-rooms-det">${floorName || 'Piso'}</span>
        </span>
        <span class="crumb-sep"><i class="ph-light ph-caret-right"></i></span>
        <span class="crumb">
          <span class="crumb-current">Habitaci\u00f3n ${roomNumber || ''}</span>
        </span>
      `;
      const linkFloors = document.getElementById('crumb-link-floors-det');
      if (linkFloors) linkFloors.addEventListener('click', goBackToFloors);
      const linkRooms = document.getElementById('crumb-link-rooms-det');
      if (linkRooms) linkRooms.addEventListener('click', goBackToRooms);
      if (el.pageDescription) {
        el.pageDescription.textContent = 'Gestionando minibar de ' + (floorName || 'Piso') + ', Habitaci\u00f3n ' + (roomNumber || '');
      }
    }
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Error ' + res.status);
    }
    return res.json();
  }

  function goBackToFloors() {
    selectedFloorId = null;
    selectedRoomId = null;
    showView('view-floors');
    renderFloors();
    updateBreadcrumb('view-floors');
  }

  function goBackToRooms() {
    selectedRoomId = null;
    showView('view-rooms');
    updateBreadcrumb('view-rooms', getFloorName(selectedFloorId));
    if (selectedFloorId) loadRooms(selectedFloorId);
    else renderRooms();
  }

  function getFloorName(floorId) {
    const floor = floors.find((f) => f.id === floorId);
    return floor ? floor.name : 'Piso';
  }

  function getRoomNumber(roomId) {
    const room = rooms.find((r) => r.id === roomId);
    return room ? room.room_number : '';
  }

  function formatCOP(value) {
    const n = Number(value) || 0;
    return '$' + Math.round(n).toLocaleString('es-CO') + ' COP';
  }

  // ============ DASHBOARD ============

  // ============ FLOORS ============

  async function loadFloors() {
    try {
      floors = await apiFetch('/api/minibar/floors');
      renderFloors();
    } catch (err) {
      el.floorsContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error al cargar</h3><p>' + err.message + '</p></div>';
    } finally {
      if (window.Loader) Loader.hide();
    }
  }

  function getFloorStatusIcon(floorId) {
    var floorRooms = window._floorRoomsCache && window._floorRoomsCache[floorId];
    if (!floorRooms || !floorRooms.length) return '<i class="ph-light ph-buildings"></i>';
    var hasAlert = floorRooms.some(function(r) { return r.status === 'alert'; });
    var hasPending = floorRooms.some(function(r) { return r.status === 'pending'; });
    if (hasAlert) return '<i class="ph-light ph-warning-circle" style="color:#d1453b"></i>';
    if (hasPending) return '<i class="ph-light ph-clock" style="color:#e8a838"></i>';
    return '<i class="ph-light ph-check-circle" style="color:#2e7d5e"></i>';
  }

  function renderFloors() {
    if (!floors.length) {
      el.floorsContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-buildings"></i><h3>Sin pisos</h3><p>No hay pisos disponibles.</p></div>';
      return;
    }
    el.floorsContainer.innerHTML = floors.map((f) =>
      '<div class="floor-card' + (selectedFloorId === f.id ? ' active' : '') + '" data-floor-id="' + f.id + '">' +
        getFloorStatusIcon(f.id) +
        '<div class="floor-label">' + f.name + '</div>' +
      '</div>'
    ).join('');

    el.floorsContainer.querySelectorAll('.floor-card').forEach((card) => {
      card.addEventListener('click', () => onFloorClick(Number(card.dataset.floorId)));
    });
  }

  async function onFloorClick(floorId) {
    selectedFloorId = floorId;
    selectedRoomId = null;
    renderFloors();
    showView('view-rooms');
    updateBreadcrumb('view-rooms', getFloorName(floorId));
    await loadRooms(floorId);
  }

  // ============ ROOMS ============

  async function loadRooms(floorId) {
    const floorName = getFloorName(floorId);
    el.roomsHeading.textContent = floorName;
    el.roomsSubtitle.textContent = 'Selecciona una habitaci\u00f3n del ' + floorName + ' para gestionar su minibar.';

    try {
      rooms = await apiFetch('/api/minibar/rooms/' + floorId);
      if (!window._floorRoomsCache) window._floorRoomsCache = {};
      window._floorRoomsCache[floorId] = rooms;
      renderRooms();
      renderFloors();
    } catch (err) {
      var wrapper = el.roomsContainer.querySelector('.rooms-wrapper');
      if (wrapper) wrapper.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function renderRooms() {
    var wrapper = el.roomsContainer.querySelector('.rooms-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'rooms-wrapper';
      el.roomsContainer.appendChild(wrapper);
    }

    if (!rooms.length) {
      wrapper.innerHTML = '<div class="empty-state-illustrated"><div class="empty-icon"><i class="ph-light ph-bed"></i></div><h3>Sin habitaciones</h3><p>No hay habitaciones registradas en este piso.</p></div>';
      return;
    }

    var statusIcons = { ok: "ph-check-circle", pending: "ph-clock", alert: "ph-warning-circle", idle: "ph-bed" };
    var statusLabels = { ok: "OK", pending: "Revisión", alert: "Atención", idle: "Inactiva" };

    var html =
      '<div class="heatmap-legend" style="grid-column:1/-1">' +
        '<span class="heatmap-legend-item"><span class="heatmap-legend-dot dot-alert"></span> Atenci\u00f3n</span>' +
        '<span class="heatmap-legend-item"><span class="heatmap-legend-dot dot-pending"></span> Revisi\u00f3n</span>' +
        '<span class="heatmap-legend-item"><span class="heatmap-legend-dot dot-ok"></span> OK</span>' +
        '<span class="heatmap-legend-item"><span class="heatmap-legend-dot dot-idle"></span> Inactiva</span>' +
      '</div>' + 
      rooms.map(function (r) {
      var s = r.status || "idle";
      return '<div class="room-card status-' + s + (selectedRoomId === r.id ? ' active' : '') + '" data-room-id="' + r.id + '" role="button" tabindex="0" aria-label="Habitaci\u00f3n ' + r.room_number + ', estado ' + (statusLabels[s] || "") + '">' +
        '<div class="room-map-icon"><i class="ph-light ' + (statusIcons[s] || "ph-bed") + '" aria-hidden="true"></i></div>' +
        '<div class="room-map-number">' + r.room_number + '</div>' +
        '<div class="room-map-status">' + (statusLabels[s] || "") + '</div>' +
      '</div>';
    }).join('');

    wrapper.innerHTML = html;

    // Room click & keyboard activation
    function activateRoom(card) {
      onRoomClick(Number(card.dataset.roomId));
    }

    el.roomsContainer.querySelectorAll('.room-card').forEach(function (card) {
      card.addEventListener('click', function () { activateRoom(card); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateRoom(card); }
      });
    });
  }

  async function onRoomClick(roomId) {
    selectedRoomId = roomId;
    renderRooms();
    showView('view-room-detail');

    const floorName = getFloorName(selectedFloorId);
    const roomNumber = getRoomNumber(roomId);
    el.rdFloorName.innerHTML = '<i class="ph-light ph-buildings"></i> ' + floorName;
    el.rdRoomName.innerHTML = '<i class="ph-light ph-bed"></i> Habitaci\u00f3n ' + roomNumber;
    el.roomDetailSubtitle.textContent = 'Gestionando minibar de ' + floorName + ', Habitaci\u00f3n ' + roomNumber + '.';

    updateBreadcrumb('view-room-detail', floorName, roomNumber);

    // Load inventory for the room
    await loadInventory(roomId);

    // Switch to the first tab (inventory)
    switchTab('inventory');
  }

  // ============ EXPIRATION HELPERS ============

  function normalizeDateStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val)) return '';
      return val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0') + '-' + String(val.getDate()).padStart(2, '0');
    }
    const s = String(val);
    if (s.includes('T')) return s.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  }

  function getExpirationStatus(expirationDate) {
    if (!expirationDate) return { class: 'exp-gray', label: 'No definida', days: null };
    const dateStr = normalizeDateStr(expirationDate);
    if (!dateStr) return { class: 'exp-gray', label: 'No definida', days: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(dateStr + 'T00:00:00');
    if (isNaN(expDate.getTime())) return { class: 'exp-gray', label: 'No definida', days: null };
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { class: 'exp-red', label: 'Vencido', days: diffDays };
    if (diffDays <= 7) return { class: 'exp-red', label: diffDays + ' d\u00edas', days: diffDays };
    if (diffDays <= 30) return { class: 'exp-yellow', label: diffDays + ' d\u00edas', days: diffDays };
    return { class: 'exp-green', label: diffDays + ' d\u00edas', days: diffDays };
  }

  function formatDateLocal(dateStr) {
    if (!dateStr) return '\u2014';
    const s = normalizeDateStr(dateStr);
    if (!s) return '\u2014';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('es-CO');
  }

  function renderExpirationModal(item) {
    const existingModal = document.getElementById('expiration-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay visible';
    modal.id = 'expiration-modal';
    modal.innerHTML =
      '<div class="modal-content" style="max-width:380px;">' +
        '<div class="modal-header">' +
          '<h3><i class="ph-light ph-calendar" style="margin-right:8px;"></i>Fecha de vencimiento</h3>' +
          '<button class="modal-close-btn modal-close-trigger" aria-label="Cerrar"><i class="ph-light ph-x"></i></button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p style="font-size:13px;margin-bottom:12px;">Producto: <strong>' + item.product_name + '</strong></p>' +
          '<div class="admin-form-group">' +
            '<label>Fecha de vencimiento</label>' +
            '<input class="admin-input" id="expiration-date-input" type="date" value="' + (item.expiration_date || '') + '" />' +
          '</div>' +
          '<p style="font-size:11px;color:var(--color-muted);margin-top:8px;">Deja vac\u00edo si no tiene fecha de vencimiento.</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn-primary btn-sm" id="save-expiration-btn">Guardar</button>' +
          '<button class="btn-ghost btn-sm modal-close-trigger">Cancelar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    modal.querySelectorAll('.modal-close-trigger').forEach(function(btn) {
      btn.addEventListener('click', function() { modal.remove(); });
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove();
    });

    document.getElementById('save-expiration-btn').addEventListener('click', async function() {
      const input = document.getElementById('expiration-date-input');
      const expirationDate = input.value || null;

      try {
        await apiFetch('/api/minibar/inventory/' + item.inventory_id + '/expiration', {
          method: 'PUT',
          body: JSON.stringify({ expirationDate })
        });
        modal.remove();
        await loadInventory(selectedRoomId);
        renderInventory();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }

  // ============ INVENTORY ============

  async function loadInventory(roomId) {
    try {
      inventory = await apiFetch('/api/minibar/inventory/' + roomId);
    } catch (err) {
      inventory = [];
      el.inventoryContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function renderInventory() {
    if (!inventory.length) {
      el.inventoryContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-wine"></i><h3>Sin productos</h3><p>No hay productos registrados para esta habitaci\u00f3n.</p></div>';
      return;
    }

    const grouped = {};
    for (const item of inventory) {
      if (!grouped[item.category_name]) grouped[item.category_name] = [];
      grouped[item.category_name].push(item);
    }

    const categoryOrder = ['Canasta', 'Nevera'];
    let html = '';

    for (const catName of categoryOrder) {
      const items = grouped[catName];
      if (!items) continue;

      html += '<div class="category-section">';
      html += '<div class="category-heading">' +
        '<i class="' + (catName === 'Canasta' ? 'ph-light ph-shopping-cart-simple' : 'ph-light ph-snowflake') + '"></i>' +
        '<h3>' + catName + '</h3>' +
        '<span class="cat-count">' + items.length + ' producto' + (items.length !== 1 ? 's' : '') + '</span>' +
      '</div>';

      for (const item of items) {
        const isAgotado = item.quantity === 0;
        const isLowStock = !isAgotado && item.min_stock > 0 && item.quantity < item.min_stock;
        const expStatus = getExpirationStatus(item.expiration_date);
        const expLabel = item.expiration_date ? formatDateLocal(item.expiration_date) : 'No definida';

        const imgSrc = item.image_url || '';
        const imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="" class="product-thumb" loading="lazy" />'
          : '<span style="width:32px;height:32px;border-radius:6px;background:var(--color-card-soft);display:inline-block;border:1px solid var(--color-border-soft);flex-shrink:0"></span>';

        var badges = '';
        if (isAgotado) badges += '<span class="product-agotado-badge"><i class="ph-light ph-warning"></i>Agotado</span>';
        else if (isLowStock) badges += '<span class="product-lowstock-badge"><i class="ph-light ph-warning"></i>Stock bajo</span>';

        html += '<div class="product-row-minibar' + (isAgotado ? ' agotado' : (isLowStock ? ' low-stock' : '')) + '" data-product-id="' + item.product_id + '">' +
          imgHtml +
          '<div class="product-info">' +
            '<div class="product-name-text">' +
              item.product_name +
              badges +
            '</div>' +
            '<div class="product-details-row">' +
              '<span class="product-price-label">' + formatCOP(item.product_price) + '</span>' +
              ' <span class="product-detail-sep">|</span> ' +
              '<span class="product-qty-label">' + item.quantity + ' uds.' + (isLowStock ? ' (mín. ' + item.min_stock + ')' : '') + '</span>' +
            '</div>' +
            '<div class="product-expiration-row">' +
              '<span class="exp-indicator ' + expStatus.class + '"></span>' +
              '<span class="exp-label">Vence: ' + expLabel + '</span>' +
              '<span class="exp-days ' + expStatus.class + '">' + expStatus.label + '</span>' +
              '<button class="btn-icon btn-edit-expiration" data-inventory-id="' + item.inventory_id + '" title="Editar fecha de vencimiento" style="margin-left:auto;font-size:14px;">' +
                '<i class="ph-light ph-pencil"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    el.inventoryContainer.innerHTML = html;

    el.inventoryContainer.querySelectorAll('.btn-edit-expiration').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const invId = Number(btn.dataset.inventoryId);
        const item = inventory.find(function(i) { return i.inventory_id === invId; });
        if (item) renderExpirationModal(item);
      });
    });
  }

  // ============ CONSUMPTION FORM ============

  function renderConsumptionForm() {
    if (!inventory.length) {
      el.consumptionProducts.innerHTML = '<div class="empty-state"><i class="ph-light ph-shopping-bag"></i><h3>Sin productos</h3><p>Cargando inventario...</p></div>';
      return;
    }

    const grouped = {};
    for (const item of inventory) {
      if (!grouped[item.category_name]) grouped[item.category_name] = [];
      grouped[item.category_name].push(item);
    }

    const categoryOrder = ['Canasta', 'Nevera'];
    let html = '';

    for (const catName of categoryOrder) {
      const items = grouped[catName];
      if (!items) continue;

      html += '<div class="category-section">';
      html += '<div class="category-heading">' +
        '<i class="' + (catName === 'Canasta' ? 'ph-light ph-shopping-cart-simple' : 'ph-light ph-snowflake') + '"></i>' +
        '<h3>' + catName + '</h3>' +
      '</div>';

      for (const item of items) {
        const isAgotado = item.quantity === 0;
        const itemTotal = 0;
        const imgSrc = item.image_url || '';
        const imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="" class="product-thumb" loading="lazy" />'
          : '<span class="product-thumb-placeholder"></span>';
        html += '<div class="product-row-consumption' + (isAgotado ? ' agotado' : '') + '" data-product-id="' + item.product_id + '" data-price="' + item.product_price + '">' +
          imgHtml +
          '<div class="product-consumption-info">' +
            '<div class="product-name-text">' +
              item.product_name +
              (isAgotado ? '<span class="product-agotado-badge"><i class="ph-light ph-warning"></i>Agotado</span>' : '') +
            '</div>' +
            '<div class="product-details-row">' +
              '<span class="product-price-label">' + formatCOP(item.product_price) + '</span>' +
              ' <span class="product-detail-sep">|</span> ' +
              '<span class="product-qty-label">Disponible: ' + item.quantity + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="product-consumption-controls">' +
            '<button class="qty-btn cons-qty-minus" type="button" data-pid="' + item.product_id + '">&minus;</button>' +
            '<input class="qty-input cons-qty-input" type="number" min="0" max="' + item.quantity + '" value="0" data-pid="' + item.product_id + '" ' + (isAgotado ? 'disabled' : '') + ' />' +
            '<button class="qty-btn cons-qty-plus" type="button" data-pid="' + item.product_id + '">+</button>' +
            '<span class="cons-line-total" data-pid="' + item.product_id + '">$0</span>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    el.consumptionProducts.innerHTML = html;

    // Attach events
    el.consumptionProducts.querySelectorAll('.cons-qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.pid);
        changeConsumptionQty(pid, -1);
      });
    });
    el.consumptionProducts.querySelectorAll('.cons-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.pid);
        changeConsumptionQty(pid, 1);
      });
    });
    el.consumptionProducts.querySelectorAll('.cons-qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        const pid = Number(input.dataset.pid);
        const max = Number(input.max);
        const val = Math.max(0, Math.min(max, parseInt(input.value, 10) || 0));
        setConsumptionQty(pid, val);
      });
      input.addEventListener('focus', function() { this.select(); });
    });

    updateConsumptionTotal();
  }

  function changeConsumptionQty(productId, delta) {
    const input = el.consumptionProducts.querySelector('.cons-qty-input[data-pid="' + productId + '"]');
    if (!input || input.disabled) return;
    const max = Number(input.max);
    const current = Number(input.value) || 0;
    const val = Math.max(0, Math.min(max, current + delta));
    setConsumptionQty(productId, val);
  }

  function setConsumptionQty(productId, value) {
    const input = el.consumptionProducts.querySelector('.cons-qty-input[data-pid="' + productId + '"]');
    if (!input) return;
    input.value = value;
    updateConsumptionLineTotal(productId);
    updateConsumptionTotal();
  }

  function updateConsumptionLineTotal(productId) {
    const input = el.consumptionProducts.querySelector('.cons-qty-input[data-pid="' + productId + '"]');
    const totalSpan = el.consumptionProducts.querySelector('.cons-line-total[data-pid="' + productId + '"]');
    if (!input || !totalSpan) return;
    const row = input.closest('.product-row-consumption');
    const price = Number(row ? row.dataset.price : 0);
    const qty = Number(input.value) || 0;
    totalSpan.textContent = formatCOP(qty * price);
  }

  function updateConsumptionTotal() {
    let total = 0;
    el.consumptionProducts.querySelectorAll('.cons-qty-input').forEach((input) => {
      const row = input.closest('.product-row-consumption');
      const price = Number(row ? row.dataset.price : 0);
      const qty = Number(input.value) || 0;
      total += qty * price;
    });
    el.consumptionTotal.textContent = formatCOP(total);
  }

  function getConsumptionItems() {
    const items = [];
    el.consumptionProducts.querySelectorAll('.cons-qty-input').forEach((input) => {
      const qty = Number(input.value) || 0;
      if (qty > 0) {
        items.push({ productId: Number(input.dataset.pid), quantity: qty });
      }
    });
    return items;
  }

  async function saveConsumption(openWhatsapp) {
    if (!selectedRoomId) {
      el.consumptionStatus.textContent = 'Error: No hay habitaci\u00f3n seleccionada.';
      el.consumptionStatus.className = 'status error';
      return;
    }
    const items = getConsumptionItems();
    if (items.length === 0) {
      el.consumptionStatus.textContent = 'Selecciona al menos un producto y su cantidad.';
      el.consumptionStatus.className = 'status error';
      return;
    }

    el.consumptionStatus.textContent = 'Guardando consumo...';
    el.consumptionStatus.className = 'status';
    el.saveConsumptionBtn.disabled = true;
    el.saveAndSendBtn.disabled = true;

    try {
      const result = await apiFetch('/api/minibar/consumption', {
        method: 'POST',
        body: JSON.stringify({ roomId: selectedRoomId, items })
      });

      if (result.offline) {
        el.consumptionStatus.textContent = result.message || 'Guardado offline. Se sincronizará al reconectar.';
        el.consumptionStatus.className = 'status warning';
      } else {
        el.consumptionStatus.textContent = result.message;
        el.consumptionStatus.className = 'status success';
      }

      if (openWhatsapp && result.whatsappMessage) {
        el.previewContent.textContent = result.whatsappMessage;
        el.previewModal.classList.add('visible');
        el.previewModal.setAttribute('aria-hidden', 'false');
        el.previewSendBtn.dataset.message = result.whatsappMessage;

        fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            moduleName: 'Minibares',
            actionType: 'whatsapp_sent',
            actionDescription: 'Envió consumo por WhatsApp',
            roomId: selectedRoomId,
            amount: result.total
          })
        }).catch(function() {});
      }

      // Reload inventory after consumption
      await loadInventory(selectedRoomId);
      renderConsumptionForm();
    } catch (err) {
      el.consumptionStatus.textContent = 'Error: ' + err.message;
      el.consumptionStatus.className = 'status error';
    } finally {
      el.saveConsumptionBtn.disabled = false;
      el.saveAndSendBtn.disabled = false;
    }
  }

  // ============ RESTOCK FORM ============

  function renderRestockForm() {
    if (!inventory.length) {
      el.restockProducts.innerHTML = '<div class="empty-state"><i class="ph-light ph-plus-square"></i><h3>Sin productos</h3><p>No hay productos registrados.</p></div>';
      return;
    }

    const grouped = {};
    for (const item of inventory) {
      if (!grouped[item.category_name]) grouped[item.category_name] = [];
      grouped[item.category_name].push(item);
    }

    const categoryOrder = ['Canasta', 'Nevera'];
    let html = '';

    for (const catName of categoryOrder) {
      const items = grouped[catName];
      if (!items) continue;

      html += '<div class="category-section">';
      html += '<div class="category-heading">' +
        '<i class="' + (catName === 'Canasta' ? 'ph-light ph-shopping-cart-simple' : 'ph-light ph-snowflake') + '"></i>' +
        '<h3>' + catName + '</h3>' +
      '</div>';

      for (const item of items) {
        const imgSrc = item.image_url || '';
        const imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="" class="product-thumb" loading="lazy" />'
          : '<span class="product-thumb-placeholder"></span>';
        html += '<div class="product-row-restock" data-product-id="' + item.product_id + '">' +
          imgHtml +
          '<div class="product-info">' +
            '<div class="product-name-text">' + item.product_name + '</div>' +
            '<div class="product-details-row">' +
              '<span class="product-qty-label">Actual: ' + item.quantity + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="product-restock-controls">' +
            '<button class="qty-btn restock-qty-minus" type="button" data-pid="' + item.product_id + '">&minus;</button>' +
            '<input class="qty-input restock-qty-input" type="number" min="0" value="0" data-pid="' + item.product_id + '" />' +
            '<button class="qty-btn restock-qty-plus" type="button" data-pid="' + item.product_id + '">+</button>' +
            '<span class="restock-preview" data-pid="' + item.product_id + '">→ ' + item.quantity + '</span>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    el.restockProducts.innerHTML = html;

    el.restockProducts.querySelectorAll('.restock-qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.pid);
        changeRestockQty(pid, -1);
      });
    });
    el.restockProducts.querySelectorAll('.restock-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.pid);
        changeRestockQty(pid, 1);
      });
    });
    el.restockProducts.querySelectorAll('.restock-qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        const pid = Number(input.dataset.pid);
        const val = Math.max(0, parseInt(input.value, 10) || 0);
        setRestockQty(pid, val);
      });
      input.addEventListener('focus', function() { this.select(); });
    });
  }

  function changeRestockQty(productId, delta) {
    const input = el.restockProducts.querySelector('.restock-qty-input[data-pid="' + productId + '"]');
    if (!input) return;
    const current = Number(input.value) || 0;
    const val = Math.max(0, current + delta);
    setRestockQty(productId, val);
  }

  function setRestockQty(productId, value) {
    const input = el.restockProducts.querySelector('.restock-qty-input[data-pid="' + productId + '"]');
    const preview = el.restockProducts.querySelector('.restock-preview[data-pid="' + productId + '"]');
    if (!input) return;
    input.value = value;
    if (preview) {
      const item = inventory.find(i => i.product_id === productId);
      const current = item ? item.quantity : 0;
      preview.textContent = '\u2192 ' + (current + value);
    }
  }

  function getRestockItems() {
    const items = [];
    el.restockProducts.querySelectorAll('.restock-qty-input').forEach((input) => {
      const qty = Number(input.value) || 0;
      if (qty > 0) items.push({ productId: Number(input.dataset.pid), quantity: qty });
    });
    return items;
  }

  async function saveRestock() {
    if (!selectedRoomId) {
      el.restockStatus.textContent = 'Error: No hay habitaci\u00f3n seleccionada.';
      el.restockStatus.className = 'status error';
      return;
    }
    const items = getRestockItems();
    if (items.length === 0) {
      el.restockStatus.textContent = 'Selecciona al menos un producto y cantidad a reponer.';
      el.restockStatus.className = 'status error';
      return;
    }

    el.restockStatus.textContent = 'Guardando reposici\u00f3n...';
    el.restockStatus.className = 'status';
    el.saveRestockBtn.disabled = true;

    try {
      const result = await apiFetch('/api/minibar/restock', {
        method: 'POST',
        body: JSON.stringify({ roomId: selectedRoomId, items })
      });
      if (result.offline) {
        el.restockStatus.textContent = result.message || 'Guardado offline. Se sincronizará al reconectar.';
        el.restockStatus.className = 'status warning';
      } else {
        el.restockStatus.textContent = result.message;
        el.restockStatus.className = 'status success';
      }
      await loadInventory(selectedRoomId);
      renderRestockForm();
    } catch (err) {
      el.restockStatus.textContent = 'Error: ' + err.message;
      el.restockStatus.className = 'status error';
    } finally {
      el.saveRestockBtn.disabled = false;
    }
  }

  // ============ ADJUST FORM ============

  function renderAdjustForm() {
    if (!inventory.length) {
      el.adjustProducts.innerHTML = '<div class="empty-state"><i class="ph-light ph-wrench"></i><h3>Sin productos</h3><p>No hay productos registrados.</p></div>';
      return;
    }

    const grouped = {};
    for (const item of inventory) {
      if (!grouped[item.category_name]) grouped[item.category_name] = [];
      grouped[item.category_name].push(item);
    }

    const categoryOrder = ['Canasta', 'Nevera'];
    let html = '';

    for (const catName of categoryOrder) {
      const items = grouped[catName];
      if (!items) continue;

      html += '<div class="category-section">';
      html += '<div class="category-heading">' +
        '<i class="' + (catName === 'Canasta' ? 'ph-light ph-shopping-cart-simple' : 'ph-light ph-snowflake') + '"></i>' +
        '<h3>' + catName + '</h3>' +
      '</div>';

      for (const item of items) {
        const imgSrc = item.image_url || '';
        const imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="" class="product-thumb" loading="lazy" />'
          : '<span class="product-thumb-placeholder"></span>';
        html += '<div class="product-row-adjust" data-product-id="' + item.product_id + '">' +
          imgHtml +
          '<div class="product-info">' +
            '<div class="product-name-text">' + item.product_name + '</div>' +
            '<div class="product-details-row">' +
              '<span class="product-qty-label">Actual: ' + item.quantity + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="product-adjust-controls">' +
            '<input class="qty-input adjust-qty-input" type="number" min="0" value="' + item.quantity + '" data-pid="' + item.product_id + '" />' +
            '<span class="adjust-hint" data-i18n="minibarAdjustHint">Nueva cantidad</span>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    el.adjustProducts.innerHTML = html;

    el.adjustProducts.querySelectorAll('.adjust-qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        const val = Math.max(0, parseInt(input.value, 10) || 0);
        input.value = val;
      });
      input.addEventListener('focus', function() { this.select(); });
    });
  }

  function getAdjustItems() {
    const items = [];
    el.adjustProducts.querySelectorAll('.adjust-qty-input').forEach((input) => {
      const qty = Number(input.value) || 0;
      const item = inventory.find(i => i.product_id === Number(input.dataset.pid));
      const current = item ? item.quantity : 0;
      if (qty !== current) items.push({ productId: Number(input.dataset.pid), quantity: qty });
    });
    return items;
  }

  async function saveAdjust() {
    if (!selectedRoomId) {
      el.adjustStatus.textContent = 'Error: No hay habitaci\u00f3n seleccionada.';
      el.adjustStatus.className = 'status error';
      return;
    }
    const items = getAdjustItems();
    if (items.length === 0) {
      el.adjustStatus.textContent = 'No hay cambios para guardar.';
      el.adjustStatus.className = 'status error';
      return;
    }

    el.adjustStatus.textContent = 'Guardando ajuste...';
    el.adjustStatus.className = 'status';
    el.saveAdjustBtn.disabled = true;

    try {
      const result = await apiFetch('/api/minibar/adjust', {
        method: 'POST',
        body: JSON.stringify({ roomId: selectedRoomId, items })
      });
      if (result.offline) {
        el.adjustStatus.textContent = result.message || 'Guardado offline. Se sincronizará al reconectar.';
        el.adjustStatus.className = 'status warning';
      } else {
        el.adjustStatus.textContent = result.message;
        el.adjustStatus.className = 'status success';
      }
      await loadInventory(selectedRoomId);
      renderAdjustForm();
    } catch (err) {
      el.adjustStatus.textContent = 'Error: ' + err.message;
      el.adjustStatus.className = 'status error';
    } finally {
      el.saveAdjustBtn.disabled = false;
    }
  }

  // ============ HISTORY ============

  var _historyPage = 1;

  function getHistoryFilters() {
    var search = document.getElementById('history-search');
    var type = document.getElementById('history-type-filter');
    var from = document.getElementById('history-from');
    var to = document.getElementById('history-to');
    var params = '?page=' + _historyPage + '&limit=50';
    if (search && search.value.trim()) params += '&search=' + encodeURIComponent(search.value.trim());
    if (type && type.value) params += '&type=' + encodeURIComponent(type.value);
    if (from && from.value) params += '&from=' + encodeURIComponent(from.value);
    if (to && to.value) params += '&to=' + encodeURIComponent(to.value);
    return params;
  }

  async function loadAndRenderHistory() {
    if (!selectedRoomId) {
      el.historyContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-clock-counter-clockwise"></i><h3>Sin historial</h3><p>Selecciona una habitaci\u00f3n primero.</p></div>';
      return;
    }

    el.historyContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Cargando...</h3></div>';

    try {
      var result = await apiFetch('/api/minibar/movements/' + selectedRoomId + getHistoryFilters());
      movements = result.items || [];
      renderHistory(result.pagination);
    } catch (err) {
      el.historyContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  function renderPagination(pagination) {
    var container = document.getElementById('history-pagination');
    if (!container) return;
    if (!pagination || pagination.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    var html = '';
    for (var p = 1; p <= pagination.totalPages; p++) {
      if (p === pagination.page) {
        html += '<button class="btn-primary btn-xs" disabled style="opacity:1">' + p + '</button>';
      } else {
        html += '<button class="btn-ghost btn-xs" data-page="' + p + '">' + p + '</button>';
      }
    }
    container.innerHTML = html;
    container.querySelectorAll('[data-page]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _historyPage = Number(this.dataset.page);
        loadAndRenderHistory();
      });
    });

    var info = document.getElementById('history-filters-info');
    if (info && pagination) {
      var from = (pagination.page - 1) * pagination.limit + 1;
      var to = Math.min(pagination.page * pagination.limit, pagination.total);
      info.textContent = 'Mostrando ' + from + '–' + to + ' de ' + pagination.total + ' movimientos';
    }
  }

  function renderHistory(pagination) {
    if (!movements.length) {
      el.historyContainer.innerHTML = '<div class="empty-state"><i class="ph-light ph-clock-counter-clockwise"></i><h3>Sin movimientos</h3><p>No hay movimientos registrados para esta habitaci\u00f3n.</p></div>';
      renderPagination(pagination);
      return;
    }

    const typeLabels = {
      consumption: 'Consumo',
      restock: 'Reposici\u00f3n',
      adjustment: 'Ajuste',
      perdida: 'Perdida',
      dano: 'Daño'
    };
    const typeIcons = {
      consumption: 'ph-light ph-shopping-bag',
      restock: 'ph-light ph-plus-square',
      adjustment: 'ph-light ph-wrench',
      perdida: 'ph-light ph-warning-circle',
      dano: 'ph-light ph-warning'
    };
    const typeClasses = {
      consumption: 'movement-consumption',
      restock: 'movement-restock',
      adjustment: 'movement-adjustment'
    };

    let html = '<div class="movements-table"><table><thead><tr>' +
      '<th>Fecha</th><th>Tipo</th><th>Producto</th><th>Antes</th><th>Movido</th><th>Despu\u00e9s</th><th>Usuario</th><th></th>' +
      '</tr></thead><tbody>';

    for (const m of movements) {
      if (!m) continue;
      const date = new Date(m.created_at);
      const dateStr = date.toLocaleDateString('es-CO');
      const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const isVoidType = m.movement_type === 'void';

      html += '<tr class="' + (typeClasses[m.movement_type] || '') + (isVoidType ? ' movement-void' : '') + '">' +
        '<td class="movement-date">' + dateStr + ' ' + timeStr + '</td>' +
        '<td><span class="movement-type-badge ' + m.movement_type + '"><i class="' + (typeIcons[m.movement_type] || 'ph-light ph-arrow-u-up-left') + '"></i> ' + (typeLabels[m.movement_type] || m.movement_type) + '</span></td>' +
        '<td>' + (m.product_name || '') + (m.notes ? '<br><small style="color:#999;">' + m.notes + '</small>' : '') + '</td>' +
        '<td class="movement-qty">' + (m.quantity_before != null ? m.quantity_before : '') + '</td>' +
        '<td class="movement-qty ' + (m.quantity_moved > 0 ? 'movement-positive' : 'movement-negative') + '">' + (m.quantity_moved > 0 ? '+' : '') + (m.quantity_moved || 0) + '</td>' +
        '<td class="movement-qty">' + (m.quantity_after != null ? m.quantity_after : '') + '</td>' +
        '<td>' + (m.user_name || '&mdash;') + '</td>' +
        '<td>' + (!isVoidType && m.movement_type !== 'void' ? '<button class="btn-icon btn-void-movement" data-id="' + m.id + '" title="Anular movimiento"><i class="ph-light ph-arrow-u-up-left"></i></button>' : '') + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></div>';
    el.historyContainer.innerHTML = html;

    el.historyContainer.querySelectorAll('.btn-void-movement').forEach((btn) => {
      btn.addEventListener('click', () => voidMovement(Number(btn.dataset.id)));
    });

    renderPagination(pagination);
  }

  async function voidMovement(movementId) {
    if (!confirm('\u00bfEst\u00e1s seguro de anular este movimiento? Se restaurar\u00e1 el inventario al estado anterior.')) return;
    if (!confirm('\u00bfRealmente deseas continuar? Esta acci\u00f3n no se puede deshacer.')) return;
    try {
      const result = await apiFetch('/api/admin/movements/' + movementId + '/void', { method: 'POST' });
      alert(result.message);
      await loadAndRenderHistory();
      await loadInventory(selectedRoomId);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // ============ WHATSAPP PREVIEW MODAL ============

  function openWhatsAppWithMessage(message) {
    const encodedMessage = encodeURIComponent(message);
    const url = 'https://wa.me/?text=' + encodedMessage;
    window.open(url, '_blank');
  }

  function closePreviewModal() {
    el.previewModal.classList.remove('visible');
    el.previewModal.setAttribute('aria-hidden', 'true');
  }

  // ============ SHOPPING LIST ============

  function renderShoppingList(data) {
    var body = $('#shopping-body');
    if (!body) return;
    if (!data || !data.items) {
      body.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>No se pudo generar la lista.</p></div>';
      return;
    }

    var allItems = []
      .concat(data.items.urgent || [])
      .concat(data.items.soon || [])
      .concat(data.items.normal || []);

    if (!allItems.length) {
      body.innerHTML = '<div class="empty-state"><i class="ph-light ph-check-circle"></i><h3>Todo en orden</h3><p>No hay productos que necesiten reposici\u00f3n seg\u00fan el consumo de los \u00faltimos ' + data.period_days + ' d\u00edas.</p></div>';
      return;
    }

    var summary = $('#shopping-summary');
    if (summary) {
      summary.textContent = allItems.length + ' producto' + (allItems.length !== 1 ? 's' : '') + ' | Est. ' + formatCOP(data.summary.total_estimated_cost);
    }

    var html = '';
    var sections = [
      { key: 'urgent', label: 'Urgente', icon: 'ph-warning-circle', color: '#d1453b' },
      { key: 'soon', label: 'Pronto', icon: 'ph-clock', color: '#e8a838' },
      { key: 'normal', label: 'Programado', icon: 'ph-check-circle', color: '#2e7d5e' }
    ];

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var secItems = data.items[sec.key] || [];
      if (!secItems.length) continue;

      html += '<div class="category-section" style="margin-top:12px">';
      html += '<div class="category-heading">' +
        '<i class="ph-light ' + sec.icon + '" style="color:' + sec.color + '"></i>' +
        '<h3 style="color:' + sec.color + '">' + sec.label + '</h3>' +
        '<span class="cat-count">' + secItems.length + '</span>' +
      '</div>';

      for (var i = 0; i < secItems.length; i++) {
        var it = secItems[i];
        var imgSrc = it.image_url || '';
        var imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="" class="product-thumb" loading="lazy" />'
          : '<span class="product-thumb-placeholder"></span>';

        html += '<div class="product-row-minibar" style="' + (it.urgency === 'urgente' ? 'border-left:3px solid #d1453b;' : '') + '">' +
          imgHtml +
          '<div class="product-info">' +
            '<div class="product-name-text">' + it.product_name + '</div>' +
            '<div class="product-details-row">' +
              '<span class="product-price-label">' + formatCOP(it.product_price) + '</span>' +
              ' <span class="product-detail-sep">|</span> ' +
              '<span class="product-qty-label">Stock: ' + it.total_stock + ' uds.</span>' +
              ' <span class="product-detail-sep">|</span> ' +
              '<span class="product-qty-label">Cons. diario: ~' + it.avg_daily_consumption + '</span>' +
            '</div>' +
            '<div class="product-details-row" style="margin-top:4px;font-size:13px;">' +
              '<span style="font-weight:700;color:var(--color-primary);">Pedir: ' + it.recommended_order + ' uds.</span>' +
              ' <span class="product-detail-sep">|</span> ' +
              '<span>Costo: ' + formatCOP(it.estimated_cost) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    }

    body.innerHTML = html;
  }

  async function openShoppingList() {
    var modal = $('#shopping-modal');
    var body = $('#shopping-body');
    var summary = $('#shopping-summary');
    if (!modal) return;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    if (body) body.innerHTML = '<div class="empty-state"><i class="ph-light ph-spinner spinning"></i><h3>Analizando inventario y consumo...</h3></div>';
    if (summary) summary.textContent = '';

    try {
      var data = await apiFetch('/api/minibar/shopping-list', {
        method: 'POST',
        body: JSON.stringify({ days: 7 })
      });
      renderShoppingList(data);
    } catch (err) {
      if (body) body.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  }

  // ============ EVENTS ============

  function on(el, event, fn) {
    if (el) el.addEventListener(event, fn);
  }

  on(el.backToFloorsBtn, 'click', goBackToFloors);
  on(el.backToRoomsBtn, 'click', goBackToRooms);

  // Tabs
  document.querySelectorAll('.room-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Inventory
  on(el.refreshInventoryBtn, 'click', async () => {
    await loadInventory(selectedRoomId);
    renderInventory();
  });

  // Consumption
  on(el.saveConsumptionBtn, 'click', () => saveConsumption(false));
  on(el.saveAndSendBtn, 'click', () => saveConsumption(true));

  // Restock
  on(el.saveRestockBtn, 'click', saveRestock);

  // Adjust
  on(el.saveAdjustBtn, 'click', saveAdjust);

  // History
  on(el.refreshHistoryBtn, 'click', function() {
    _historyPage = 1;
    loadAndRenderHistory();
  });
  on(document.getElementById('history-apply-btn'), 'click', function() {
    _historyPage = 1;
    loadAndRenderHistory();
  });
  on(document.getElementById('history-clear-btn'), 'click', function() {
    var search = document.getElementById('history-search');
    var type = document.getElementById('history-type-filter');
    var from = document.getElementById('history-from');
    var to = document.getElementById('history-to');
    if (search) search.value = '';
    if (type) type.value = '';
    if (from) from.value = '';
    if (to) to.value = '';
    _historyPage = 1;
    loadAndRenderHistory();
  });
  // Enter key on search field
  var hs = document.getElementById('history-search');
  if (hs) {
    hs.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        _historyPage = 1;
        loadAndRenderHistory();
      }
    });
  }

  // Preview modal
  // Shopping list
  on($('#shopping-list-btn'), 'click', openShoppingList);
  on($('#shopping-list-btn-rooms'), 'click', openShoppingList);
  on($('#shopping-list-btn-detail'), 'click', openShoppingList);
  on($('#close-shopping-btn'), 'click', function() {
    var m = $('#shopping-modal');
    if (m) { m.classList.remove('visible'); m.setAttribute('aria-hidden', 'true'); }
  });
  document.querySelectorAll('.modal-close-trigger[data-modal="shopping-modal"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var m = $('#shopping-modal');
      if (m) { m.classList.remove('visible'); m.setAttribute('aria-hidden', 'true'); }
    });
  });

  on(el.closePreviewBtn, 'click', closePreviewModal);
  on(el.closePreviewBtn2, 'click', closePreviewModal);
  if (el.previewModal) {
    el.previewModal.addEventListener('click', (e) => {
      if (e.target === el.previewModal) closePreviewModal();
    });
  }

  on(el.previewCopyBtn, 'click', async () => {
    const text = el.previewContent ? el.previewContent.textContent || '' : '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (el.consumptionStatus) {
        el.consumptionStatus.textContent = 'Mensaje copiado al portapapeles.';
        el.consumptionStatus.className = 'status success';
      }
    } catch (e) {
      if (el.consumptionStatus) {
        el.consumptionStatus.textContent = 'No se pudo copiar.';
        el.consumptionStatus.className = 'status error';
      }
    }
  });

  on(el.previewSendBtn, 'click', () => {
    const message = el.previewContent ? el.previewContent.textContent || '' : '';
    if (message) {
      openWhatsAppWithMessage(message);
    }
    closePreviewModal();
  });

  // ============ INIT ============

  if (typeof initTheme === 'function') initTheme();
  if (typeof initLanguage === 'function') initLanguage();
  if (typeof setupThemeSwitcher === 'function') setupThemeSwitcher(document.getElementById('app-theme-switcher'));
  if (typeof setupLangSelector === 'function') setupLangSelector(document.getElementById('app-lang-selector'));

  // Start with floors
  showView('view-floors');
  loadFloors();
})();
