(function () {
  var currentMonth = null;
  var currentYear = null;

  var formatCOP = function (n) {
    return "$" + Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  var t = function (key, fallback) {
    return (window.translations && translations[getCurrentLang ? getCurrentLang() : "es"] && translations[getCurrentLang ? getCurrentLang() : "es"][key]) || fallback || key;
  };

  var getColorClass = function (amount, maxAmount) {
    if (!amount || amount <= 0) return "low";
    if (!maxAmount || maxAmount <= 0) return "medium";
    var ratio = amount / maxAmount;
    if (ratio >= 0.6) return "high";
    if (ratio >= 0.25) return "medium";
    return "low";
  };

  var renderCalendar = function (data) {
    var container = document.getElementById("cal-days");
    if (!container) return;

    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var firstDay = new Date(currentYear, currentMonth, 1).getDay();
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

    var dayMap = {};
    if (data && data.days) {
      for (var i = 0; i < data.days.length; i++) {
        var d = data.days[i];
        dayMap[d.day] = d;
      }
    }

    var maxAmount = 0;
    for (var key in dayMap) {
      if (dayMap[key].total_amount > maxAmount) maxAmount = dayMap[key].total_amount;
    }

    var weekdayLabels = t("calendarWeekdays", "Lun Mar Mié Jue Vie Sáb Dom");
    var labels = weekdayLabels.split(" ");
    if (labels.length < 7) labels = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

    var weekdaysContainer = document.querySelector(".cal-weekdays");
    if (weekdaysContainer) {
      weekdaysContainer.innerHTML = labels.map(function (l) {
        return '<div class="cal-weekday">' + l + "</div>";
      }).join("");
    }

    document.getElementById("cal-nav-title").textContent = (new Date(currentYear, currentMonth).toLocaleDateString(getCurrentLang ? getCurrentLang() : "es", { month: "long", year: "numeric" }));

    var sundayOffset = firstDay === 0 ? 6 : firstDay - 1;

    var cells = [];
    for (var i = 0; i < sundayOffset; i++) {
      cells.push('<div class="cal-day other-month"></div>');
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var dayData = dayMap[dateStr];
      var isToday = dateStr === todayStr;
      var amount = dayData ? Number(dayData.total_amount) : 0;
      var movements = dayData ? Number(dayData.total_movements) : 0;
      var rooms = dayData ? Number(dayData.rooms_with_consumption) : 0;
      var colorClass = getColorClass(amount, maxAmount);
      var amountStr = amount > 0 ? formatCOP(amount) : "—";

      cells.push(
        '<div class="cal-day' + (isToday ? " today" : "") + '" data-date="' + dateStr + '">' +
          '<div class="cal-day-number">' + day + '</div>' +
          '<div class="cal-day-amount ' + colorClass + '">' + amountStr + '</div>' +
          (movements > 0 ? '<div class="cal-day-badge">' + movements + ' ' + t("calendarMovements", "Movs") + '</div>' : '') +
        '</div>'
      );
    }

    container.innerHTML = cells.join("");
  };

  var loadCalendar = function () {
    var content = document.getElementById("cal-content");
    var errorDiv = document.getElementById("cal-error");
    if (content) content.classList.add("cal-hidden");
    if (errorDiv) errorDiv.classList.add("cal-hidden");

    var monthStr = currentYear + "-" + String(currentMonth + 1).padStart(2, "0");
    var url = "/api/dashboard/calendar?month=" + monthStr;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Error HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        renderCalendar(data);
        if (content) content.classList.remove("cal-hidden");
        if (window.Loader) Loader.hide();
      })
      .catch(function (err) {
        console.error("Calendar error:", err);
        if (window.Loader) Loader.hide();
        var msgEl = document.getElementById("cal-error-msg");
        if (msgEl) msgEl.textContent = err.message || "Error al cargar los datos del calendario.";
        if (errorDiv) errorDiv.classList.remove("cal-hidden");
        if (content) content.classList.add("cal-hidden");
      });
  };

  var navigateMonth = function (delta) {
    currentMonth += delta;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    if (window.Loader) Loader.show();
    loadCalendar();
  };

  var loadDayDetail = function (dateStr) {
    var body = document.getElementById("cal-modal-body");
    if (!body) return;
    body.innerHTML = '<div class="cal-modal-loading"><i class="ph-light ph-spinner ph-spin"></i><p>' + t("loading", "Cargando...") + "</p></div>";

    var overlay = document.getElementById("cal-modal-overlay");
    if (overlay) overlay.classList.add("open");

    var url = "/api/dashboard/calendar-day?date=" + dateStr;

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Error HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        renderDayDetail(data, dateStr);
      })
      .catch(function (err) {
        console.error("Day detail error:", err);
        body.innerHTML = '<div class="cal-modal-empty"><i class="ph-light ph-warning-circle"></i><p>' + (err.message || "Error") + "</p></div>";
      });
  };

  var renderDayDetail = function (data, dateStr) {
    var body = document.getElementById("cal-modal-body");
    if (!body) return;

    var dateObj = new Date(dateStr + "T12:00:00");
    var titleEl = document.getElementById("cal-modal-title");
    if (titleEl) titleEl.textContent = t("calendarDayDetail", "Detalle del d\u00eda") + " — " + dateObj.toLocaleDateString(getCurrentLang ? getCurrentLang() : "es", { weekday: "long", day: "numeric", month: "long" });

    var items = data.items || [];
    var totalAmount = data.total_amount || 0;
    var totalRooms = data.total_rooms_with_consumption || 0;

    var lang = getCurrentLang ? getCurrentLang() : "es";
    var roomLabel = t("calendarRoom", "Habitaci\u00f3n");
    var productLabel = t("calendarProduct", "Producto");
    var qtyLabel = t("calendarQty", "Cant.");
    var amountLabel = t("calendarAmount", "Valor");
    var totalLabel = t("calendarTotal", "Total");

    var html = '<div class="cal-modal-total"><span>' + totalLabel + '</span><span>' + formatCOP(totalAmount) + '</span></div>';

    if (items.length === 0) {
      html += '<div class="cal-modal-empty"><i class="ph-light ph-calendar-blank"></i><p>' + t("calendarNoData", "Sin datos") + "</p></div>";
      body.innerHTML = html;
      return;
    }

    var roomGroups = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!roomGroups[item.room_number]) {
        roomGroups[item.room_number] = { room_number: item.room_number, total_amount: 0, items: [] };
      }
      roomGroups[item.room_number].total_amount += Number(item.total_price || item.quantity_moved * item.price || 0);
      roomGroups[item.room_number].items.push(item);
    }

    html += '<p style="font-size:13px;color:var(--color-muted);margin:0 0 12px;">' + (totalRooms || Object.keys(roomGroups).length) + " " + t("calendarRooms", "Habitaciones") + "</p>";

    for (var roomNum in roomGroups) {
      var group = roomGroups[roomNum];
      html += '<div class="cal-room-group">' +
        '<div class="cal-room-header"><span>' + roomLabel + " " + group.room_number + '</span><span>' + formatCOP(group.total_amount) + '</span></div>' +
        '<ul class="cal-room-items">';

      for (var j = 0; j < group.items.length; j++) {
        var gi = group.items[j];
        var qty = gi.quantity_moved || gi.quantity || 0;
        var price = gi.product_price || gi.price || 0;
        var prodName = gi.product_name || gi.name || "—";
        var itemTotal = gi.total_price || (qty * price);
        html += '<li class="cal-room-item">' +
          '<span class="item-product">' + prodName + '</span>' +
          '<span class="item-qty">' + qty + '</span>' +
          '<span class="item-amount">' + formatCOP(itemTotal) + '</span>' +
        '</li>';
      }
      html += '</ul></div>';
    }

    body.innerHTML = html;
  };

  var initClickHandlers = function () {
    var container = document.getElementById("cal-days");
    if (!container) return;

    container.addEventListener("click", function (e) {
      var dayEl = e.target.closest(".cal-day");
      if (!dayEl) return;
      if (dayEl.classList.contains("other-month")) return;
      var dateStr = dayEl.getAttribute("data-date");
      if (dateStr) loadDayDetail(dateStr);
    });
  };

  var initModalClose = function () {
    var overlay = document.getElementById("cal-modal-overlay");
    var closeBtn = document.getElementById("cal-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        overlay.classList.remove("open");
      });
    }
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    }
  };

  var initMenuToggle = function () {
    var btn = document.getElementById("menu-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      document.querySelector(".sidebar").classList.toggle("open");
      document.getElementById("sidebar-backdrop").classList.toggle("visible");
    });
    document.getElementById("sidebar-backdrop").addEventListener("click", function () {
      document.querySelector(".sidebar").classList.remove("open");
      this.classList.remove("visible");
    });
  };

  document.addEventListener("DOMContentLoaded", function () {
    var now = new Date();
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();

    initMenuToggle();
    initClickHandlers();
    initModalClose();

    document.getElementById("cal-prev").addEventListener("click", function () { navigateMonth(-1); });
    document.getElementById("cal-next").addEventListener("click", function () { navigateMonth(1); });

    if (window.Loader) Loader.show();
    loadCalendar();
  });
})();
