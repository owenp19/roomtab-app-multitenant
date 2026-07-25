(function () {
  const $ = id => document.getElementById(id);

  let currentData = {};

  function getInitialsFromName(fullName) {
    if (!fullName) return "OP";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  async function loadProfile() {
    try {
      const [profileRes, tenantRes] = await Promise.all([
        fetch("/api/auth/profile", { credentials: "include" }),
        fetch("/api/tenant/config", { credentials: "include" })
      ]);

      if (!profileRes.ok) throw new Error("Error cargando perfil");
      const data = await profileRes.json();
      currentData = data;

      $("profile-name").value = data.fullName || "";
      $("profile-email").value = data.email || "";
      $("profile-phone").value = data.phone || "";

      const initials = getInitialsFromName(data.fullName);
      $("profile-initials").textContent = initials;
      $("profile-display-name").textContent = data.fullName || "—";
      $("profile-display-role").textContent = data.role || "—";

      // Avatar
      const img = $("profile-avatar-img");
      const placeholder = $("profile-avatar-placeholder");
      if (data.avatarUrl) {
        img.src = data.avatarUrl;
        img.classList.add("loaded");
        img.style.display = "block";
        placeholder.style.display = "none";
      } else {
        img.classList.remove("loaded");
        img.style.display = "none";
        placeholder.style.display = "flex";
      }

      // Tenant data
      if (tenantRes.ok) {
        const tenantData = await tenantRes.json();
        $("profile-hotel-name").value = tenantData.name || "";
        $("profile-minibar-name").value = tenantData.brandName || "";
      }

      // Also update sidebar
      const nameEl = $("user-name");
      const initialsEl = $("user-initials");
      if (nameEl) nameEl.textContent = data.fullName || "Operador minibar";
      if (initialsEl) initialsEl.textContent = initials;
    } catch (err) {
      console.error("Error cargando perfil:", err);
      setStatus("Error al cargar el perfil.", "error");
    }
  }

  function setStatus(msg, kind) {
    const el = $("profile-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "profile-status " + (kind || "");
  }

  async function saveProfile() {
    const saveBtn = $("profile-save-btn");
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="ph-light ph-spinner spinning"></i> <span data-i18n="profileSaving">Guardando…</span>';
    saveBtn.disabled = true;
    setStatus("", "");

    const fullName = $("profile-name").value.trim();
    const email = $("profile-email").value.trim();
    const phone = $("profile-phone").value.trim();
    const hotelName = $("profile-hotel-name").value.trim();
    const brandName = $("profile-minibar-name").value.trim();

    const formData = new FormData();
    formData.append("fullName", fullName);
    formData.append("email", email);
    formData.append("phone", phone);

    // Check for photo file
    const fileInput = $("profile-photo-input");
    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append("avatar", fileInput.files[0]);
    }

    try {
      const [profileRes] = await Promise.all([
        fetch("/api/auth/profile", {
          method: "PUT",
          body: formData,
          credentials: "include"
        }).catch(() => ({ ok: false })),
        fetch("/api/tenant/branding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelName, brandName }),
          credentials: "include"
        }).catch(() => ({ ok: false }))
      ]);

      if (!profileRes.ok) {
        const errData = await profileRes.json().catch(() => ({}));
        throw new Error(errData.message || "Error al guardar");
      }

      setStatus("Datos actualizados correctamente.", "success");
      await loadProfile();
    } catch (err) {
      console.error("Error guardando perfil:", err);
      setStatus(err.message || "Error al guardar los datos.", "error");
    } finally {
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
    }
  }

  function handlePhotoClick() {
    $("profile-photo-input").click();
  }

  function handlePhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = $("profile-avatar-img");
      const placeholder = $("profile-avatar-placeholder");
      img.src = ev.target.result;
      img.classList.add("loaded");
      img.style.display = "block";
      placeholder.style.display = "none";
    };
    reader.readAsDataURL(file);

    // Auto-save hint
    setStatus("Foto seleccionada. Guarda los cambios para aplicarla.", "");
  }

  function init() {
    initTheme();
    initLanguage();
    setupThemeSwitcher($("app-theme-switcher"));
    setupLangSelector($("app-lang-selector"));

    loadProfile();

    // Events
    $("profile-save-btn").addEventListener("click", saveProfile);
    $("profile-avatar-overlay").addEventListener("click", handlePhotoClick);
    $("profile-photo-input").addEventListener("change", handlePhotoChange);

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
