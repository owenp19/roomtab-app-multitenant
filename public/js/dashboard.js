(function () {
  var charts = {};
  var currentFilter = "month";
  var dashData = null;

  var formatCOP = function (n) {
    return "$" + Number(n || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  var formatNum = function (n) {
    return Number(n || 0).toLocaleString("es-CO");
  };

  var animateCounter = function (el, target, suffix, duration) {
    suffix = suffix || "";
    duration = duration || 800;
    var start = 0;
    var startTime = null;
    var isCurrency = typeof target === "string" && target.startsWith("$");
    var numTarget = isCurrency ? parseInt(target.replace(/[$,. ]/g, "")) : parseInt(target);
    if (isNaN(numTarget)) {
      el.textContent = target;
      return;
    }
    var step = function (timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(eased * numTarget);
      if (isCurrency) {
        el.textContent = formatCOP(current);
      } else {
        el.textContent = formatNum(current);
      }
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
      }
    };
    requestAnimationFrame(step);
  };

  var kpiIconClass = function (type) {
    var map = {
      "today_amount": "green", "period_amount": "primary", "today_products": "blue",
      "today_loss_amount": "red", "stolen_total": "yellow", "damaged_total": "red",
      "rooms_with_consumption": "green", "rooms_pending": "yellow", "agotados_products": "red",
      "low_stock_rooms": "yellow", "top_floor": "primary", "top_room": "primary",
      "today_movements": "blue", "period_movements": "green", "period_loss_amount": "red",
      "period_loss_records": "red", "stolen_amount": "yellow", "damaged_amount": "red",
      "total_rooms": "blue", "agotados_rooms": "red", "today_loss_records": "red",
      "today_products": "green",
    };
    return map[type] || "primary";
  };

  var kpiIcon = function (type) {
    var map = {
      "today_amount": "ph-coin", "period_amount": "ph-trend-up", "today_products": "ph-shopping-cart",
      "today_loss_amount": "ph-warning-circle", "stolen_total": "ph-package", "damaged_total": "ph-warning",
      "rooms_with_consumption": "ph-bed", "rooms_pending": "ph-clock", "agotados_products": "ph-package",
      "low_stock_rooms": "ph-warning", "top_floor": "ph-buildings", "top_room": "ph-door",
      "today_movements": "ph-activity", "period_movements": "ph-activity", "period_loss_amount": "ph-coin",
      "period_loss_records": "ph-list", "stolen_amount": "ph-coin", "damaged_amount": "ph-coin",
      "total_rooms": "ph-door", "agotados_rooms": "ph-house", "today_loss_records": "ph-list",
      "today_products": "ph-cube",
    };
    return map[type] || "ph-chart-bar";
  };

  var t = function (key, fallback) {
    return (window.translations && translations[getCurrentLang ? getCurrentLang() : "es"] && translations[getCurrentLang ? getCurrentLang() : "es"][key]) || fallback || key;
  };

  var kpiLabel = function (type) {
    var map = {
      "today_amount": t("dashboardToday", "Hoy"),
      "period_amount": t("dashboardPeriodAmount", "Consumo del per\u00edodo"),
      "today_products": t("dashboardProductsToday", "Productos hoy"),
      "today_loss_amount": t("dashboardLossToday", "P\u00e9rdidas hoy"),
      "stolen_total": t("dashboardStolenTotal", "Productos robados"),
      "damaged_total": t("dashboardDamagedTotal", "Productos da\u00f1ados"),
      "rooms_with_consumption": t("dashboardRoomsWithConsumption", "Habitaciones con consumo"),
      "rooms_pending": t("dashboardPendingRooms", "Habitaciones pendientes"),
      "agotados_products": t("dashboardOutOfStock", "Productos agotados"),
      "low_stock_rooms": t("dashboardLowStockRooms", "Habitaciones stock bajo"),
      "top_floor": t("dashboardTopFloor", "Piso mayor consumo"),
      "top_room": t("dashboardTopRoom", "Habitaci\u00f3n mayor consumo"),
      "today_movements": t("dashboardMovementsToday", "Movimientos hoy"),
      "period_movements": t("dashboardPeriodMovements", "Movimientos per\u00edodo"),
      "period_loss_amount": t("dashboardLossPeriod", "P\u00e9rdidas per\u00edodo"),
      "period_loss_records": t("dashboardLossRecords", "Registros p\u00e9rdida"),
      "stolen_amount": t("dashboardStolenAmount", "Valor robado"),
      "damaged_amount": t("dashboardDamagedAmount", "Valor da\u00f1ado"),
      "total_rooms": t("dashboardTotalRooms", "Total habitaciones"),
      "agotados_rooms": t("dashboardOutOfStockRooms", "Habitaciones con agotados"),
      "today_loss_records": t("dashboardLossRecordsToday", "Registros p\u00e9rdida hoy"),
    };
    return map[type] || type;
  };

  var renderKpis = function (kpis) {
    var container = document.getElementById("dash-kpis");
    if (!container) return;

    var lang = getCurrentLang ? getCurrentLang() : "es";
    var items = [
      { key: "today_amount", val: formatCOP(kpis.today_amount), sub: (kpis.today_movements || 0) + " " + (translations && translations[lang] && translations[lang].dashboardMovements ? translations[lang].dashboardMovements : "movements") },
      { key: "period_amount", val: formatCOP(kpis.period_amount), sub: kpis.variance_pct != null ? ((kpis.variance_pct >= 0 ? "+" : "") + kpis.variance_pct + "% " + (translations && translations[lang] && translations[lang].dashboardVsPrev ? translations[lang].dashboardVsPrev : "vs previous period")) : "" },
      { key: "today_products", val: formatNum(kpis.today_products), sub: translations && translations[lang] && translations[lang].dashboardConsumedToday ? translations[lang].dashboardConsumedToday : "consumed today" },
      { key: "rooms_with_consumption", val: formatNum(kpis.rooms_with_consumption), sub: (translations && translations[lang] && translations[lang].dashboardOf ? translations[lang].dashboardOf : "of") + " " + formatNum(kpis.total_rooms) + " " + (translations && translations[lang] && translations[lang].dashboardRooms ? translations[lang].dashboardRooms : "rooms") },
      { key: "rooms_pending", val: formatNum(kpis.rooms_pending), sub: translations && translations[lang] && translations[lang].dashboardPendingReview ? translations[lang].dashboardPendingReview : "pending review" },
      { key: "agotados_products", val: formatNum(kpis.agotados_products), sub: (translations && translations[lang] && translations[lang].dashboardIn ? translations[lang].dashboardIn : "in") + " " + formatNum(kpis.agotados_rooms) + " " + (translations && translations[lang] && translations[lang].dashboardRooms ? translations[lang].dashboardRooms : "rooms") },
      { key: "low_stock_rooms", val: formatNum(kpis.low_stock_rooms), sub: translations && translations[lang] && translations[lang].dashboardLowInventory ? translations[lang].dashboardLowInventory : "with low inventory" },
      { key: "top_floor", val: kpis.top_floor || "—", sub: translations && translations[lang] && translations[lang].dashboardHighestConsumption ? translations[lang].dashboardHighestConsumption : "highest period consumption" },
    ];

    if (kpis.stolen_total > 0 || kpis.damaged_total > 0) {
      items.push({ key: "stolen_total", val: formatNum(kpis.stolen_total), sub: formatCOP(kpis.stolen_amount) });
      items.push({ key: "damaged_total", val: formatNum(kpis.damaged_total), sub: formatCOP(kpis.damaged_amount) });
    }

    var html = items.map(function (item) {
      var iconClass = kpiIconClass(item.key);
      var icon = kpiIcon(item.key);
      var label = kpiLabel(item.key);
      var trendHtml = "";
      if (item.key === "period_amount" && kpis.variance_pct != null) {
        var trendClass = kpis.variance_pct > 0 ? "up" : kpis.variance_pct < 0 ? "down" : "neutral";
        var trendIcon = kpis.variance_pct > 0 ? "ph-trend-up" : kpis.variance_pct < 0 ? "ph-trend-down" : "ph-minus";
        trendHtml = '<span class="dash-kpi-trend ' + trendClass + '"><i class="ph-light ' + trendIcon + '"></i> ' + (kpis.variance_pct >= 0 ? "+" : "") + kpis.variance_pct + '%</span>';
      }
      return '<div class="dash-kpi" data-kpi="' + item.key + '">' +
        '<div class="dash-kpi-top">' +
          '<div class="dash-kpi-icon ' + iconClass + '"><i class="ph-light ' + icon + '"></i></div>' +
          trendHtml +
        '</div>' +
        '<div class="dash-kpi-label">' + label + '</div>' +
        '<div class="dash-kpi-value" id="kpi-val-' + item.key + '">0</div>' +
        '<div class="dash-kpi-sub">' + item.sub + '</div>' +
      '</div>';
    }).join("");

    container.innerHTML = html;

    requestAnimationFrame(function () {
      items.forEach(function (item) {
        var el = document.getElementById("kpi-val-" + item.key);
        if (el) animateCounter(el, item.val, "", 900);
      });
    });
  };

  var initChartFloor = function (data) {
    var ctx = document.getElementById("chart-floor");
    if (!ctx) return;
    if (charts.floor) charts.floor.destroy();

    var colors = ["#0B2E59", "#C89B3C", "#1A4A7A", "#D4AA4A", "#6B8DB5", "#B8862E"];
    charts.floor = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(function (d) { return d.name; }),
        datasets: [{
          label: "Consumo",
          data: data.map(function (d) { return d.total_amount; }),
          backgroundColor: data.map(function (_, i) { return colors[i % colors.length]; }),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return formatCOP(ctx.parsed.y); },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#74796F", font: { size: 10 } } },
          y: {
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              color: "#74796F", font: { size: 10 },
              callback: function (v) { return formatCOP(v); },
            },
          },
        },
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
          delay: function (ctx) { return ctx.dataIndex * 80; },
        },
      },
    });
  };

  var initChartProducts = function (data) {
    var ctx = document.getElementById("chart-products");
    if (!ctx) return;
    if (charts.products) charts.products.destroy();

    var colors = ["#0B2E59", "#C89B3C", "#1A4A7A", "#D4AA4A", "#6B8DB5", "#B8862E", "#A67B2E", "#2C5F8A", "#3D7AB5", "#E0B854"];
    charts.products = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(function (d) { return d.name.length > 18 ? d.name.substring(0, 16) + "…" : d.name; }),
        datasets: [{
          label: "Cantidad",
          data: data.map(function (d) { return d.total_qty; }),
          backgroundColor: data.map(function (_, i) { return colors[i % colors.length]; }),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: function (ctx) {
                var item = data[ctx.dataIndex];
                return "Valor: " + formatCOP(item.total_amount);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              color: "#74796F", font: { size: 10 },
              stepSize: 1,
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#74796F", font: { size: 10 } },
          },
        },
        animation: {
          duration: 1000,
          easing: "easeOutQuart",
          delay: function (ctx) { return ctx.dataIndex * 60; },
        },
      },
    });
  };

  var initChartRooms = function (data) {
    var ctx = document.getElementById("chart-rooms");
    if (!ctx) return;
    if (charts.rooms) charts.rooms.destroy();

    var colors = ["#0B2E59", "#C89B3C", "#1A4A7A", "#D4AA4A", "#6B8DB5"];
    charts.rooms = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(function (d) { return d.room_number; }),
        datasets: [{
          label: "Consumo",
          data: data.map(function (d) { return d.total_amount; }),
          backgroundColor: data.map(function (_, i) { return colors[i % colors.length]; }),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: function (ctx) {
                var item = data[ctx.dataIndex];
                return item.floor_name + " — " + item.total_items + " productos";
              },
              label: function (ctx) { return formatCOP(ctx.parsed.y); },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#74796F", font: { size: 10 } } },
          y: {
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              color: "#74796F", font: { size: 10 },
              callback: function (v) { return formatCOP(v); },
            },
          },
        },
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
          delay: function (ctx) { return ctx.dataIndex * 100; },
        },
      },
    });
  };

  var renderAlerts = function (alerts) {
    var container = document.getElementById("dash-alerts-list");
    if (!container) return;

    if (!alerts || alerts.length === 0) {
      container.innerHTML = '<div class="dash-empty"><i class="ph-light ph-check-circle"></i><p>' + t("dashboardNoAlerts", "No hay alertas activas.") + '</p></div>';
      return;
    }

    container.innerHTML = alerts.map(function (a) {
      return '<div class="dash-alert-item">' +
        '<div class="dash-alert-icon ' + a.type + '"><i class="ph-light ' + a.icon + '"></i></div>' +
        '<div class="dash-alert-text">' + a.message + '</div>' +
      '</div>';
    }).join("");
  };

  var renderRecentMovements = function (movements) {
    var container = document.getElementById("dash-recent-list");
    if (!container) return;

    if (!movements || movements.length === 0) {
      container.innerHTML = '<div class="dash-empty"><i class="ph-light ph-clock"></i><p>' + t("dashboardNoRecentMovements", "No hay movimientos recientes.") + '</p></div>';
      return;
    }

    var typeLabels = {
      consumption: t("movementConsumption", "Consumo"),
      restock: t("movementRestock", "Reposición"),
      perdida: t("movementLoss", "Pérdida"),
      dano: t("movementDamage", "Daño"),
      adjustment: t("movementAdjustment", "Ajuste")
    };
    var typeIcons = { consumption: "ph-shopping-cart", restock: "ph-plus-circle", perdida: "ph-warning", dano: "ph-warning-circle", adjustment: "ph-arrows-clockwise" };

    var limit = Math.min(movements.length, 5);
    var html = '';
    for (var i = 0; i < limit; i++) {
      var m = movements[i];
      var label = typeLabels[m.movement_type] || m.movement_type;
      var icon = typeIcons[m.movement_type] || "ph-circle";
      var time = "";
      try {
        var d = new Date(m.created_at);
        var now = new Date();
        var diff = Math.round((now - d) / 60000);
        if (diff < 1) time = t("now", "Ahora");
        else if (diff < 60) time = diff + " min";
        else if (diff < 1440) time = Math.round(diff / 60) + "h";
        else time = d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
      } catch (e) { time = ""; }
      html += '<div class="dash-recent-item">' +
        '<div class="type-icon ' + m.movement_type + '"><i class="ph-light ' + icon + '"></i></div>' +
        '<div class="dash-recent-info">' +
          '<strong>' + label + '</strong> — ' + m.product_name + ' <span class="dash-recent-time">' + t("dashboardIn", "en") + ' ' + m.room_number + ' (' + m.floor_name + ')</span>' +
        '</div>' +
        '<div class="dash-recent-time">' + time + '</div>' +
      '</div>';
    }
    if (movements.length > 5) {
      html += '<div style="text-align:center;margin-top:10px">' +
        '<a href="/app/movimientos" class="panel-link" style="font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px">' +
          'Ver todos los movimientos <i class="ph-light ph-arrow-right"></i>' +
        '</a>' +
      '</div>';
    }
    container.innerHTML = html;
  };

  var loadDashboard = function (filter) {
    var content = document.getElementById("dash-content");
    var errorDiv = document.getElementById("dash-error");
    if (content) content.classList.add("dash-hidden");
    if (errorDiv) errorDiv.classList.add("dash-hidden");

    var url = "/api/dashboard?filter=" + (filter || "month");

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Error HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        dashData = data;

        renderKpis(data.kpis);
        renderAlerts(data.alerts);
        initChartFloor(data.charts.floor_breakdown);
        initChartProducts(data.charts.top_products);
        initChartRooms(data.charts.top_rooms);
        renderRecentMovements(data.recent_movements);

        if (content) content.classList.remove("dash-hidden");
      })
      .catch(function (err) {
        console.error("Dashboard error:", err);
        var msgEl = document.getElementById("dash-error-msg");
        if (msgEl) msgEl.textContent = err.message || "Error al cargar los datos del dashboard.";
        if (errorDiv) errorDiv.classList.remove("dash-hidden");
        if (content) content.classList.add("dash-hidden");
      });
  };

  var initFilters = function () {
    var container = document.getElementById("dash-filters");
    if (!container) return;

    container.addEventListener("click", function (e) {
      var btn = e.target.closest(".dash-filter-btn");
      if (!btn) return;

      container.querySelectorAll(".dash-filter-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      currentFilter = btn.getAttribute("data-filter");
      loadDashboard(currentFilter);

      var backdrop = document.getElementById("sidebar-backdrop");
      if (backdrop) backdrop.click();
    });
  };

  var initThemeObserver = function () {
    var target = document.getElementById("app-theme-switcher");
    if (!target) return;
    var observer = new MutationObserver(function () {
      Object.keys(charts).forEach(function (key) {
        if (charts[key]) {
          charts[key].destroy();
          delete charts[key];
        }
      });
      if (dashData) {
        initChartFloor(dashData.charts.floor_breakdown);
        initChartProducts(dashData.charts.top_products);
        initChartRooms(dashData.charts.top_rooms);
      }
    });
    observer.observe(target, { attributes: true, childList: true, subtree: true });
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
    initMenuToggle();
    initFilters();
    loadDashboard("month");
    initThemeObserver();
  });
})();
