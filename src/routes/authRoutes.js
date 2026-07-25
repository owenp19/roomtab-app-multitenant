const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getDbPool } = require("../config/db");
const { logAudit, getClientIp, getDeviceInfo } = require("../auditLogger");

const router = express.Router();

// Multer config for profile photos
const uploadsDir = path.join(__dirname, "..", "..", "public", "uploads", "avatars");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".jpg";
    const name = "avatar_" + req.session.user.id + "_" + Date.now() + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error("Solo imágenes JPG, PNG, GIF o WebP"));
  }
});

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "No autenticado" });
  }
  next();
}

router.post("/register", async (req, res, next) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).send("Todos los campos son obligatorios.");
    }

    if (password.length < 6) {
      return res.status(400).send("La contraseña debe tener al menos 6 caracteres.");
    }

    if (password !== confirmPassword) {
      return res.status(400).send("Las contraseñas no coinciden.");
    }

    const pool = getDbPool();

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing && existing.length > 0) {
      return res.status(409).send("El correo ya está registrado.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    var tid = req.tenantId;

    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, role, is_active, tenant_id) VALUES (?, ?, ?, 'operator', 1, ?)",
      [fullName, email, passwordHash, tid]
    );

    req.session.user = {
      id: result.insertId,
      email,
      fullName,
      role: "operator",
      tenantId: tid
    };

    logAudit({
      userId: result.insertId,
      userName: fullName,
      userRole: "operator",
      moduleName: "Autenticación",
      actionType: "login",
      actionDescription: "Registro de nuevo usuario",
      newData: { email, fullName, role: "operator" },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    return res.redirect("/app");
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).send("Correo y contraseña son obligatorios.");
    }

    var pool = getDbPool();
    var [rows] = await pool.query(
      "SELECT id, full_name, email, password_hash, role, is_active, tenant_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).send("Credenciales inválidas.");
    }

    var user = rows[0];

    if (!user.is_active) {
      return res.status(403).send("Usuario inactivo. Contacta al administrador.");
    }

    var isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).send("Credenciales inválidas.");
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id || req.tenantId
    };

    if (remember) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7;
    }

    logAudit({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      moduleName: "Autenticación",
      actionType: "login",
      actionDescription: "Inicio de sesión exitoso",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    if (user.role === "super_admin") {
      return res.redirect("/admin");
    }
    return res.redirect("/app");
  } catch (err) {
    return next(err);
  }
});

router.get("/me", requireLogin, async (req, res, next) => {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      "SELECT id, full_name, email, phone, avatar_url, role FROM users WHERE id = ? LIMIT 1",
      [req.session.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const user = rows[0];
    res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone || "",
      avatarUrl: user.avatar_url || "",
      role: user.role
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/profile — get current user profile with photo
router.get("/profile", requireLogin, async (req, res, next) => {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      "SELECT id, full_name, email, phone, avatar_url, role FROM users WHERE id = ? LIMIT 1",
      [req.session.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const user = rows[0];
    res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone || "",
      avatarUrl: user.avatar_url || "",
      role: user.role
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile — update profile (name, email, phone) with optional photo
router.put("/profile", requireLogin, upload.single("avatar"), async (req, res, next) => {
  try {
    const pool = getDbPool();
    const { fullName, email, phone } = req.body;

    const updates = [];
    const params = [];

    if (fullName && fullName.trim()) {
      updates.push("full_name = ?");
      params.push(fullName.trim());
      req.session.user.fullName = fullName.trim();
    }

    if (email && email.trim()) {
      // Check uniqueness
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1",
        [email.trim(), req.session.user.id]
      );
      if (existing && existing.length > 0) {
        return res.status(409).json({ message: "El correo ya está en uso por otro usuario." });
      }
      updates.push("email = ?");
      params.push(email.trim());
      req.session.user.email = email.trim();
    }

    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone || null);
    }

    // Handle avatar upload
    if (req.file) {
      const avatarUrl = "/uploads/avatars/" + req.file.filename;

      // Delete old avatar if exists
      const [oldRows] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [req.session.user.id]);
      if (oldRows && oldRows.length > 0 && oldRows[0].avatar_url) {
        const oldPath = path.join(__dirname, "..", "..", "public", oldRows[0].avatar_url);
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }

      updates.push("avatar_url = ?");
      params.push(avatarUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No hay datos para actualizar." });
    }

    params.push(req.session.user.id);
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const user = req.session.user;

    if (req.file) {
      logAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        moduleName: "Perfil",
        actionType: "profile_photo_changed",
        actionDescription: "Cambió su foto de perfil",
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });
    }

    if (fullName || email || phone) {
      logAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        moduleName: "Perfil",
        actionType: "profile_updated",
        actionDescription: "Actualizó su información de perfil",
        newData: { fullName: fullName?.trim(), email: email?.trim(), phone: phone || undefined },
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });
    }

    res.json({ message: "Perfil actualizado correctamente." });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  const user = req.session.user;
  req.session.destroy(() => {
    if (user) {
      logAudit({
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        moduleName: "Autenticación",
        actionType: "logout",
        actionDescription: "Cierre de sesión",
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

// ── Forgot / Reset Password ──
const crypto = require("crypto");

async function ensureResetTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT(10) UNSIGNED NOT NULL,
      token VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_token (token),
      INDEX idx_user_id (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "El correo es obligatorio." });
    }

    const pool = getDbPool();
    await ensureResetTable(pool);

    const [rows] = await pool.query("SELECT id, full_name FROM users WHERE email = ? LIMIT 1", [email]);

    // Always return success to avoid email enumeration
    if (!rows || rows.length === 0) {
      return res.json({ message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña." });
    }

    const user = rows[0];

    // Invalidate old tokens
    await pool.query(
      "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
      [user.id]
    );

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
      [user.id, token, expiresAt]
    );

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password/${token}`;
    if (process.env.NODE_ENV !== "production") {
      console.log(`[RESET PASSWORD] Link para ${user.email}: ${resetLink}`);
    }

    logAudit({
      userId: user.id,
      userName: user.full_name,
      userRole: "operator",
      moduleName: "Autenticación",
      actionType: "password_reset_requested",
      actionDescription: "Solicitó restablecimiento de contraseña",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
    });

    res.json({
      message: "Enlace de restablecimiento generado. Revisa tu correo electrónico.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/reset-password/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const pool = getDbPool();
    await ensureResetTable(pool);

    const [rows] = await pool.query(
      "SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token = ? AND used = 0 LIMIT 1",
      [token]
    );

    if (!rows || rows.length === 0) {
      return res.redirect("/reset-password?expired=1");
    }

    const record = rows[0];
    if (new Date() > new Date(record.expires_at)) {
      return res.redirect("/reset-password?expired=1");
    }

    res.redirect("/reset-password?token=" + token);
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token y contraseña son obligatorios." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Las contraseñas no coinciden." });
    }

    const pool = getDbPool();
    await ensureResetTable(pool);

    const [rows] = await pool.query(
      "SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token = ? AND used = 0 LIMIT 1",
      [token]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: "El enlace no es válido o ya fue utilizado." });
    }

    const record = rows[0];
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ message: "El enlace ha expirado. Solicita uno nuevo." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, record.user_id]);
    await pool.query("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [record.id]);

    const [userRows] = await pool.query("SELECT full_name, email, role FROM users WHERE id = ?", [record.user_id]);
    const user = userRows[0];

    logAudit({
      userId: record.user_id,
      userName: user.full_name,
      userRole: user.role,
      moduleName: "Autenticación",
      actionType: "password_reset_completed",
      actionDescription: "Contraseña restablecida exitosamente",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
    });

    res.json({ message: "Contraseña actualizada correctamente. Ahora puedes iniciar sesión." });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/signup-tenant — self-service hotel registration
router.post("/signup-tenant", async (req, res, next) => {
  try {
    var { hotelName, slug, adminName, adminEmail, adminPassword, confirmPassword, planSlug, paymentReference } = req.body;

    if (!hotelName || !slug || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }
    if (adminPassword.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    if (adminPassword !== confirmPassword) {
      return res.status(400).json({ error: "Las contraseñas no coinciden." });
    }

    var pool = getDbPool();

    var [existingSlug] = await pool.query("SELECT id FROM tenants WHERE slug = ?", [slug.trim().toLowerCase()]);
    if (existingSlug && existingSlug.length > 0) {
      return res.status(409).json({ error: "El slug ya está en uso. Prueba con otro nombre corto." });
    }

    var [existingEmail] = await pool.query("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (existingEmail && existingEmail.length > 0) {
      return res.status(409).json({ error: "El correo ya está registrado." });
    }

    // Verify payment for paid plans
    var planSlugFinal = planSlug || 'starter';
    var [planRows] = await pool.query("SELECT id, price_monthly FROM plans WHERE slug = ? LIMIT 1", [planSlugFinal]);
    var planPrice = (planRows && planRows[0]) ? Number(planRows[0].price_monthly) : 0;
    var isPaidPlan = planPrice > 0;

    if (isPaidPlan && paymentReference) {
      // Check if payment was already processed (via webhook)
      var [paidInvoices] = await pool.query(
        "SELECT id FROM billing_invoices WHERE (id = ? OR id = ?) AND status = 'paid'",
        [Number(paymentReference) || 0, isNaN(Number(paymentReference)) ? 0 : Number(paymentReference)]
      );

      if (!paidInvoices || paidInvoices.length === 0) {
        // Payment not yet confirmed by webhook — verify with gateway directly
        var paymentVerified = false;

        // Try to verify with Wompi (most common for Colombia)
        var wompiKey = process.env.WOMPI_PUBLIC_KEY;
        if (wompiKey && paymentReference && paymentReference.length > 10) {
          try {
            var https = require("https");
            var base = process.env.WOMPI_ENV === "production"
              ? "https://production.wompi.co/v1"
              : "https://sandbox.wompi.co/v1";
            var result = await new Promise(function (resolve, reject) {
              var parsed = new URL(base + "/transactions?reference=" + encodeURIComponent(paymentReference));
              var opts = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "GET",
                headers: { "Authorization": "Bearer " + process.env.WOMPI_PRIVATE_KEY }
              };
              var r = https.request(opts, function (res) {
                var d = "";
                res.on("data", function (c) { d += c; });
                res.on("end", function () { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
              });
              r.on("error", reject);
              r.end();
            });
            if (result.data && result.data.length > 0) {
              var tx = result.data[0];
              if (tx.status === "APPROVED") {
                paymentVerified = true;
              }
            }
          } catch (e) {
            console.warn("[Signup] Wompi verification error:", e.message);
          }
        }

        if (!paymentVerified) {
          return res.status(402).json({ error: "El pago no ha sido confirmado. Espera unos segundos e intenta de nuevo, o contacta a soporte." });
        }
      }
    }

    // Create tenant
    var [tenantResult] = await pool.query(
      "INSERT INTO tenants (name, slug, brand_name, active) VALUES (?, ?, ?, 1)",
      [hotelName.trim(), slug.trim().toLowerCase(), hotelName.trim()]
    );
    var tenantId = tenantResult.insertId;

    // Assign plan
    if (planRows && planRows.length > 0) {
      var today = new Date();
      var endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      var fmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

      // Trial: 14 days for paid plans without immediate payment
      var subStatus = (isPaidPlan && !paymentReference) ? 'trialing' : 'active';
      var trialEnd = (isPaidPlan && !paymentReference) ? new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

      await pool.query(
        "INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end, billing_day, trial_ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tenantId, planRows[0].id, subStatus, fmt(today), fmt(endOfMonth), today.getDate(), trialEnd ? fmt(trialEnd) : null]
      );

      // If paid plan with payment, create invoice as paid
      if (planPrice > 0 && paymentReference) {
        var invFmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
        var dueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        await pool.query(
          "INSERT INTO billing_invoices (tenant_id, subscription_id, amount, currency, status, period_start, period_end, due_date, paid_at) VALUES (?, (SELECT id FROM tenant_subscriptions WHERE tenant_id = ?), ?, 'COP', 'paid', ?, ?, ?, NOW())",
          [tenantId, tenantId, planPrice, invFmt(today), invFmt(endOfMonth), invFmt(dueDate)]
        );
      }
    }

    // Create admin user
    var hash = await bcrypt.hash(adminPassword, 10);
    var [userResult] = await pool.query(
      "INSERT INTO users (full_name, email, password_hash, role, is_active, tenant_id) VALUES (?, ?, ?, 'admin', 1, ?)",
      [adminName.trim(), adminEmail, hash, tenantId]
    );

    // Auto-login
    req.session.user = {
      id: userResult.insertId,
      email: adminEmail,
      fullName: adminName.trim(),
      role: "admin",
      tenantId: tenantId
    };

    logAudit({
      userId: userResult.insertId,
      userName: adminName.trim(),
      userRole: "admin",
      moduleName: "Registro",
      actionType: "tenant_created",
      actionDescription: "Registro auto-servicio del hotel " + hotelName + " (plan: " + planSlugFinal + ")",
      newData: { hotelName, slug, tenantId, planSlug: planSlugFinal, paymentReference },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, redirect: "/app" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/change-password — change password (requires current password)
router.put("/change-password", requireLogin, async (req, res, next) => {
  try {
    var { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Las contraseñas nuevas no coinciden." });
    }
    var userId = req.session.user.id;
    var pool = getDbPool();
    var [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
    if (!rows || !rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    var isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "La contraseña actual no es correcta." });
    }
    var newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, userId]);
    logAudit({
      userId: userId,
      userName: req.session.user.fullName || req.session.user.name || "",
      userRole: req.session.user.role || "",
      moduleName: "Perfil",
      actionType: "password_changed",
      actionDescription: "Cambio de contraseña",
      newData: {},
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });
    res.json({ success: true, message: "Contraseña actualizada correctamente." });
  } catch (err) { next(err); }
});

module.exports = router;
