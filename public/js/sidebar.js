(function () {
  var links = [
    { href: "/app/panel-de-control", icon: "ph-chart-pie", label: "Panel de Control", active: "panel-de-control", i18n: "navDashboard" },
    { href: "/app/minibar", icon: "ph-wine", label: "Minibares", active: "minibar", i18n: "navMinibars" },
    { href: "/app/revision-rapida", icon: "ph-lightning", label: "Revisi\u00f3n r\u00e1pida", active: "revision-rapida", i18n: "navQuickReview" },
    { href: "/app/admin", icon: "ph-shield-check", label: "Admin", active: "admin", i18n: "navAdmin" },
    { href: "/unlock.html", icon: "ph-key", label: "Desbloqueo", active: "unlock", i18n: "navUnlock" },
    { href: "/app/perdidas", icon: "ph-chart-bar", label: "P\u00e9rdidas", active: "perdidas", i18n: "navPerdidas" },
    { href: "/app/reportes", icon: "ph-file-text", label: "Reportes", active: "reportes", i18n: "navReportes" },
    { href: "/app/auditoria", icon: "ph-clipboard-text", label: "Auditor\u00eda", active: "auditoria", i18n: "navAudit" },
    { href: "/app/calendario", icon: "ph-calendar-blank", label: "Calendario", active: "calendario", i18n: "navCalendar" },
    { href: "/app/notificaciones", icon: "ph-bell", label: "Notificaciones", active: "notificaciones", i18n: "navNotifications" }
  ];

  var path = window.location.pathname;
  function getActive(item) {
    if (item.href === "/unlock.html" && path === "/unlock.html") return "nav-item-active";
    return path.indexOf(item.href) !== -1 ? "nav-item-active" : "";
  }

  function buildNav(items) {
    var html = "";
    items.forEach(function (item) {
      var cls = "nav-item " + getActive(item);
      var aria = path.indexOf(item.href) !== -1 ? ' aria-current="page"' : "";
      html += '<a href="' + item.href + '" class="' + cls.trim() + '"' + aria + '>' +
        '<i class="ph-light ' + item.icon + ' nav-icon"></i>' +
        '<span class="nav-label" data-i18n="' + item.i18n + '">' + item.label + '</span>' +
        '</a>';
    });
    return html;
  }

  var notifActive = getActive(links[9]);
  var notifAria = path.indexOf("/app/notificaciones") !== -1 ? ' aria-current="page"' : "";
  var notifHtml = '<a href="/app/notificaciones" class="nav-item ' + notifActive.trim() + '"' + notifAria + ' id="nav-notifications">' +
    '<i class="ph-light ph-bell nav-icon"></i>' +
    '<span class="nav-label" data-i18n="navNotifications">Notificaciones</span>' +
    '<span class="nav-badge" id="notif-badge" style="display:none;"></span>' +
    '<span class="nav-alert-dot" id="smart-alert-dot" style="display:none;" title="Alertas cr\u00edticas"></span>' +
    '</a>' +
    '<div id="offline-sync-indicator" class="nav-item" style="display:none;cursor:default;font-size:12px;color:var(--color-muted);padding:6px 12px;">' +
    '<i class="ph-light ph-cloud-arrow-up nav-icon" style="color:#f59e0b"></i>' +
    '<span class="nav-label" id="offline-sync-label">Offline</span>' +
    '</div>';

  var html = '<aside class="sidebar" aria-label="Navegaci\u00f3n principal">' +
    '<div class="sidebar-top">' +
    '<div class="sidebar-logo-block">' +
    '<img loading="lazy" src="/images/roomtab-logo-dark-transparent.png" alt="RoomTab" class="sidebar-logo" />' +
    '</div>' +
    '<nav class="sidebar-nav">' +
    buildNav(links.slice(0, 9)) +
    notifHtml +
    '</nav>' +
    '<div class="sidebar-credit">' +
    '<span data-i18n="footerVersion">v1.0.1</span><br>' +
    '<span data-i18n="footerDeveloped">Desarrollado por Owen Pusey — Sistema de Gestión de Minibar</span>' +
    '</div>' +
    '</div>' +
    '</aside>';

  var sidebarStyle = '<style>' +
    '.nav-alert-dot{display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;margin-left:4px;vertical-align:middle;animation:pulse-dot 2s infinite;position:relative;top:-1px}' +
    '@keyframes pulse-dot{0%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}100%{opacity:1;transform:scale(1)}}' +
    '</style>';

  var existing = document.querySelector(".sidebar");
  if (existing) {
    existing.outerHTML = html + sidebarStyle;
  } else {
    var appShell = document.querySelector(".app-shell");
    if (appShell) {
      appShell.insertAdjacentHTML("afterbegin", html + sidebarStyle);
    }
  }

  // Smart alerts
  fetch("/api/dashboard/smart-alerts").then(function (r) {
    if (!r.ok) return;
    return r.json();
  }).then(function (d) {
    if (d && d.summary && d.summary.critical_count > 0) {
      var dot = document.getElementById("smart-alert-dot");
      if (dot) dot.style.display = "inline-block";
    }
  }).catch(function () {});

  // Offline sync indicator
  function updateOfflineIndicator(count) {
    var indicator = document.getElementById("offline-sync-indicator");
    var label = document.getElementById("offline-sync-label");
    if (!indicator) return;
    fetch("/api/tenant/config", { credentials: "include" }).then(function (r) {
      return r.json();
    }).then(function (cfg) {
      if (cfg && cfg.offlineMode) {
        indicator.style.display = "";
        label.textContent = count > 0 ? "Offline (" + count + " pend.)" : "Offline OK";
        indicator.style.color = count > 0 ? "#f59e0b" : "#22c55e";
      } else {
        indicator.style.display = "none";
      }
    }).catch(function () {});
  }

  if (typeof BroadcastChannel !== 'undefined') {
    var bc = new BroadcastChannel('roomtab_sync');
    bc.onmessage = function (e) {
      if (e.data && e.data.type === 'SYNC_BADGE') {
        updateOfflineIndicator(e.data.count || 0);
      }
    };
  }

  setTimeout(function () { updateOfflineIndicator(0); }, 2000);
})();
