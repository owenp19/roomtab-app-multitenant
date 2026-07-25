/* ===================================================
   RoomTab — Theme Management
   =================================================== */

function getCurrentTheme() {
  var oldTheme = localStorage.getItem("minibar-theme");
  if (oldTheme && !localStorage.getItem("roomtab-theme")) {
    localStorage.setItem("roomtab-theme", oldTheme);
    localStorage.removeItem("minibar-theme");
  }
  var chargeitTheme = localStorage.getItem("chargeit-theme");
  if (chargeitTheme && !localStorage.getItem("roomtab-theme")) {
    localStorage.setItem("roomtab-theme", chargeitTheme);
    localStorage.removeItem("chargeit-theme");
  }
  return localStorage.getItem("roomtab-theme") || "light";
}

function setTheme(theme) {
  theme = theme || "light";
  localStorage.setItem("roomtab-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);

  document.querySelectorAll(".theme-switcher-btn, .theme-toggle-btn").forEach((btn) => {
    const btnMode = btn.getAttribute("data-theme-mode");
    if (!btnMode) return;
    const isActive = btnMode === theme;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive);
  });

  document.querySelectorAll(".theme-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.themeValue === theme);
  });

  updateThemeMeta(theme);
  swapLogosForTheme(theme);
}

function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}

function updateThemeMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const color = theme === "dark" ? "#111827" : "#F4F6F8";
    meta.setAttribute("content", color);
  }
}

/* ── Logo swap for dark mode ── */
function swapLogosForTheme(theme) {
  var DARK_LOGO = "/images/roomtab-logo-dark-transparent.png";
  var WHITE_LOGO = "/images/roomtab-logo-white.png";

  document.querySelectorAll(".sidebar-logo").forEach(function(img) {
    if (img.dataset.originalSrc && img.dataset.themeSrc) return;
    img.dataset.originalSrc = img.src;
    if (img.src.indexOf("roomtab-logo-dark-transparent") !== -1) {
      img.dataset.themeSrc = WHITE_LOGO;
    } else if (img.src.indexOf("roomtab-logo-white") !== -1) {
      img.dataset.themeSrc = DARK_LOGO;
    }
    if (theme === "dark" && img.dataset.themeSrc) {
      img.src = img.dataset.themeSrc;
    } else if (img.dataset.originalSrc) {
      img.src = img.dataset.originalSrc;
    }
  });

  document.querySelectorAll(".login-brand-logo").forEach(function(img) {
    if (!img.dataset.darkSrc) {
      if (img.src.indexOf("roomtab-logo-light") !== -1) {
        img.dataset.darkSrc = WHITE_LOGO;
      } else if (img.src.indexOf("roomtab-logo-dark") !== -1) {
        img.dataset.darkSrc = WHITE_LOGO;
      } else if (img.src.indexOf("roomtab-logo-white") !== -1) {
        img.dataset.darkSrc = DARK_LOGO;
      } else {
        img.dataset.darkSrc = WHITE_LOGO;
      }
      img.dataset.originalSrc = img.src;
    }
    img.src = (theme === "dark") ? img.dataset.darkSrc : img.dataset.originalSrc;
  });
}

function initTheme() {
  const savedTheme = getCurrentTheme();
  setTheme(savedTheme);
}

function setupThemeSwitcher(container) {
  if (!container) return;
  const btns = container.querySelectorAll(".theme-switcher-btn, .theme-toggle-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-theme-mode");
      setTheme(mode);
    });
  });

  const toggleBtn = container.querySelector(".theme-switcher-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleTheme);
  }
}

/* ── Auto-switch theme by time ── */
function getAutoTheme() {
  if (!localStorage.getItem("roomtab-autoswitch")) return null;
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 19) ? "light" : "dark";
}

function applyAutoTheme() {
  const auto = getAutoTheme();
  if (auto) setTheme(auto);
}

function toggleAutoSwitch(enable) {
  if (enable) {
    localStorage.setItem("roomtab-theme-manual", getCurrentTheme());
    localStorage.setItem("roomtab-autoswitch", "1");
    applyAutoTheme();
  } else {
    localStorage.removeItem("roomtab-autoswitch");
    var manual = localStorage.getItem("roomtab-theme-manual");
    if (manual) {
      localStorage.removeItem("roomtab-theme-manual");
      setTheme(manual);
    }
  }
}

function isAutoSwitchEnabled() {
  return !!localStorage.getItem("roomtab-autoswitch");
}

setInterval(applyAutoTheme, 60000);

/* ── Font-size controls ── */
function getFontSize() {
  return localStorage.getItem("roomtab-font-size") || "medium";
}

function setFontSize(size) {
  if (!["small", "medium", "large"].includes(size)) size = "medium";
  localStorage.setItem("roomtab-font-size", size);
  document.documentElement.setAttribute("data-font-size", size);

  document.querySelectorAll(".font-size-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.fontSize === size);
  });
}

function initFontSize() {
  const saved = getFontSize();
  setFontSize(saved);
}
