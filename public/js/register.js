/* ===================================================
   RoomTab — Registration Logic
   =================================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (typeof initTheme === "function") initTheme();
  if (typeof initLanguage === "function") initLanguage();
  if (typeof setupThemeSwitcher === "function") setupThemeSwitcher(document.getElementById("register-theme-switcher"));
  if (typeof setupLangSelector === "function") setupLangSelector(document.getElementById("register-lang-selector"));

  const form = document.getElementById("register-form");
  const emailInput = document.getElementById("email");
  const emailStatus = document.getElementById("email-status");
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("password-toggle");
  const confirmInput = document.getElementById("confirm-password");
  const registerStatus = document.getElementById("register-status");
  const submitBtn = document.getElementById("register-submit");

  function setStatus(message, type) {
    if (!registerStatus) return;
    registerStatus.textContent = message || "";
    registerStatus.className = "login-status" + (type ? " " + type : "");
  }

  function validateForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    let valid = true;

    if (!email.includes("@") || !email.includes(".")) valid = false;
    if (password.length < 6) valid = false;
    if (password !== confirm) valid = false;

    submitBtn.disabled = !valid;
    return valid;
  }

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

  if (emailInput && emailStatus) {
    emailInput.addEventListener("input", () => {
      const value = emailInput.value.trim();
      const valid = value.includes("@") && value.includes(".");
      emailStatus.style.opacity = valid ? "1" : "0";
      validateForm();
    });
  }

  if (passwordInput) passwordInput.addEventListener("input", validateForm);
  if (confirmInput) confirmInput.addEventListener("input", validateForm);

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("", "");
      window.Preloader.show("Creando tu cuenta…");

      const password = passwordInput.value;
      const confirm = confirmInput.value;

      if (password !== confirm) {
        window.Preloader.hide();
        setStatus("Las contraseñas no coinciden.", "error");
        return;
      }

      if (password.length < 6) {
        window.Preloader.hide();
        setStatus("La contraseña debe tener al menos 6 caracteres.", "error");
        return;
      }

      try {
        const formData = new FormData(form);
        const body = new URLSearchParams(formData);

        const response = await fetch("/api/auth/register", {
          method: "POST",
          body
        });

        if (response.redirected) {
          window.location.href = response.url;
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          window.Preloader.hide();
          setStatus(text || "Error al crear la cuenta. Inténtalo de nuevo.", "error");
          return;
        }

        window.Preloader.hide();
        setStatus("Cuenta creada con éxito. Redirigiendo…", "success");
        setTimeout(() => {
          window.location.href = "/app";
        }, 1500);
      } catch (error) {
        console.error("Error en registro:", error);
        window.Preloader.hide();
        setStatus("Ocurrió un error. Verifica tu conexión.", "error");
      }
    });
  }

  window.Preloader.hide();
});
