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

  // ── Chart helper functions ──
  function cssVar(name, fallback) {
    if (typeof getComputedStyle === "undefined") return fallback || "";
    var val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback || "";
  }
  function hexToRgba(hex, alpha) {
    if (!hex || hex.length < 7) return "rgba(11,46,89," + alpha + ")";
    var r = parseInt(hex.substring(1, 3), 16);
    var g = parseInt(hex.substring(3, 5), 16);
    var b = parseInt(hex.substring(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(11,46,89," + alpha + ")";
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  function getChartColors() {
    var colors = [];
    for (var i = 1; i <= 10; i++) {
      var c = cssVar("--chart-color-" + i);
      if (c) colors.push(c);
    }
    if (colors.length === 0) {
      colors = [cssVar("--color-primary", "#2d6a4f"), cssVar("--color-secondary", "#c89b3c"), "#4a9e6e", "#d4af37", "#1b4332", "#a67c00", "#74a989", "#dfc166", "#40916c", "#b8860b"];
    }
    return colors;
  }
  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--color-card", "#FFFFFF"),
          titleColor: cssVar("--color-heading", "#222B38"),
          bodyColor: cssVar("--color-text", "#222B38"),
          borderColor: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"),
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: { color: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"), drawBorder: false },
          ticks: { color: cssVar("--color-muted", "#6B7280"), font: { size: 10, family: cssVar("--font-text", "Roboto") }, maxTicksLimit: 8, maxRotation: 0 },
        },
        y: {
          grid: { color: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"), drawBorder: false },
          ticks: { color: cssVar("--color-muted", "#6B7280"), font: { size: 10, family: cssVar("--font-text", "Roboto") }, maxTicksLimit: 6 },
        },
      },
    };
  }
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

  var cssVar = function (name, fallback) {
    var val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback || "";
  };

  var hexToRgba = function (hex, alpha) {
    if (!hex || hex.length < 7) return "rgba(11,46,89," + alpha + ")";
    var r = parseInt(hex.substring(1, 3), 16);
    var g = parseInt(hex.substring(3, 5), 16);
    var b = parseInt(hex.substring(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(11,46,89," + alpha + ")";
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  };

  var getChartColors = function () {
    var colors = [];
    for (var i = 1; i <= 10; i++) {
      var c = cssVar("--chart-color-" + i);
      if (c) colors.push(c);
    }
    if (colors.length === 0) colors = ["#0B2E59", "#C89B3C", "#1A4A7A", "#D4AA4A", "#2C5F8A", "#B8862E"];
    return colors;
  };

  var chartGradient = function (ctx, area, color, vertical) {
    if (!ctx || !area) return color;
    var g = vertical !== false
      ? ctx.createLinearGradient(0, area.bottom, 0, area.top)
      : ctx.createLinearGradient(area.left, 0, area.right, 0);
    g.addColorStop(0, hexToRgba(color, 0.05));
    g.addColorStop(0.3, hexToRgba(color, 0.25));
    g.addColorStop(1, hexToRgba(color, 0.8));
    return g;
  };

  var chartDefaults = function () {
    var muted = cssVar("--color-muted", "#6B7280");
    var grid = cssVar("--color-border-soft", "rgba(217,224,230,0.85)");
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--color-card", "#FFFFFF"),
          titleColor: cssVar("--color-heading", "#222B38"),
          bodyColor: cssVar("--color-text", "#222B38"),
          borderColor: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"),
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          boxPadding: 6,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: muted, font: { size: 10, family: cssVar("--font-text", "Roboto") } },
        },
        y: {
          grid: { color: grid, drawBorder: false },
          ticks: { color: muted, font: { size: 10, family: cssVar("--font-text", "Roboto") } },
        },
      },
    };
  };

  // ── 1. Trend Line (daily consumption) ──
  var initChartTrend = function (data) {
    var ctx = document.getElementById("chart-trend");
    if (!ctx) return;
    if (charts.trend) charts.trend.destroy();

    var color = getChartColors()[0];

    charts.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map(function (d) { return d.day ? d.day.slice(5) : ""; }),
        datasets: [{
          label: "Consumo",
          data: data.map(function (d) { return Number(d.total_amount); }),
          borderColor: color,
          backgroundColor: function (context) {
            if (!context.chart.chartArea) return hexToRgba(color, 0.1);
            var g = context.chart.ctx.createLinearGradient(0, context.chart.chartArea.top, 0, context.chart.chartArea.bottom);
            g.addColorStop(0, hexToRgba(color, 0.3));
            g.addColorStop(1, hexToRgba(color, 0.01));
            return g;
          },
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: color,
          pointBorderColor: cssVar("--color-card", "#fff"),
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }],
      },
      options: Object.assign({}, chartDefaults(), {
        scales: Object.assign({}, chartDefaults().scales, {
          y: Object.assign({}, chartDefaults().scales.y, {
            beginAtZero: true,
            ticks: Object.assign({}, chartDefaults().scales.y.ticks, {
              callback: function (v) { return formatCOP(v); },
              maxTicksLimit: 6,
            }),
          }),
        }),
        animation: {
          duration: 1200,
          easing: "easeOutQuart",
        },
        plugins: Object.assign({}, chartDefaults().plugins, {
          tooltip: Object.assign({}, chartDefaults().plugins.tooltip, {
            callbacks: {
              title: function (items) { return items.length ? "Día " + items[0].label : ""; },
              label: function (ctx) { return "Consumo: " + formatCOP(ctx.parsed.y); },
            },
          }),
        }),
      }),
    });
  };

  // ── 2. Category breakdown (doughnut) ──
  var initChartCategory = function (data) {
    var ctx = document.getElementById("chart-category");
    if (!ctx) return;
    if (charts.category) charts.category.destroy();

    var colors = getChartColors();

    charts.category = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map(function (d) { return d.name; }),
        datasets: [{
          data: data.map(function (d) { return Number(d.total_amount); }),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: cssVar("--color-card", "#fff"),
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: cssVar("--color-muted", "#6B7280"),
              font: { size: 10, family: cssVar("--font-text", "Roboto") },
              padding: 12,
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 3,
            },
          },
          tooltip: {
            backgroundColor: cssVar("--color-card", "#FFFFFF"),
            titleColor: cssVar("--color-heading", "#222B38"),
            bodyColor: cssVar("--color-text", "#222B38"),
            borderColor: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"),
            borderWidth: 1,
            cornerRadius: 12,
            padding: 12,
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ctx.label + ": " + formatCOP(ctx.parsed) + " (" + pct + "%)";
              },
            },
          },
        },
        animation: {
          duration: 1000,
          easing: "easeOutQuart",
          animateRotate: true,
        },
      },
    });
  };

  // ── 3. Top products (horizontal bar) ──
  var initChartProducts = function (data) {
    var ctx = document.getElementById("chart-products");
    if (!ctx) return;
    if (charts.products) charts.products.destroy();

    var colors = getChartColors();

    charts.products = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(function (d) { return d.name.length > 18 ? d.name.substring(0, 16) + "…" : d.name; }),
        datasets: [{
          label: "Cantidad",
          data: data.map(function (d) { return d.total_qty; }),
          backgroundColor: function (context) {
            if (!context.chart.chartArea) return colors[context.dataIndex % colors.length];
            return chartGradient(context.chart.ctx, context.chart.chartArea, colors[context.dataIndex % colors.length], false);
          },
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: Object.assign({}, chartDefaults(), {
        indexAxis: "y",
        scales: Object.assign({}, chartDefaults().scales, {
          x: Object.assign({}, chartDefaults().scales.x, {
            grid: { color: cssVar("--color-border-soft", "rgba(217,224,230,0.85)"), drawBorder: false },
            ticks: Object.assign({}, chartDefaults().scales.x.ticks, {
              stepSize: 1,
            }),
          }),
          y: Object.assign({}, chartDefaults().scales.y, {
            grid: { display: false },
          }),
        }),
        animation: {
          duration: 800,
          easing: "easeOutQuart",
          delay: function (ctx) { return ctx.dataIndex * 60; },
        },
      }),
    });
  };

  // ── Alerts renderer ──
  var renderAlerts = function (alerts) {
    var container = document.getElementById("dash-alerts-list");
    if (!container) return;
    if (!alerts || alerts.length === 0) {
      container.innerHTML = '<div class="dash-kpi-sub" style="padding:12px;text-align:center;">' + t("dashboardNoAlerts", "No hay alertas activas.") + '</div>';
      return;
    }
    var html = alerts.map(function (a) {
      var typeClass = a.type || "normal";
      return '<div class="dash-alert-item"><div class="dash-alert-icon ' + typeClass + '"><i class="ph-light ' + (a.icon || "ph-bell") + '"></i></div><div class="dash-alert-text">' + a.message + '</div></div>';
    }).join("");
    container.innerHTML = html;
  };

  // ── Recent movements renderer ──
  var renderRecentMovements = function (movements) {
    var container = document.getElementById("dash-recent-list");
    if (!container) return;
    if (!movements || movements.length === 0) {
      container.innerHTML = '<div class="dash-kpi-sub" style="padding:12px;text-align:center;">' + t("dashboardNoRecentMovements", "No hay movimientos recientes.") + '</div>';
      return;
    }
    var lang = getCurrentLang ? getCurrentLang() : "es";
    var typeLabels = {
      consumption: translations && translations[lang] ? (translations[lang].movementConsumption || "Consumo") : "Consumo",
      restock: translations && translations[lang] ? (translations[lang].movementRestock || "Reposici\u00f3n") : "Reposici\u00f3n",
      perdida: translations && translations[lang] ? (translations[lang].movementLoss || "P\u00e9rdida") : "P\u00e9rdida",
      dano: translations && translations[lang] ? (translations[lang].movementDamage || "Da\u00f1o") : "Da\u00f1o",
      adjustment: translations && translations[lang] ? (translations[lang].movementAdjustment || "Ajuste") : "Ajuste",
    };
    var typeIcons = { consumption: "ph-wine", restock: "ph-arrows-clockwise", perdida: "ph-warning-circle", dano: "ph-warning", adjustment: "ph-sliders" };
    var html = movements.slice(0, 8).map(function (m) {
      var mt = m.movement_type || "consumption";
      var label = typeLabels[mt] || mt;
      var icon = typeIcons[mt] || "ph-wine";
      var time = m.created_at ? new Date(m.created_at).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
      return '<div class="dash-recent-item">' +
        '<div class="type-icon ' + mt + '"><i class="ph-light ' + icon + '"></i></div>' +
        '<div class="dash-recent-info"><strong>' + (m.product_name || "") + '</strong> &middot; ' + label + ' &middot; ' + (m.room_number || "") + '</div>' +
        '<div class="dash-recent-time">' + time + '</div>' +
      '</div>';
    }).join("");
    container.innerHTML = html;
  };

  // ── 7. Revenue summary (horizontal bar) ──
  var initChartRevenue = function (kpis) {
    var ctx = document.getElementById("chart-revenue");
    if (!ctx) return;
    if (charts.revenue) charts.revenue.destroy();

    var colors = getChartColors();
    var periodAmount = Number(kpis.period_amount) || 0;
    var filter = currentFilter || "month";
    var daysInPeriod = filter === "today" ? 1 : filter === "week" ? 7 : 30;
    var avgDaily = daysInPeriod > 0 ? Math.round(periodAmount / daysInPeriod) : 0;
    var projected = avgDaily * 30;

    charts.revenue = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [t("dashboardRevenueToday", "Hoy"), t("dashboardRevenueAvg", "Promedio diario"), t("dashboardRevenueProjected", "Proyectado mes")],
        datasets: [{
          data: [Number(kpis.today_amount) || 0, avgDaily, projected],
          backgroundColor: [colors[0], colors[1], colors[2]],
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: Object.assign({}, chartDefaults(), {
        indexAxis: "y",
        scales: Object.assign({}, chartDefaults().scales, {
          x: Object.assign({}, chartDefaults().scales.x, {
            beginAtZero: true,
            ticks: Object.assign({}, chartDefaults().scales.x.ticks, {
              callback: function (v) { return formatCOP(v); },
              maxTicksLimit: 5,
            }),
          }),
          y: Object.assign({}, chartDefaults().scales.y, {
            grid: { display: false },
          }),
        }),
        plugins: Object.assign({}, chartDefaults().plugins, {
          tooltip: Object.assign({}, chartDefaults().plugins.tooltip, {
            callbacks: {
              label: function (ctx) { return formatCOP(ctx.parsed.x); },
            },
          }),
        }),
        animation: { duration: 800, easing: "easeOutQuart" },
      }),
    });
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
        initChartTrend(data.charts.daily_consumption);
        initChartCategory(data.charts.category_breakdown);
        initChartProducts(data.charts.top_products);
        initChartRevenue(data.kpis);
        renderAlerts(data.alerts);
        renderRecentMovements(data.recent_movements);

        if (content) content.classList.remove("dash-hidden");
        if (window.Loader) Loader.hide();
      })
      .catch(function (err) {
        console.error("Dashboard error:", err);
        if (window.Loader) Loader.hide();
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
        initChartTrend(dashData.charts.daily_consumption);
        initChartCategory(dashData.charts.category_breakdown);
        initChartProducts(dashData.charts.top_products);
        initChartRevenue(dashData.kpis);
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
