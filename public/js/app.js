/* =========================
   RoomTab - App Logic
   ========================= */

const WHATSAPP_PHONE = "";

/* ---------- Helpers UI ---------- */
function $(id) {
  return document.getElementById(id);
}

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt ?? "";
}

function setClass(id, cls) {
  const el = $(id);
  if (el) el.className = cls ?? "";
}

function nowLabel() {
  const now = new Date();
  const d = now.toLocaleDateString("es-CO");
  const t = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  return `${d} ${t}`;
}

function sanitizePhone(phone) {
  const s = String(phone || "").trim();
  if (!s) return "";
  return s.replace(/[^\d]/g, "");
}

/* ---------- Toast Notification System ---------- */
function showToast(message, type) {
  type = type || "info";
  var container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  var toast = document.createElement("div");
  toast.className = "toast " + type;

  var icons = {
    success: "ph-check-circle",
    error: "ph-warning-circle",
    warning: "ph-warning",
    info: "ph-info"
  };
  var iconClass = icons[type] || icons.info;

  toast.innerHTML =
    '<i class="ph-light ' + iconClass + '"></i>' +
    '<span class="toast-text">' + message + '</span>' +
    '<button class="toast-close" onclick="this.parentElement.classList.add(\'removing\');setTimeout(function(){this.parentElement.remove()}.bind(this),250)" aria-label="Cerrar"><i class="ph-light ph-x"></i></button>';

  container.appendChild(toast);

  setTimeout(function () {
    if (toast.parentElement) {
      toast.classList.add("removing");
      setTimeout(function () {
        if (toast.parentElement) toast.remove();
      }, 250);
    }
  }, 4000);
}

/* ---------- Confirmation Dialog ---------- */
function showConfirm(_ref) {
  var title = _ref.title,
    message = _ref.message,
    confirmText = _ref.confirmText,
    cancelText = _ref.cancelText,
    icon = _ref.icon,
    iconType = _ref.iconType,
    onConfirm = _ref.onConfirm,
    onCancel = _ref.onCancel;

  var existing = document.querySelector(".confirm-overlay");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.className = "confirm-overlay visible";

  var iconHtml = "";
  if (icon) {
    var iType = iconType || "info";
    iconHtml = '<i class="ph-light ' + icon + ' confirm-icon-' + iType + '"></i>';
  }

  overlay.innerHTML =
    '<div class="confirm-dialog">' +
    (iconHtml ? '<div class="confirm-header">' + iconHtml + '<h3>' + (title || "Confirmar") + '</h3></div>' : '<div class="confirm-header"><h3>' + (title || "Confirmar") + '</h3></div>') +
    '<div class="confirm-body">' + (message || "") + '</div>' +
    '<div class="confirm-actions">' +
    '<button class="btn-secondary" id="confirm-cancel-btn">' + (cancelText || "Cancelar") + '</button>' +
    '<button class="btn-primary" id="confirm-ok-btn">' + (confirmText || "Confirmar") + '</button>' +
    "</div>" +
    "</div>";

  document.body.appendChild(overlay);

  document.getElementById("confirm-cancel-btn").addEventListener("click", function () {
    overlay.remove();
    if (onCancel) onCancel();
  });

  document.getElementById("confirm-ok-btn").addEventListener("click", function () {
    overlay.remove();
    if (onConfirm) onConfirm();
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      overlay.remove();
      if (onCancel) onCancel();
    }
  });
}

/* ---------- Mobile Utilities ---------- */
function isMobile() {
  return window.innerWidth <= 680;
}

function isTablet() {
  return window.innerWidth > 680 && window.innerWidth <= 960;
}

function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function debounce(fn, delay) {
  var timer = null;
  return function () {
    var context = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay);
  };
}

/* ---------- Mobile bottom bar management ---------- */
function setupBottomBar() {
  var hasBottomBar = document.querySelector(".bottom-bar.show");
  if (hasBottomBar && isMobile()) {
    document.body.classList.add("has-bottom-bar");
  }
}

/* ---------- Room quick search ---------- */
function setupQuickRoomSearch(inputId, resultId, onFound) {
  var input = document.getElementById(inputId);
  var result = document.getElementById(resultId);
  if (!input || !result) return;

  var cache = null;
  var cacheLoaded = false;

  async function loadRoomsForSearch() {
    if (cacheLoaded && cache) return cache;
    try {
      var res = await fetch("/api/rooms", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      var rooms = await res.json();
      cache = Array.isArray(rooms) ? rooms : [];
      cacheLoaded = true;
      return cache;
    } catch (e) {
      return [];
    }
  }

  var debouncedSearch = debounce(async function () {
    var q = input.value.trim();
    if (!q) {
      result.classList.remove("show", "not-found");
      return;
    }

    var rooms = await loadRoomsForSearch();
    var found = rooms.find(function (r) {
      var num = String(
        r.room_number || r.roomNumber || r.numero_habitacion || r.numero || r.number || r.code || ""
      );
      return num === q;
    });

    if (found) {
      result.classList.remove("not-found");
      result.classList.add("show");
      var num = found.room_number || found.roomNumber || found.numero_habitacion || found.numero || found.number || found.code || q;
      result.innerHTML =
        '<div class="quick-search-result-text"><i class="ph-light ph-bed"></i> Habitaci\u00f3n ' + num + ' <span class="room-status-badge pendiente">Seleccionar</span></div>';
      result.onclick = function () {
        if (onFound) onFound(found);
      };
    } else {
      result.classList.add("show", "not-found");
      result.innerHTML =
        '<div class="quick-search-result-text"><i class="ph-light ph-warning-circle"></i> No se encontr\u00f3 la habitaci\u00f3n ingresada.</div>';
      result.onclick = null;
    }
  }, 300);

  input.addEventListener("input", debouncedSearch);
  input.addEventListener("focus", function () {
    if (input.value.trim()) debouncedSearch();
  });

  document.addEventListener("click", function (e) {
    if (!input.contains(e.target) && !result.contains(e.target)) {
      result.classList.remove("show");
    }
  });
}

/* ---------- User ---------- */
function getInitialsFromName(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return (first + last).toUpperCase();
}

async function loadCurrentUser() {
  const nameEl = $("user-name");
  const initialsEl = $("user-initials");
  const avatarImg = $("user-avatar-img");
  if (!nameEl || !initialsEl) return;

  try {
    const res = await fetch("/api/auth/me", { method: "GET", credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const fullName = data.fullName || data.full_name || data.name || "";
    if (fullName) {
      nameEl.textContent = fullName;
      initialsEl.textContent = getInitialsFromName(fullName);
    }
    if (avatarImg && data.avatarUrl) {
      avatarImg.src = data.avatarUrl;
      avatarImg.style.display = "";
      initialsEl.style.display = "none";
    }
  } catch (err) {
    console.error("Error cargando usuario actual:", err);
  }
}

/* ---------- Room parsing ---------- */
function getRoomNumberFromAnyLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/\d+/g);
  if (m && m.length) return m.join("");
  return raw.replace(/habitaci[oó]n|hab\.?/gi, "").trim();
}

function formatRoomOptionText(room, index) {
  const roomNumber =
    room.room_number ??
    room.roomNumber ??
    room.numero_habitacion ??
    room.numeroHabitacion ??
    room.numero ??
    room.number ??
    room.habitacion ??
    room.code ??
    room.codigo ??
    null;

  if (roomNumber != null) return String(roomNumber).trim();
  const fallbackNum = room.id ?? index + 1;
  return String(fallbackNum).trim();
}

/* ---------- KPI calculation ---------- */
function formatPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function computeSelectedItems() {
  const productsList = $("products-list");
  if (!productsList) return [];

  const rows = Array.from(productsList.querySelectorAll(".product-row"));

  return rows
    .map((row) => {
      const checkbox = row.querySelector(".product-check");
      const qtyInput = row.querySelector(".product-qty-input");

      const checked = Boolean(checkbox && checkbox.checked);
      const qty = Number(qtyInput?.value || "0");

      const price = Number(row.dataset.productPrice || "0");
      const name = row.dataset.productName || "Producto";
      const productId = row.dataset.productId || "";

      if (!checked || !Number.isFinite(qty) || qty <= 0) return null;

      return {
        productId,
        name,
        quantity: qty,
        price: Number.isFinite(price) ? price : 0
      };
    })
    .filter(Boolean);
}

function updateKpis() {
  const roomSelect = $("room-select");

  // room label
  let roomNumber = "—";
  if (roomSelect && roomSelect.value) {
    const opt = roomSelect.options[roomSelect.selectedIndex];
    const label = opt?.dataset?.roomNumber || opt?.textContent || "";
    const parsed = getRoomNumberFromAnyLabel(label);
    roomNumber = parsed || String(opt?.textContent || "—").trim() || "—";
  }
  setText("kpi-room", roomNumber);

  // items + total
  const items = computeSelectedItems();
  const totalQty = items.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const total = items.reduce((acc, it) => acc + it.quantity * it.price, 0);

  setText("kpi-items", String(totalQty));
  setText("kpi-total", formatPrice(total));

  // last action
  setText("kpi-time", nowLabel());
}

/* ---------- Products rendering ---------- */
async function loadProducts() {
  const list = $("products-list");
  if (!list) return;

  try {
    const res = await fetch("/api/products", { credentials: "include" });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const products = await res.json();

    list.innerHTML = "";

    (Array.isArray(products) ? products : []).forEach((product) => {
      const row = document.createElement("div");
      row.className = "product-row";

      const productId = product.id ?? product.product_id ?? product.productId ?? "";
      const name = product.name ?? product.product_name ?? "Producto";
      const price = Number(product.price);

      row.dataset.productId = String(productId);
      row.dataset.productName = String(name);
      row.dataset.productPrice = Number.isFinite(price) ? String(price) : "0";

      // checkbox
      const checkboxCol = document.createElement("div");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "product-check";
      checkboxCol.appendChild(checkbox);

      // info
      const infoCol = document.createElement("div");
      const nameEl = document.createElement("div");
      nameEl.className = "product-name";
      nameEl.textContent = name;

      const priceEl = document.createElement("span");
      priceEl.className = "product-price";
      priceEl.textContent = `Precio: ${formatPrice(price)}`;

      infoCol.appendChild(nameEl);
      infoCol.appendChild(priceEl);

      // qty
      const qtyCol = document.createElement("div");
      qtyCol.className = "product-qty";

      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.value = "0";
      qtyInput.className = "product-qty-input";

      const qtyLabel = document.createElement("span");
      qtyLabel.textContent = "cant.";

      qtyCol.appendChild(qtyInput);
      qtyCol.appendChild(qtyLabel);

      row.appendChild(checkboxCol);
      row.appendChild(infoCol);
      row.appendChild(qtyCol);

      // UX: auto-check when qty > 0
      qtyInput.addEventListener("input", () => {
        const v = Number(qtyInput.value || "0");
        if (Number.isFinite(v) && v > 0) checkbox.checked = true;
        updateKpis();
      });

      // UX: if uncheck -> qty = 0
      checkbox.addEventListener("change", () => {
        if (!checkbox.checked) qtyInput.value = "0";
        updateKpis();
      });

      list.appendChild(row);
    });

    updateKpis();
  } catch (err) {
    console.error("Error cargando productos:", err);
    const status = $("status");
    if (status) {
      status.textContent = "No se pudieron cargar los productos.";
      status.className = "status error";
    }
  }
}

/* ---------- Rooms ---------- */
async function loadRooms({ clear = false } = {}) {
  const select = $("room-select");
  const status = $("status");
  if (!select) return;

  try {
    if (clear) {
      // keep first placeholder option
      select.innerHTML = `<option value="">Seleccione una habitación</option>`;
    }

    const res = await fetch("/api/rooms", { credentials: "include" });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const rooms = await res.json();

    if (!Array.isArray(rooms) || rooms.length === 0) {
      if (status) {
        status.textContent = "No hay habitaciones registradas en el sistema.";
        status.className = "status error";
      }
      return;
    }

    rooms.forEach((room, index) => {
      const option = document.createElement("option");

      const id =
        room.id ??
        room.room_id ??
        room.roomId ??
        room.number ??
        room.room_number ??
        room.numero_habitacion ??
        room.numero ??
        index + 1;

      const roomText = formatRoomOptionText(room, index);

      option.value = String(id);
      option.textContent = roomText;
      option.dataset.roomNumber = getRoomNumberFromAnyLabel(roomText);
      select.appendChild(option);
    });

    updateKpis();
  } catch (err) {
    console.error("Error cargando habitaciones:", err);
    if (status) {
      status.textContent = "Error cargando habitaciones. Revisa el endpoint /api/rooms en el backend.";
      status.className = "status error";
    }
  }
}

/* ---------- Search / Select all / Unselect all ---------- */
function applyProductFilter(query) {
  const list = $("products-list");
  if (!list) return;

  const q = String(query || "").trim().toLowerCase();
  const rows = Array.from(list.querySelectorAll(".product-row"));

  rows.forEach((row) => {
    const name = String(row.dataset.productName || "").toLowerCase();
    const show = !q || name.includes(q);
    row.style.display = show ? "" : "none";
  });
}

function selectAllVisible() {
  const list = $("products-list");
  if (!list) return;

  const rows = Array.from(list.querySelectorAll(".product-row")).filter((r) => r.style.display !== "none");

  rows.forEach((row) => {
    const cb = row.querySelector(".product-check");
    const qty = row.querySelector(".product-qty-input");
    if (cb) cb.checked = true;
    if (qty && (Number(qty.value || "0") <= 0)) qty.value = "1";
  });

  updateKpis();
}

function unselectAll() {
  const list = $("products-list");
  if (!list) return;

  const rows = Array.from(list.querySelectorAll(".product-row"));
  rows.forEach((row) => {
    const cb = row.querySelector(".product-check");
    const qty = row.querySelector(".product-qty-input");
    if (cb) cb.checked = false;
    if (qty) qty.value = "0";
  });

  updateKpis();
}

/* ---------- Invoice url resolving ---------- */
function absolutizeUrl(u) {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return location.origin + raw;
  return location.origin + "/" + raw.replace(/^\/+/, "");
}

function buildInvoiceLinkFromCreated(created) {
  const candidates = [
    created?.invoiceUrl,
    created?.pdfUrl,
    created?.pdf_url,
    created?.invoice_url,
    created?.data?.invoiceUrl,
    created?.data?.pdfUrl,
    created?.data?.pdf_url,
    created?.data?.invoice_url
  ].filter(Boolean);

  if (candidates.length) return absolutizeUrl(candidates[0]);

  const id =
    created?.id ??
    created?.consumptionId ??
    created?.consumption_id ??
    created?.data?.id ??
    created?.data?.consumptionId ??
    created?.data?.consumption_id;

  if (id != null) return `${location.origin}/api/consumptions/${id}/invoice.pdf`;
  return "";
}

async function verifyLinkExists(url) {
  if (!url) return false;

  try {
    const res = await fetch(url, { method: "HEAD", credentials: "include" });
    if (res.ok) return true;
  } catch (_) {}

  try {
    const res2 = await fetch(url, { method: "GET", credentials: "include" });
    return res2.ok;
  } catch (_) {
    return false;
  }
}

async function resolveInvoiceLinkWithFallback(created) {
  const url = buildInvoiceLinkFromCreated(created);
  if (!url) return "";

  if (await verifyLinkExists(url)) return url;

  const id =
    created?.id ??
    created?.consumptionId ??
    created?.consumption_id ??
    created?.data?.id ??
    created?.data?.consumptionId ??
    created?.data?.consumption_id;

  if (id == null) return "";

  const base = `${location.origin}/api/consumptions/${id}`;
  const alternatives = [
    `${base}/invoice.pdf`,
    `${base}/invoice`,
    `${base}/pdf`,
    `${location.origin}/api/consumption/${id}/invoice.pdf`,
    `${location.origin}/api/invoices/${id}.pdf`,
    `${location.origin}/api/invoices/${id}/pdf`
  ];

  for (const a of alternatives) {
    if (await verifyLinkExists(a)) return a;
  }

  return "";
}

/* ---------- WhatsApp message (used in preview + send) ---------- */
function buildWhatsappMessage(roomNumber, items, total, note, invoiceLink) {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-CO");
  const hora = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const lines = [];
  lines.push("Consumo minibar RoomTab");
  lines.push(`Habitación ${roomNumber}`);
  lines.push(`Fecha: ${fecha} – Hora: ${hora}`);
  lines.push("");

  items.forEach((it) => {
    const itemTotal = it.quantity * it.price;
    lines.push(`${it.quantity} × ${it.name} - ${formatPrice(itemTotal)}`);
  });

  const totalQty = items.reduce((acc, it) => acc + it.quantity, 0);
  lines.push("");
  lines.push(`Total de ítems: ${totalQty}`);
  lines.push(`Total: ${formatPrice(total)}`);

  const cleanNote = String(note || "").trim();
  if (cleanNote) {
    lines.push("");
    lines.push(`Nota: ${cleanNote}`);
  }

  if (invoiceLink) {
    lines.push("");
    lines.push(`Cuenta de cobro (PDF): ${invoiceLink}`);
  }

  return lines.join("\n");
}

function openWhatsAppWithMessage(message) {
  const encodedMessage = encodeURIComponent(message);
  const phone = sanitizePhone(WHATSAPP_PHONE);

  const url = phone
    ? `https://wa.me/${phone}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;

  window.open(url, "_blank");
}

async function copyToClipboard(text) {
  const raw = String(text || "");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(raw);
      return true;
    }
  } catch (_) {}

  // fallback
  try {
    const ta = document.createElement("textarea");
    ta.value = raw;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch (_) {
    return false;
  }
}

/* ---------- Submit flow ---------- */
function getSelectedRoom() {
  const roomSelect = $("room-select");
  if (!roomSelect) return { roomId: "", roomNumber: "" };

  const roomId = roomSelect.value;
  const opt = roomSelect.options[roomSelect.selectedIndex];

  const roomNumber = getRoomNumberFromAnyLabel(
    opt?.dataset?.roomNumber || opt?.textContent || ""
  );

  return { roomId, roomNumber };
}

function readNote() {
  return String($("note")?.value || "");
}

function setStatus(msg, kind) {
  const status = $("status");
  if (!status) return;
  status.textContent = msg || "";
  status.className = `status ${kind || ""}`.trim();
}

async function handleSubmit({ openWhatsapp = true } = {}) {
  setStatus("", "");
  const { roomId, roomNumber } = getSelectedRoom();
  const items = computeSelectedItems();

  if (!roomId || !roomNumber) {
    setStatus("Selecciona una habitación antes de continuar.", "error");
    return { ok: false };
  }

  if (items.length === 0) {
    setStatus("Selecciona al menos un producto y su cantidad.", "error");
    return { ok: false };
  }

  const total = items.reduce((acc, it) => acc + it.quantity * it.price, 0);
  const note = readNote();

  const payload = {
    roomId,
    note,
    items: items.map((x) => ({ productId: x.productId, quantity: x.quantity }))
  };

  try {
    const res = await fetch("/api/consumptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Error registrando el consumo (HTTP ${res.status})`);

    let created = null;
    try {
      created = await res.json();
    } catch (_) {
      created = null;
    }

    let invoiceLink = "";
    try {
      invoiceLink = await resolveInvoiceLinkWithFallback(created);
    } catch (_) {
      invoiceLink = "";
    }

    const message = buildWhatsappMessage(roomNumber, items, total, note, invoiceLink);

    if (openWhatsapp) openWhatsAppWithMessage(message);

    setStatus(
      invoiceLink
        ? "Consumo registrado. Se generó el resumen con enlace PDF."
        : "Consumo registrado. Se generó el resumen (sin enlace PDF).",
      "success"
    );

    updateKpis();
    return { ok: true, message, invoiceLink };
  } catch (err) {
    console.error("Error al registrar consumo:", err);
    setStatus("Ocurrió un error al registrar el consumo.", "error");
    return { ok: false };
  }
}

/* ---------- Report PDF ---------- */
function setReportStatus(msg, kind) {
  const el = $("report-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `report-status ${kind || ""}`.trim();
}

function normalizeConsumptionRecord(raw) {
  const room =
    raw.roomNumber ??
    raw.room_number ??
    raw.room ??
    raw.habitacion ??
    raw.numero_habitacion ??
    raw.room?.room_number ??
    raw.room?.number ??
    raw.room?.numero_habitacion ??
    raw.room?.numero ??
    "";

  const roomNumber = getRoomNumberFromAnyLabel(room);

  const created =
    raw.created_at ??
    raw.createdAt ??
    raw.date ??
    raw.fecha ??
    raw.timestamp ??
    raw.submitted_at ??
    raw.created ??
    null;

  const createdAt = created ? new Date(created) : null;

  const itemsRaw = raw.items ?? raw.products ?? raw.detalle ?? raw.details ?? raw.consumptions ?? [];
  const items = Array.isArray(itemsRaw)
    ? itemsRaw
        .map((it) => {
          const name = it.name ?? it.product_name ?? it.product?.name ?? it.productName ?? "Producto";
          const quantity = Number(it.quantity ?? it.qty ?? it.cantidad ?? 0);
          const price = Number(it.price ?? it.valor ?? it.product?.price ?? it.unitPrice ?? 0);
          if (!Number.isFinite(quantity) || quantity <= 0) return null;
          return { name, quantity, price: Number.isFinite(price) ? price : 0 };
        })
        .filter(Boolean)
    : [];

  const total = Number(raw.total ?? raw.total_amount ?? raw.totalAmount ?? raw.valor_total ?? NaN);
  const computedTotal = items.reduce((acc, it) => acc + it.quantity * it.price, 0);

  return {
    roomNumber: roomNumber || "N/A",
    createdAt,
    items,
    total: Number.isFinite(total) ? total : computedTotal
  };
}

function groupReportByRoom(records) {
  const map = new Map();

  records.forEach((r) => {
    const key = r.roomNumber || "N/A";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });

  const rooms = Array.from(map.keys()).sort((a, b) => String(a).localeCompare(String(b), "es"));
  return rooms.map((roomNumber) => {
    const list = map.get(roomNumber) || [];
    list.sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.getTime() : 0;
      const tb = b.createdAt ? b.createdAt.getTime() : 0;
      return ta - tb;
    });
    const roomTotal = list.reduce((acc, x) => acc + (Number(x.total) || 0), 0);
    const roomItems = list.reduce((acc, x) => acc + x.items.reduce((iAcc, it) => iAcc + (it.quantity || 0), 0), 0);
    return { roomNumber, records: list, roomTotal, roomItems };
  });
}

async function fetchConsumptionsForReport(from, to) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const urls = [
    `/api/consumptions/report?${params.toString()}`,
    `/api/consumptions?${params.toString()}`,
    `/api/consumptions/report`,
    `/api/consumptions`
  ];

  let lastErr = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("No data");
}

function buildReportFilename(from, to) {
  const f = from || "todo";
  const t = to || "todo";
  return `informe-consumos-${f}-${t}.pdf`;
}

function loadPdfLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataUrl = c.toDataURL("image/png");
        resolve(dataUrl);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = function () { resolve(null); };
    img.src = "/images/roomtab-logo-dark-transparent.png";
  });
}

async function downloadReportPdf() {
  setReportStatus("", "");

  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    setReportStatus("No está cargada la librería del PDF.", "err");
    return;
  }

  const from = $("report-from")?.value || "";
  const to = $("report-to")?.value || "";

  try {
    const raw = await fetchConsumptionsForReport(from, to);
    const normalized = raw
      .map(normalizeConsumptionRecord)
      .filter((x) => x.items.length > 0 || (x.total && x.total > 0));

    if (normalized.length === 0) {
      setReportStatus("No hay consumos en el rango seleccionado.", "err");
      return;
    }

    const grouped = groupReportByRoom(normalized);
    const grandTotal = normalized.reduce((acc, x) => acc + (Number(x.total) || 0), 0);

    const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const gen = nowLabel();

    const logoData = await loadPdfLogo();

    let y = 56;

    // ── Header with logo ──
    if (logoData) {
      doc.addImage(logoData, "PNG", pageW - margin - 120, y - 12, 120, 40);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("INFORME DE CONSUMOS", margin, y);

    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Minibar — Minibar management system", margin, y);
    doc.setTextColor(0);

    y += 22;
    doc.setDrawColor(194, 214, 155);
    doc.setLineWidth(1.5);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineWidth(0.5);

    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Rango de fechas:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${from || "—"}  a  ${to || "—"}`, margin + 82, y);

    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text("Generado:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(gen, margin + 52, y);

    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text("Habitaciones con consumo:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(grouped.length), margin + 130, y);

    doc.setFont("helvetica", "bold");
    doc.text("Total general:", pageW - margin, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(formatPrice(grandTotal), pageW - margin - 74, y, { align: "right" });

    y += 18;
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);

    y += 18;

    // ── Ensure space helper ──
    function ensureSpace(need) {
      if (y + need <= pageH - 48) return;
      doc.addPage();
      y = 56;
      if (logoData) {
        doc.addImage(logoData, "PNG", pageW - margin - 120, y - 14, 120, 40);
      }
      y += 18;
      doc.setDrawColor(194, 214, 155);
      doc.setLineWidth(1.5);
      doc.line(margin, y, pageW - margin, y);
      doc.setLineWidth(0.5);
      y += 18;
    }

    // ── Rooms loop ──
    grouped.forEach((g) => {
      ensureSpace(90);

      doc.setFillColor(245, 245, 240);
      doc.rect(margin, y - 10, pageW - margin * 2, 28, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Habitación ${g.roomNumber}`, margin, y + 4);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Consumos: ${g.records.length}  |  Ítems: ${g.roomItems}`, margin, y + 20);
      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${formatPrice(g.roomTotal)}`, pageW - margin, y + 4, { align: "right" });

      y += 34;
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      g.records.forEach((r) => {
        ensureSpace(60);

        const d = r.createdAt ? r.createdAt.toLocaleDateString("es-CO") : "—";
        const t = r.createdAt
          ? r.createdAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
          : "—";

        doc.setFillColor(250, 250, 248);
        doc.rect(margin, y - 8, pageW - margin * 2, 22, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${d}  ${t}`, margin, y + 3);

        doc.setFont("helvetica", "normal");
        doc.text(formatPrice(r.total), pageW - margin, y + 3, { align: "right" });

        y += 18;

        r.items.forEach((it) => {
          ensureSpace(30);
          const lineTotal = it.quantity * it.price;
          doc.text(`${it.quantity} × ${it.name}`, margin + 14, y, { maxWidth: pageW - margin * 2 - 160 });
          doc.text(formatPrice(lineTotal), pageW - margin, y, { align: "right" });
          y += 13;
        });

        y += 6;
        doc.setDrawColor(230);
        doc.line(margin + 14, y, pageW - margin, y);
        y += 10;
      });

      y += 4;
    });

    // ── Grand total ──
    ensureSpace(60);
    doc.setDrawColor(194, 214, 155);
    doc.setLineWidth(1.5);
    doc.line(margin, y - 4, pageW - margin, y - 4);
    doc.setLineWidth(0.5);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("TOTAL GENERAL", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(formatPrice(grandTotal), pageW - margin, y, { align: "right" });

    // ── Footer ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Minibar management system — RoomTab Minibar App", margin, pageH - 20, { align: "center" });
    doc.setTextColor(0);

    doc.save(buildReportFilename(from, to));
    setReportStatus("Informe descargado correctamente.", "ok");
  } catch (err) {
    console.error(err);
    setReportStatus("No se pudo generar el informe. Revisa el endpoint de consumos.", "err");
  }
}

/* ---------- Modal preview + buttons ---------- */
function setPreviewContent(text) {
  const el = $("preview-content");
  if (el) el.textContent = text || "—";
}

function openPreviewModal() {
  const modal = $("preview-modal");
  if (!modal) return;
  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
}

function closePreviewModal() {
  const modal = $("preview-modal");
  if (!modal) return;
  modal.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
}

function buildPreviewMessageOnly() {
  const { roomNumber } = getSelectedRoom();
  const items = computeSelectedItems();
  const note = readNote();
  const total = items.reduce((acc, it) => acc + it.quantity * it.price, 0);

  if (!roomNumber) return "Selecciona una habitación.";
  if (!items.length) return "Selecciona productos y cantidades para generar el resumen.";

  // preview sin link PDF (el PDF se resuelve al registrar)
  return buildWhatsappMessage(roomNumber, items, total, note, "");
}

/* ---------- Menu toggle (enhanced for mobile) ---------- */
function setupMenuToggle() {
  const sidebar = document.querySelector(".sidebar");
  const toggleBtn = $("menu-toggle");
  const backdrop = $("sidebar-backdrop");
  if (!sidebar || !toggleBtn) return;

  const open = () => {
    sidebar.classList.add("sidebar-open");
    if (backdrop) backdrop.classList.add("backdrop-visible");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    sidebar.classList.remove("sidebar-open");
    if (backdrop) backdrop.classList.remove("backdrop-visible");
    document.body.style.overflow = "";
  };

  // Add close button to sidebar if not present
  if (!sidebar.querySelector(".sidebar-close-btn")) {
    const closeBtn = document.createElement("button");
    closeBtn.className = "sidebar-close-btn";
    closeBtn.setAttribute("aria-label", "Cerrar men\u00fa");
    closeBtn.innerHTML = '<i class="ph-light ph-x"></i>';
    sidebar.appendChild(closeBtn);

    closeBtn.addEventListener("click", close);
  }

  toggleBtn.addEventListener("click", () => {
    if (sidebar.classList.contains("sidebar-open")) close();
    else open();
  });

  if (backdrop) backdrop.addEventListener("click", close);

  // Close sidebar on escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("sidebar-open")) {
      close();
    }
  });

  // Swipe to close (mobile)
  let touchStartX = 0;
  let touchCurrentX = 0;
  let isDragging = false;

  sidebar.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    isDragging = sidebar.classList.contains("sidebar-open");
  }, { passive: true });

  sidebar.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    touchCurrentX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchCurrentX;
    if (diff > 0) {
      sidebar.style.transform = "translateX(" + (-diff) + "px)";
      if (backdrop) backdrop.style.opacity = Math.max(0, 1 - diff / 300);
    }
  }, { passive: true });

  sidebar.addEventListener("touchend", () => {
    if (!isDragging) return;
    const diff = touchStartX - touchCurrentX;
    sidebar.style.transform = "";
    if (backdrop) backdrop.style.opacity = "";
    if (diff > 80) close();
    isDragging = false;
  }, { passive: true });
}

/* ---------- Clear ---------- */
function clearForm() {
  const room = $("room-select");
  const note = $("note");
  const search = $("product-search");

  if (room) room.value = "";
  if (note) note.value = "";
  if (search) search.value = "";

  unselectAll();
  applyProductFilter("");
  setStatus("", "");
  setReportStatus("", "");
  setPreviewContent("—");
  updateKpis();
}

/* ---------- Wiring ---------- */
function setupEvents() {
  // room change -> KPI + "last action"
  const roomSelect = $("room-select");
  if (roomSelect) roomSelect.addEventListener("change", updateKpis);

  // refresh rooms
  const refreshRoomsBtn = $("refresh-rooms-btn");
  if (refreshRoomsBtn) {
    refreshRoomsBtn.addEventListener("click", async () => {
      setStatus("", "");
      await loadRooms({ clear: true });
      setStatus("Habitaciones actualizadas.", "success");
      updateKpis();
    });
  }

  // search
  const productSearch = $("product-search");
  if (productSearch) {
    productSearch.addEventListener("input", () => applyProductFilter(productSearch.value));
  }

  // select/unselect
  const selectAllBtn = $("select-all-btn");
  if (selectAllBtn) selectAllBtn.addEventListener("click", selectAllVisible);

  const unselectAllBtn = $("unselect-all-btn");
  if (unselectAllBtn) unselectAllBtn.addEventListener("click", unselectAll);

  // clear
  const clearBtn = $("clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearForm);

  // main submit
  const submitBtn = $("submit-btn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      // registra y abre WhatsApp
      const r = await handleSubmit({ openWhatsapp: true });
      if (r?.ok) {
        // opcional: podrías limpiar cantidades, pero por UX lo dejamos como está.
      }
    });
  }

  // copy summary (sin registrar)
  const copyBtn = $("copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const msg = buildPreviewMessageOnly();
      const ok = await copyToClipboard(msg);
      setStatus(ok ? "Resumen copiado al portapapeles." : "No se pudo copiar el resumen.", ok ? "success" : "error");
      updateKpis();
    });
  }

  // preview modal open
  const previewBtn = $("preview-btn");
  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      setPreviewContent(buildPreviewMessageOnly());
      openPreviewModal();
      updateKpis();
    });
  }

  // preview modal close
  const closePreviewBtn = $("close-preview-btn");
  if (closePreviewBtn) closePreviewBtn.addEventListener("click", closePreviewModal);

  const modal = $("preview-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePreviewModal();
    });
  }

  // preview modal copy
  const previewCopyBtn = $("preview-copy-btn");
  if (previewCopyBtn) {
    previewCopyBtn.addEventListener("click", async () => {
      const msg = $("preview-content")?.textContent || "";
      const ok = await copyToClipboard(msg);
      setStatus(ok ? "Resumen copiado." : "No se pudo copiar.", ok ? "success" : "error");
      updateKpis();
    });
  }

  // preview modal send (registra y abre WhatsApp)
  const previewSendBtn = $("preview-send-btn");
  if (previewSendBtn) {
    previewSendBtn.addEventListener("click", async () => {
      const r = await handleSubmit({ openWhatsapp: true });
      if (r?.ok) closePreviewModal();
    });
  }

  // report
  const downloadBtn = $("download-report-btn");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadReportPdf);
}

/* =========================
   Desbloqueo de habitación (multi-room) - ADDON
   ========================= */

function getSelectedRoomsMulti() {
  const select = $("rooms-multi");
  if (!select) return [];

  const selected = Array.from(select.selectedOptions || []);
  return selected
    .map((opt) => getRoomNumberFromAnyLabel(opt?.dataset?.roomNumber || opt?.textContent || opt?.value || ""))
    .filter(Boolean);
}

function buildUnlockMessage(roomNumbers, note) {
  const now = new Date();
  const fecha = now.toLocaleDateString("es-CO");
  const hora = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  const roomsLine = roomNumbers.join(", ");

  const lines = [];
  lines.push("Desbloqueo de habitación");
  lines.push(`Habitación(es): ${roomsLine}`);
  lines.push(`Fecha: ${fecha} – Hora: ${hora}`);

  const cleanNote = String(note || "").trim();
  if (cleanNote) {
    lines.push("");
    lines.push(`Nota: ${cleanNote}`);
  }

  return lines.join("\n");
}

function setUnlockStatus(msg, kind) {
  const el = $("unlock-status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status ${kind || ""}`.trim();
}

function setUnlockPreview(text) {
  const box = $("unlock-preview-box");
  if (box) box.textContent = text || "—";
}

async function loadRoomsMulti({ clear = false } = {}) {
  const select = $("rooms-multi");
  if (!select) return;

  try {
    if (clear) select.innerHTML = "";

    const res = await fetch("/api/rooms", { credentials: "include" });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

    const rooms = await res.json();

    if (!Array.isArray(rooms) || rooms.length === 0) {
      setUnlockStatus("No hay habitaciones registradas en el sistema.", "error");
      return;
    }

    rooms.forEach((room, index) => {
      const option = document.createElement("option");

      const id =
        room.id ??
        room.room_id ??
        room.roomId ??
        room.number ??
        room.room_number ??
        room.numero_habitacion ??
        room.numero ??
        index + 1;

      const roomText = formatRoomOptionText(room, index);

      option.value = String(id);
      option.textContent = roomText;
      option.dataset.roomNumber = getRoomNumberFromAnyLabel(roomText);

      select.appendChild(option);
    });

    setUnlockStatus("Habitaciones cargadas.", "success");
  } catch (err) {
    console.error("Error cargando habitaciones (multi):", err);
    setUnlockStatus("Error cargando habitaciones. Revisa el endpoint /api/rooms.", "error");
  }
}

function selectAllRoomsMulti() {
  const select = $("rooms-multi");
  if (!select) return;

  Array.from(select.options).forEach((opt) => (opt.selected = true));
}

function clearRoomsMultiSelection() {
  const select = $("rooms-multi");
  if (!select) return;

  Array.from(select.options).forEach((opt) => (opt.selected = false));
}

function buildUnlockPreviewMessageOnly() {
  const rooms = getSelectedRoomsMulti();
  const note = String($("unlock-note")?.value || "");

  if (!rooms.length) return "Selecciona una o varias habitaciones.";
  return buildUnlockMessage(rooms, note);
}

function setupUnlockEvents() {
  // Si esta página no tiene el multiselect, no hace nada.
  if (!$("rooms-multi")) return;

  const refreshBtn = $("unlock-refresh-rooms-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      setUnlockStatus("", "");
      await loadRoomsMulti({ clear: true });
      setUnlockPreview(buildUnlockPreviewMessageOnly());
    });
  }

  const selectAllBtn = $("unlock-select-all-btn");
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      selectAllRoomsMulti();
      setUnlockPreview(buildUnlockPreviewMessageOnly());
    });
  }

  const clearBtn = $("unlock-clear-selection-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearRoomsMultiSelection();
      setUnlockPreview("—");
      setUnlockStatus("", "");
    });
  }

  const roomsSelect = $("rooms-multi");
  if (roomsSelect) {
    roomsSelect.addEventListener("change", () => {
      setUnlockPreview(buildUnlockPreviewMessageOnly());
    });
  }

  const note = $("unlock-note");
  if (note) {
    note.addEventListener("input", () => {
      setUnlockPreview(buildUnlockPreviewMessageOnly());
    });
  }

  const previewBtn = $("unlock-preview-btn");
  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      const msg = buildUnlockPreviewMessageOnly();
      setPreviewContent(msg);
      openPreviewModal();
    });
  }

  const copyBtn = $("unlock-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const msg = buildUnlockPreviewMessageOnly();
      const ok = await copyToClipboard(msg);
      setUnlockStatus(ok ? "Mensaje copiado al portapapeles." : "No se pudo copiar el mensaje.", ok ? "success" : "error");
    });
  }

  const sendBtn = $("unlock-send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const rooms = getSelectedRoomsMulti();
      const noteText = String($("unlock-note")?.value || "");

      if (!rooms.length) {
        setUnlockStatus("Selecciona una o varias habitaciones antes de enviar.", "error");
        return;
      }

      const msg = buildUnlockMessage(rooms, noteText);
      setUnlockPreview(msg);
      openWhatsAppWithMessage(msg);
      setUnlockStatus("Mensaje listo para enviar en WhatsApp.", "success");
    });
  }

  // Reutiliza botones del modal (ya existen en tu JS)
  const previewSendBtn = $("preview-send-btn");
  if (previewSendBtn) {
    previewSendBtn.addEventListener("click", () => {
      const rooms = getSelectedRoomsMulti();
      const noteText = String($("unlock-note")?.value || "");

      if (!rooms.length) {
        setUnlockStatus("Selecciona una o varias habitaciones antes de enviar.", "error");
        return;
      }

      const msg = buildUnlockMessage(rooms, noteText);
      openWhatsAppWithMessage(msg);
      closePreviewModal();
      setUnlockStatus("Mensaje listo para enviar en WhatsApp.", "success");
    });
  }
}

/* ---------- Notification Nav ---------- */

async function loadNotificationCount() {
  try {
    const data = await fetch("/api/notifications/unread-count", { credentials: "include" });
    if (!data.ok) return 0;
    const json = await data.json();
    return json.count || 0;
  } catch {
    return 0;
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;
  loadNotificationCount().then(function(count) {
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  });
}

function injectNotificationsNav() {
  var nav = document.querySelector(".sidebar-nav");
  if (!nav) return;

  var existingLink = document.getElementById("nav-notifications");

  if (!existingLink) {
    var perfilLink = nav.querySelector('a[href="/perfil"]');
    if (!perfilLink) return;

    var notifLink = document.createElement("a");
    notifLink.href = "/app/notificaciones";
    notifLink.className = "nav-item";
    notifLink.id = "nav-notifications";
    notifLink.innerHTML =
      '<i class="ph-light ph-bell nav-icon"></i>' +
      '<span class="nav-label">Notificaciones</span>' +
      '<span class="nav-badge" id="notif-badge" style="display:none;"></span>';

    perfilLink.parentNode.insertBefore(notifLink, perfilLink);
  }

  updateNotificationBadge();

  // Re-check every 2 minutes
  if (!window._notifIntervalSet) {
    setInterval(updateNotificationBadge, 120000);
    window._notifIntervalSet = true;
  }
}

/* ---------- Quick Review Nav Injection ---------- */
function injectQuickReviewNav() {
  var nav = document.querySelector(".sidebar-nav");
  if (!nav) return;

  var existingLink = document.getElementById("nav-quick-review");
  var existingByHref = nav.querySelector('a[href="/app/revision-rapida"]');
  if (existingLink || existingByHref) return;

  var minibarLink = nav.querySelector('a[href="/app/minibar"]');
  if (!minibarLink) return;

  var quickLink = document.createElement("a");
  quickLink.href = "/app/revision-rapida";
  quickLink.className = "nav-item";
  quickLink.id = "nav-quick-review";
  quickLink.innerHTML =
    '<i class="ph-light ph-lightning nav-icon"></i>' +
    '<span class="nav-label">Revisión rápida</span>';

  minibarLink.parentNode.insertBefore(quickLink, minibarLink.nextSibling);
}

/* =========================
   Init
   ========================= */

async function init() {
  initTheme();
  initLanguage();
  setupThemeSwitcher(document.getElementById("app-theme-switcher"));
  setupLangSelector(document.getElementById("app-lang-selector"));

  loadCurrentUser();
  injectNotificationsNav();
  injectQuickReviewNav();

  // Mobile bottom bar
  setupBottomBar();

  // Consumo: solo si existen los elementos
  if ($("room-select")) await loadRooms({ clear: true });
  if ($("products-list")) await loadProducts();

  // Desbloqueo: solo si existe el multiselect
  if ($("rooms-multi")) await loadRoomsMulti({ clear: true });

  setupMenuToggle();

  // Eventos existentes (consumo) - son seguros porque validan IDs
  setupEvents();

  // Eventos del desbloqueo
  setupUnlockEvents();

  // Preview inicial del desbloqueo
  if ($("rooms-multi")) setUnlockPreview(buildUnlockPreviewMessageOnly());

  updateKpis();

  // Quick room search setup
  if ($("quick-room-search")) {
    setupQuickRoomSearch("quick-room-search", "quick-room-result", function (room) {
      var roomId = room.id || room.room_id || room.roomId;
      var roomNum = room.room_number || room.roomNumber || room.numero_habitacion || room.numero || room.number || "";
      window.location.href = "/app/minibar?room=" + roomId + "&floor=" + (room.floor_id || room.piso_id || "");
    });
  }

  // Mark touch device for CSS
  if (isTouchDevice()) {
    document.documentElement.classList.add("touch-device");
  }

  // Phase 1 features
  initKeyboardShortcuts();
  initPullToRefresh();
  initSwipeActions();
  initAutoTheme();
  initFontSize();
}

/* ══════════════════════════════════════════════════════
   PHASE 1: KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════ */
function initKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          var submitBtn = document.getElementById("submit-btn") || document.getElementById("save-consumption-btn");
          if (submitBtn && !submitBtn.disabled) submitBtn.click();
          break;
        case "f":
          e.preventDefault();
          var searchInput = document.querySelector("#product-search, #quick-room-search, .search-box input");
          if (searchInput) searchInput.focus();
          break;
        case "l":
          e.preventDefault();
          var clearBtn = document.getElementById("clear-btn");
          if (clearBtn) clearBtn.click();
          break;
        case "r":
          e.preventDefault();
          var refreshBtn = document.getElementById("refresh-rooms-btn") || document.getElementById("refresh-inventory-btn");
          if (refreshBtn) refreshBtn.click();
          break;
        case "d":
          e.preventDefault();
          document.getElementById("download-report-btn") && document.getElementById("download-report-btn").click();
          break;
      }
    }
  });
}

/* ══════════════════════════════════════════════════════
   PHASE 1: PULL-TO-REFRESH
   ══════════════════════════════════════════════════════ */
function initPullToRefresh() {
  var containers = document.querySelectorAll(".ptr-enabled");
  if (!containers.length) return;

  containers.forEach(function (container) {
    var startY = 0;
    var pulling = false;
    var refreshThreshold = 80;

    container.addEventListener("touchstart", function (e) {
      if (container.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    container.addEventListener("touchmove", function (e) {
      if (!pulling) return;
      var diff = e.touches[0].clientY - startY;
      if (diff > 20) {
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener("touchend", function (e) {
      if (!pulling) return;
      pulling = false;
      var diff = e.changedTouches[0].clientY - startY;
      if (diff > refreshThreshold) {
        triggerRefresh(container);
      }
    }, { passive: true });
  });
}

function triggerRefresh(container) {
  var indicator = container.querySelector(".ptr-indicator");
  if (indicator) {
    indicator.classList.add("visible");
    indicator.innerHTML = '<i class="ph-light ph-spinner spinning"></i> Actualizando…';
  }

  setTimeout(function () {
    window.location.reload();
  }, 600);
}

/* ══════════════════════════════════════════════════════
   PHASE 1: SWIPE ACTIONS
   ══════════════════════════════════════════════════════ */
function initSwipeActions() {
  document.querySelectorAll(".swipe-container").forEach(function (container) {
    var content = container.querySelector(".swipe-content");
    var actions = container.querySelector(".swipe-actions");
    if (!content || !actions) return;

    var startX = 0;
    var currentX = 0;
    var isDragging = false;
    var isOpen = false;
    var threshold = 60;
    var actionWidth = actions.offsetWidth || 140;

    container.addEventListener("touchstart", function (e) {
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });

    container.addEventListener("touchmove", function (e) {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
      var diff = startX - currentX;

      if (diff > 10) {
        e.preventDefault();
        var translate = Math.min(Math.max(isOpen ? actionWidth - Math.abs(diff) : diff, 0), actionWidth);
        content.style.transform = "translateX(-" + translate + "px)";
      }
    }, { passive: false });

    container.addEventListener("touchend", function () {
      if (!isDragging) return;
      isDragging = false;
      var diff = startX - currentX;

      if (diff > threshold && !isOpen) {
        isOpen = true;
        content.style.transform = "translateX(-" + actionWidth + "px)";
        actions.classList.add("open");
      } else if (isOpen && diff < -20) {
        isOpen = false;
        content.style.transform = "translateX(0)";
        actions.classList.remove("open");
      } else if (!isOpen) {
        content.style.transform = "translateX(0)";
      }
    }, { passive: true });
  });
}

/* ══════════════════════════════════════════════════════
   PHASE 1: AUTO THEME
   ══════════════════════════════════════════════════════ */
function initAutoTheme() {
  if (typeof applyAutoTheme === "function" && typeof isAutoSwitchEnabled === "function") {
    if (isAutoSwitchEnabled()) applyAutoTheme();
  }
}

/* ══════════════════════════════════════════════════════
   PHASE 1: FONT SIZE
   ══════════════════════════════════════════════════════ */
function initFontSize() {
  if (typeof setFontSize === "function") {
    var saved = localStorage.getItem("chargeit-font-size") || "medium";
    setFontSize(saved);
  }
}

document.addEventListener("DOMContentLoaded", init);

