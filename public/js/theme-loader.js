(function () {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/tenant/config?_t=" + Date.now(), true);
  xhr.onload = function () {
    if (xhr.status !== 200) return;
    try {
      var config = JSON.parse(xhr.responseText);
      var pc = config.primary_color || config.primaryColor || "#0B2E59";
      var sc = config.secondary_color || config.secondaryColor || "#C89B3C";
      var logoUrl = config.logo_url || config.logoUrl || "";
      var brandName = config.brand_name || config.brandName || "";
      var fontFamily = config.font_family || config.fontFamily || "";

      // Determine if this is a public page (landing, login, etc.)
      // Public pages keep RoomTab branding; tenant colors only apply on authenticated app pages
      var publicPages = ["/", "/landing", "/landing.html", "/login", "/login.html",
        "/signup", "/admin-login", "/admin-login.html", "/forgot-password",
        "/forgot-password.html", "/reset-password", "/reset-password.html",
        "/registro", "/registro.html"];
      var path = window.location.pathname;
      var isPublic = publicPages.some(function(p) {
        return path === p || path === p + "/";
      });

      // Skip tenant CSS variable injection on public pages to preserve global RoomTab branding
      if (!isPublic) {
        var pcHover = darkenHex(pc, 12);
        var scHover = darkenHex(sc, 12);
        var pcLight = lightenHex(pc, 30);
        var scLight = lightenHex(sc, 30);
        var pcLight2 = lightenHex(pc, 55);
        var scLight2 = lightenHex(sc, 55);

        // Generate chart colors palette from tenant colors
        var chartColors = [
          pc, sc, pcLight, scLight, darkenHex(pc, 10),
          darkenHex(sc, 10), pcLight2, scLight2, pc, sc
        ];
        var chartCSS = "";
        for (var i = 0; i < chartColors.length; i++) {
          chartCSS += "--chart-color-" + (i + 1) + ": " + chartColors[i] + ";";
        }

        // Remove previous dynamic theme if any (set by settings page after save)
        var old = document.getElementById("dynamic-tenant-theme");
        if (old) old.remove();

        // Inject CSS variable overrides (authenticated pages only)
        var style = document.createElement("style");
        style.textContent =
          ":root {" +
          "--color-primary: " + pc + ";" +
          "--color-primary-hover: " + pcHover + ";" +
          "--color-primary-active: " + darkenHex(pc, 24) + ";" +
          "--color-primary-soft: " + hexToRgba(pc, 0.12) + ";" +
          "--color-primary-light: " + hexToRgba(pc, 0.08) + ";" +
          "--color-secondary: " + sc + ";" +
          "--color-secondary-hover: " + scHover + ";" +
          "--color-secondary-soft: " + hexToRgba(sc, 0.16) + ";" +
          "--color-secondary-soft-landing: " + hexToRgba(sc, 0.12) + ";" +
          "--color-accent: " + sc + ";" +
          "--color-accent-hover: " + scHover + ";" +
          "--color-accent-soft: " + hexToRgba(sc, 0.14) + ";" +
          "--sidebar-bg: " + pc + ";" +
          "--sidebar-gradient: linear-gradient(145deg, " + pc + " 0%, " + darkenHex(pc, 12) + " 40%, " + darkenHex(pc, 24) + " 100%);" +
          "--sidebar-glass: " + hexToRgba("#FFFFFF", 0.06) + ";" +
          "--sidebar-glass-hover: " + hexToRgba("#FFFFFF", 0.10) + ";" +
          "--sidebar-glass-active: " + hexToRgba("#FFFFFF", 0.13) + ";" +
          "--sidebar-glow: 0 0 20px " + hexToRgba(sc, 0.10) + ";" +
          "--sidebar-divider: " + hexToRgba("#FFFFFF", 0.06) + ";" +
          "--sidebar-active-bg: " + sc + ";" +
          "--sidebar-active-border: " + sc + ";" +
          "--login-overlay: " + hexToRgba(pc, 0.88) + ";" +
          "--hero-overlay: linear-gradient(135deg," + hexToRgba(pc, 0.92) + " 0%," + hexToRgba(pc, 0.78) + " 40%," + hexToRgba(pc, 0.55) + " 100%);" +
          "--shadow-xs: 0 2px 8px " + hexToRgba(pc, 0.05) + ";" +
          "--shadow-soft: 0 8px 24px " + hexToRgba(pc, 0.08) + ";" +
          "--shadow-card: 0 14px 34px " + hexToRgba(pc, 0.12) + ";" +
          "--shadow-hover: 0 18px 44px " + hexToRgba(pc, 0.18) + ";" +
          "--shadow-bottom-bar: 0 -4px 20px " + hexToRgba(pc, 0.12) + ";" +
          "--shadow-secondary: " + hexToRgba(sc, 0.35) + ";" +
          "--shadow-secondary-hover: " + hexToRgba(sc, 0.5) + ";" +
          chartCSS +
          "}";
        document.head.appendChild(style);

        // Apply custom font family (authenticated pages only)
        if (fontFamily && fontFamily !== 'Roboto') {
          var fontLink = document.createElement('link');
          fontLink.rel = 'stylesheet';
          fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontFamily).replace(/%20/g, '+') + ':ital,wght@0,100..900;1,100..900&family=Roboto:ital,wght@0,100..900;1,100..900&family=Anton+SC&display=swap';
          document.head.appendChild(fontLink);
          var fontStyle = document.createElement('style');
          fontStyle.textContent = ':root { --font-text: "' + fontFamily + '", Roboto, sans-serif; --font-title: "' + fontFamily + '", Roboto, sans-serif; } body, input, select, textarea, button { font-family: "' + fontFamily + '", Roboto, sans-serif; }';
          document.head.appendChild(fontStyle);
        }

        // Hero background image
        if (config.hero_image_url) {
          document.documentElement.style.setProperty("--hero-image", 'url("' + config.hero_image_url + '")');
        }

        // Replace all logos and brand name with tenant custom values
        function replaceLogos() {
          if (!logoUrl) return;
          var selectors = [
            ".sidebar-logo", ".loader-logo", ".login-brand-logo",
            ".top-bar-logo img", ".footer-brand img"
          ];
          var imgs = document.querySelectorAll(selectors.join(", "));
          for (var i = 0; i < imgs.length; i++) {
            imgs[i].src = logoUrl;
          }
        }

        function updateBrandName() {
          if (!brandName) return;
          var titles = document.querySelectorAll("title");
          for (var i = 0; i < titles.length; i++) {
            var sep = titles[i].textContent.indexOf("–");
            if (sep !== -1) {
              titles[i].textContent = titles[i].textContent.substring(0, sep).trim() + " – " + brandName;
            }
          }
          var brandSpans = document.querySelectorAll(".login-brand-name");
          for (var i = 0; i < brandSpans.length; i++) {
            brandSpans[i].textContent = brandName;
          }
          var brandTexts = document.querySelectorAll(".top-bar-logo span, .footer-brand span");
          for (var i = 0; i < brandTexts.length; i++) {
            brandTexts[i].textContent = brandName;
          }
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            replaceLogos();
            updateBrandName();
          });
        } else {
          replaceLogos();
          updateBrandName();
        }
      }
    } catch (e) {
      // silent fail
    }
  };
  xhr.send();

  function hexToRgba(hex, alpha) {
    if (!hex || hex.length < 7) return "rgba(11,46,89," + alpha + ")";
    var r = parseInt(hex.substring(1, 3), 16);
    var g = parseInt(hex.substring(3, 5), 16);
    var b = parseInt(hex.substring(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "rgba(11,46,89," + alpha + ")";
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function darkenHex(hex, amount) {
    if (!hex || hex.length < 7) return hex;
    var r = Math.max(0, parseInt(hex.substring(1, 3), 16) - amount);
    var g = Math.max(0, parseInt(hex.substring(3, 5), 16) - amount);
    var b = Math.max(0, parseInt(hex.substring(5, 7), 16) - amount);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function lightenHex(hex, amount) {
    if (!hex || hex.length < 7) return hex;
    var r = Math.min(255, parseInt(hex.substring(1, 3), 16) + amount);
    var g = Math.min(255, parseInt(hex.substring(3, 5), 16) + amount);
    var b = Math.min(255, parseInt(hex.substring(5, 7), 16) + amount);
    return "#" + [r, g, b].map(function (c) { return c.toString(16).padStart(2, "0"); }).join("");
  }
})();