(function () {
  "use strict";

  const API = "/api/notifications";

  var notifications = [];
  var floors = [];
  var rooms = [];

  var selectedRoomId = "";

  var el = {
    container: document.getElementById("notifications-container"),
    empty: document.getElementById("notif-empty"),
    filterFloor: document.getElementById("filter-floor"),
    filterRoomGrid: document.getElementById("filter-room-grid"),
    filterProduct: document.getElementById("filter-product"),
    btnMarkAllRead: document.getElementById("btn-mark-all-read"),
    btnCheckNow: document.getElementById("btn-check-now")
  };

  function $(id) { return document.getElementById(id); }

  function getExpirationStatus(expirationDate) {
    if (!expirationDate) return { class: "exp-gray", label: "No definida", days: null };
    var dateStr = normalizeDateStr(expirationDate);
    if (!dateStr) return { class: "exp-gray", label: "No definida", days: null };
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var expDate = new Date(dateStr + "T00:00:00");
    if (isNaN(expDate.getTime())) return { class: "exp-gray", label: "No definida", days: null };
    var diffTime = expDate.getTime() - today.getTime();
    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(diffDays)) return { class: "exp-gray", label: "No definida", days: null };
    if (diffDays < 0) return { class: "exp-red", label: "Vencido", days: diffDays };
    if (diffDays <= 7) return { class: "exp-red", label: diffDays + " d\u00eda" + (diffDays !== 1 ? "s" : ""), days: diffDays };
    if (diffDays <= 30) return { class: "exp-yellow", label: diffDays + " d\u00edas", days: diffDays };
    return { class: "exp-green", label: diffDays + " d\u00edas", days: diffDays };
  }

  function normalizeDateStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val)) return '';
      return val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0') + '-' + String(val.getDate()).padStart(2, '0');
    }
    var s = String(val).trim();
    if (s.indexOf('T') !== -1) s = s.split('T')[0];
    if (s.indexOf(' ') !== -1) s = s.split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  }

  function formatDateLocal(dateStr) {
    if (!dateStr) return "\u2014";
    var s = normalizeDateStr(dateStr);
    if (!s) return "\u2014";
    var d = new Date(s + "T00:00:00");
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleDateString("es-CO");
  }

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.credentials = "include";
    if (opts.body && typeof opts.body === "string") {
      opts.headers["Content-Type"] = "application/json";
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (txt) {
          try { var e = JSON.parse(txt); throw new Error(e.error || "Error del servidor"); }
          catch (parseErr) { if (parseErr.message && parseErr.message !== "Error del servidor") throw parseErr; throw new Error("Error del servidor (HTTP " + r.status + ")"); }
        });
      }
      return r.json();
    });
  }

  async function loadNotifications() {
    try {
      var fetchPromise = apiFetch(API);
      var timeoutPromise = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("Tiempo de espera agotado al cargar notificaciones.")); }, 15000);
      });
      notifications = await Promise.race([fetchPromise, timeoutPromise]);
      renderNotifications();
    } catch (err) {
      el.container.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning-circle"></i><h3>Error</h3><p>' + (err.message || "No se pudieron cargar las notificaciones.") + '</p></div>';
    }
  }

  async function loadFloors() {
    try {
      floors = await apiFetch("/api/minibar/floors");
      renderFloorFilter();
    } catch (err) {
      console.error("Error cargando pisos:", err);
    }
  }

  async function loadRooms(floorId) {
    var url = "/api/minibar/rooms";
    if (floorId) url += "/" + floorId;
    try {
      rooms = await apiFetch(url);
      renderRoomFilter();
    } catch (err) {
      console.error("Error cargando habitaciones:", err);
    }
  }

  async function loadAllData() {
    await Promise.allSettled([loadFloors(), loadNotifications()]);
  }

  function renderFloorFilter() {
    el.filterFloor.innerHTML = '<option value="">Todos los pisos</option>';
    floors.forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      el.filterFloor.appendChild(opt);
    });
  }

  function renderRoomFilter() {
    selectedRoomId = "";
    var html = '<div class="notif-room-chip active" data-room-id="">Todas</div>';
    rooms.forEach(function (r) {
      html += '<div class="notif-room-chip" data-room-id="' + r.id + '">' + r.room_number + '</div>';
    });
    el.filterRoomGrid.innerHTML = html;

    el.filterRoomGrid.querySelectorAll(".notif-room-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        el.filterRoomGrid.querySelectorAll(".notif-room-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        selectedRoomId = chip.dataset.roomId;
        renderNotifications();
      });
    });
  }

  function filterNotifications() {
    var floorVal = el.filterFloor.value;
    var productVal = el.filterProduct.value.trim().toLowerCase();

    return notifications.filter(function (n) {
      if (floorVal && String(n.floor_id) !== floorVal) return false;
      if (selectedRoomId && String(n.room_id) !== selectedRoomId) return false;
      if (productVal && n.product_name.toLowerCase().indexOf(productVal) === -1) return false;
      return true;
    });
  }

  function getLowStockStatus(quantity, minStock) {
    return { class: "exp-yellow", label: "Stock bajo", days: null };
  }

  function renderNotifications() {
    var filtered = filterNotifications();

    if (!filtered.length) {
      el.container.innerHTML = '<div class="empty-state"><i class="ph-light ph-bell-slash"></i><h3>Sin notificaciones</h3><p>No hay productos pr\u00f3ximos a vencer.</p></div>';
      return;
    }

    filtered.sort(function (a, b) {
      if (a.type === 'low_stock' && b.type !== 'low_stock') return 1;
      if (a.type !== 'low_stock' && b.type === 'low_stock') return -1;
      var da = normalizeDateStr(a.expiration_date);
      var db = normalizeDateStr(b.expiration_date);
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da + 'T00:00:00') - new Date(db + 'T00:00:00');
    });

    var html = '<div class="notif-list">';
    filtered.forEach(function (n) {
      var isLowStock = n.type === 'low_stock';
      var expStatus = isLowStock ? getLowStockStatus() : getExpirationStatus(n.expiration_date);
      var isRead = n.is_read === 1 || n.is_read === true;
      var readClass = isRead ? "notif-read" : "notif-unread";
      var icon = isLowStock
        ? "ph-package"
        : (n.expiration_date ? "ph-warning" + (expStatus.days < 0 ? "-circle" : "") : "ph-clock");
      var label = isLowStock ? "Stock: " : "Vence: ";

      html +=
        '<div class="notif-card ' + readClass + '" data-id="' + n.id + '">' +
          '<div class="notif-icon"><i class="ph-light ' + icon + '"></i></div>' +
          '<div class="notif-body">' +
            '<div class="notif-header">' +
              '<span class="notif-product">' + n.product_name + '</span>' +
              '<span class="notif-room">' + n.floor_name + " - Hab. " + n.room_number + '</span>' +
            '</div>' +
            '<div class="notif-details">' +
              '<span class="exp-indicator ' + expStatus.class + '"></span>' +
              '<span class="notif-exp-date ' + expStatus.class + '">' + label + (isLowStock ? n.message : formatDateLocal(n.expiration_date)) + '</span>' +
              '<span class="notif-days ' + expStatus.class + '">' + expStatus.label + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="notif-actions">' +
            (!isRead
              ? '<button class="btn-icon notif-mark-read" title="Marcar como le\u00eddo"><i class="ph-light ph-check"></i></button>'
              : '<span class="notif-read-badge">Le\u00eddo</span>') +
          '</div>' +
        '</div>';
    });
    html += "</div>";
    el.container.innerHTML = html;

    // Attach mark-read events
    el.container.querySelectorAll(".notif-mark-read").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".notif-card");
        var id = card.dataset.id;
        markAsRead(id);
      });
    });
  }

  async function markAsRead(id) {
    try {
      await apiFetch(API + "/" + id + "/read", { method: "POST" });
      var card = document.querySelector('.notif-card[data-id="' + id + '"]');
      if (card) {
        card.classList.remove("notif-unread");
        card.classList.add("notif-read");
        card.querySelector(".notif-actions").innerHTML = '<span class="notif-read-badge">Le\u00eddo</span>';
      }
      // Refresh sidebar badge
      if (typeof updateNotificationBadge === "function") updateNotificationBadge();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function markAllAsRead() {
    try {
      await apiFetch(API + "/read-all", { method: "POST" });
      document.querySelectorAll(".notif-card.notif-unread").forEach(function (card) {
        card.classList.remove("notif-unread");
        card.classList.add("notif-read");
        card.querySelector(".notif-actions").innerHTML = '<span class="notif-read-badge">Le\u00eddo</span>';
      });
      if (typeof updateNotificationBadge === "function") updateNotificationBadge();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function checkNow() {
    if (!el.btnCheckNow) return;
    el.btnCheckNow.disabled = true;
    el.btnCheckNow.innerHTML = '<i class="ph-light ph-spinner"></i> Revisando...';
    try {
      var result = await apiFetch(API + "/check", { method: "POST" });
      await loadNotifications();
      if (typeof updateNotificationBadge === "function") updateNotificationBadge();
      alert(result.message || "Revision completada");
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      el.btnCheckNow.disabled = false;
      el.btnCheckNow.innerHTML = '<i class="ph-light ph-magnifying-glass"></i> Revisar ahora';
    }
  }

  function init() {
    loadAllData();

    el.filterFloor.addEventListener("change", function () {
      loadRooms(el.filterFloor.value || null);
      renderNotifications();
    });

    el.filterProduct.addEventListener("input", function () {
      renderNotifications();
    });

    el.btnMarkAllRead.addEventListener("click", markAllAsRead);

    if (el.btnCheckNow) {
      el.btnCheckNow.addEventListener("click", checkNow);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
