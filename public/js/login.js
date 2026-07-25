/* ===================================================
   RoomTab — Login Logic
   =================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initLanguage();
  setupThemeSwitcher(document.getElementById("login-theme-switcher"));
  setupLangSelector(document.getElementById("login-lang-selector"));

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const emailStatus = document.getElementById("email-status");
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("password-toggle");
  const loginStatus = document.getElementById("login-status");

  function setStatus(message, type) {
    if (!loginStatus) return;
    loginStatus.textContent = message || "";
    loginStatus.className = "login-status" + (type ? " " + type : "");
  }

  // Password toggle
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", () => {
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      const icon = passwordToggle.querySelector("i");
      if (icon) {
        icon.className = isHidden ? "ph-light ph-eye" : "ph-light ph-eye-slash";
      }
    });
  }

  // Email validation indicator
  if (emailInput && emailStatus) {
    emailInput.addEventListener("input", () => {
      const value = emailInput.value.trim();
      const valid = value.includes("@") && value.includes(".");
      emailStatus.style.opacity = valid ? "1" : "0";
    });
  }

  // Form submit
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");
      Loader.show();

      try {
        const formData = new FormData(form);
        const body = new URLSearchParams(formData);

        const loginUrl = window.location.protocol + "//" + window.location.host + "/api/auth/login";
        const response = await fetch(loginUrl, {
          method: "POST",
          body
        });

        if (response.redirected) {
          window.location.href = response.url;
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          Loader.hide();
          const lang = getCurrentLang();
          setStatus(text || (lang === "en" ? "Error signing in. Try again." : "Error al iniciar sesión. Inténtalo de nuevo."), "error");
          return;
        }

        Loader.hide();
        window.location.href = "/app";
      } catch (error) {
        console.error("Error en login:", error);
        Loader.hide();
        const lang = getCurrentLang();
        setStatus(lang === "en" ? "An error occurred while signing in. Check your connection." : "Ocurrió un error al iniciar sesión. Verifica tu conexión.", "error");
      }
    });
  }

});
