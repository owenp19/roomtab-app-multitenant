const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const tenantRepository = require("../repositories/tenantRepository");
const planEnforcer = require("../middleware/planEnforcer");
const { getDbPool } = require("../config/db");

const router = express.Router();

// Multer for tenant branding uploads
const tenantUploadDir = path.join(__dirname, "..", "..", "public", "uploads", "tenants");
if (!fs.existsSync(tenantUploadDir)) { fs.mkdirSync(tenantUploadDir, { recursive: true }); }
const tenantStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, tenantUploadDir); },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname).toLowerCase();
    cb(null, "tenant_" + Date.now() + "_" + Math.round(Math.random() * 1000) + ext);
  }
});
const tenantUpload = multer({
  storage: tenantStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    var allowed = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
    var ext = path.extname(file.originalname).toLowerCase();
    if (allowed.indexOf(ext) >= 0) return cb(null, true);
    cb(new Error("Formato no permitido. Usa JPG, PNG, WebP o SVG."));
  }
});

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Debes iniciar sesión" });
}

function getTenantId(req) {
  var tid = req.tenantId;
  if (!tid && req.session && req.session.user && req.session.user.tenantId) tid = req.session.user.tenantId;
  return tid || 1;
}

// GET /api/tenant/config — public theme config
router.get("/config", async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var config = await tenantRepository.getTenantConfig(tenantId);
    if (!config) return res.status(404).json({ error: "Tenant not found" });
    // Return both camelCase and snake_case for compatibility
    res.json({
      id: config.id,
      name: config.name,
      slug: config.slug,
      brand_name: config.brandName,
      brandName: config.brandName,
      primary_color: config.primaryColor,
      primaryColor: config.primaryColor,
      secondary_color: config.secondaryColor,
      secondaryColor: config.secondaryColor,
      logo_url: config.logoUrl,
      logoUrl: config.logoUrl,
      hero_image_url: config.heroImageUrl,
      heroImageUrl: config.heroImageUrl,
      font_family: config.fontFamily || null,
      fontFamily: config.fontFamily || null,
      offline_mode: config.offlineMode,
      offlineMode: config.offlineMode,
      default_min_stock: config.defaultMinStock,
      defaultMinStock: config.defaultMinStock,
    });
  } catch (err) { next(err); }
});

// GET /api/tenant/plan — current tenant's plan + usage
router.get("/plan", async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var limits = await planEnforcer.getPlanLimits(tenantId);
    var pool = getDbPool();

    var [[{ roomCount }]] = await pool.query("SELECT COUNT(*) AS roomCount FROM rooms WHERE tenant_id = ?", [tenantId]);
    var [[{ userCount }]] = await pool.query("SELECT COUNT(*) AS userCount FROM users WHERE tenant_id = ?", [tenantId]);
    var [[{ floorCount }]] = await pool.query("SELECT COUNT(*) AS floorCount FROM floors WHERE tenant_id = ?", [tenantId]);
    var [[{ productCount }]] = await pool.query("SELECT COUNT(*) AS productCount FROM minibar_products WHERE tenant_id = ? AND is_active = 1", [tenantId]);

    var [subRows] = await pool.query("SELECT id, status, current_period_start, current_period_end, billing_day FROM tenant_subscriptions WHERE tenant_id = ?", [tenantId]);

    res.json({
      plan: limits,
      usage: { rooms: roomCount, users: userCount, floors: floorCount, products: productCount },
      subscription: subRows && subRows.length > 0 ? subRows[0] : null
    });
  } catch (err) { next(err); }
});

// ============ SELF-SERVICE BRANDING (require login) ============

// PUT /api/tenant/branding — update brand name, hotel name & colors
router.put("/branding", requireLogin, async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var { hotelName, brandName, primaryColor, secondaryColor, fontFamily } = req.body;
    await getDbPool().query(
      "UPDATE tenants SET name = COALESCE(NULLIF(?, ''), name), brand_name = COALESCE(NULLIF(?, ''), brand_name), primary_color = ?, secondary_color = ?, font_family = ? WHERE id = ?",
      [hotelName || null, brandName || null, primaryColor || "#0B2E59", secondaryColor || "#C89B3C", fontFamily || null, tenantId]
    );
    res.json({ success: true, message: "Datos actualizados" });
  } catch (err) { next(err); }
});

// POST /api/tenant/branding/logo — upload logo
router.post("/branding/logo", requireLogin, tenantUpload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });
    var imageUrl = "/uploads/tenants/" + req.file.filename;
    var tenantId = getTenantId(req);
    var [oldRows] = await getDbPool().query("SELECT logo_url FROM tenants WHERE id = ?", [tenantId]);
    if (oldRows && oldRows[0] && oldRows[0].logo_url) {
      var oldPath = path.join(__dirname, "..", "..", "public", oldRows[0].logo_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await getDbPool().query("UPDATE tenants SET logo_url = ? WHERE id = ?", [imageUrl, tenantId]);
    res.json({ success: true, imageUrl: imageUrl });
  } catch (err) { next(err); }
});

// POST /api/tenant/branding/hero — upload hero image
router.post("/branding/hero", requireLogin, tenantUpload.single("hero"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });
    var imageUrl = "/uploads/tenants/" + req.file.filename;
    var tenantId = getTenantId(req);
    var [oldRows] = await getDbPool().query("SELECT hero_image_url FROM tenants WHERE id = ?", [tenantId]);
    if (oldRows && oldRows[0] && oldRows[0].hero_image_url) {
      var oldPath = path.join(__dirname, "..", "..", "public", oldRows[0].hero_image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await getDbPool().query("UPDATE tenants SET hero_image_url = ? WHERE id = ?", [imageUrl, tenantId]);
    res.json({ success: true, imageUrl: imageUrl });
  } catch (err) { next(err); }
});

// ============ PLAN UPGRADE / DOWNGRADE ============

// POST /api/tenant/change-plan — upgrade or downgrade with proration
router.post("/change-plan", requireLogin, async function (req, res, next) {
  try {
    var tenantId = getTenantId(req);
    var { planSlug } = req.body;
    if (!planSlug) return res.status(400).json({ error: "planSlug requerido" });

    var pool = getDbPool();

    // Get current subscription and plan
    var [subRows] = await pool.query(
      "SELECT s.id, s.plan_id, s.status, s.current_period_start, s.current_period_end, p.price_monthly AS current_price FROM tenant_subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.tenant_id = ? LIMIT 1",
      [tenantId]
    );
    if (!subRows || subRows.length === 0) return res.status(404).json({ error: "No hay suscripción activa" });

    if (subRows[0].status === 'past_due' || subRows[0].status === 'canceled') {
      return res.status(400).json({ error: "No se puede cambiar el plan con estado " + subRows[0].status + ". Renueva primero." });
    }

    // Get target plan
    var [planRows] = await pool.query("SELECT id, name, slug, price_monthly FROM plans WHERE slug = ? AND active = 1 LIMIT 1", [planSlug]);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: "Plan no encontrado" });

    var newPlan = planRows[0];
    var currentPlanId = subRows[0].plan_id;

    // If same plan, no-op
    if (currentPlanId === newPlan.id) {
      return res.json({ success: true, message: "Ya estás en este plan", noChange: true });
    }

    var currentPrice = Number(subRows[0].current_price);
    var newPrice = Number(newPlan.price_monthly);
    var now = new Date();
    var periodStart = new Date(subRows[0].current_period_start);
    var periodEnd = new Date(subRows[0].current_period_end);
    var daysTotal = Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    var daysRemaining = Math.max(0, Math.round((periodEnd - now) / (1000 * 60 * 60 * 24)));
    var prorationFactor = daysTotal > 0 ? (daysRemaining / daysTotal) : 0;

    // Calculate credit/due
    var creditForCurrent = currentPrice * prorationFactor;
    var costForNew = newPrice * prorationFactor;

    var tenantCurrency = 'COP';
    var [tenantRows] = await pool.query("SELECT currency FROM tenants WHERE id = ?", [tenantId]);
    if (tenantRows && tenantRows[0] && tenantRows[0].currency) tenantCurrency = tenantRows[0].currency;

    var adjustmentAmount;
    var adjustmentType; // 'credit' or 'charge'

    if (newPrice > currentPrice) {
      // Upgrade: charge the difference (prorated)
      adjustmentAmount = Math.max(0, costForNew - creditForCurrent);
      adjustmentType = 'charge';
    } else {
      // Downgrade: give credit
      adjustmentAmount = Math.max(0, creditForCurrent - costForNew);
      adjustmentType = 'credit';
    }

    // Update subscription
    await pool.query(
      "UPDATE tenant_subscriptions SET plan_id = ?, status = 'active' WHERE tenant_id = ?",
      [newPlan.id, tenantId]
    );

    // Create adjustment invoice if there's a charge
    if (adjustmentAmount > 0 && adjustmentType === 'charge') {
      var fmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
      await pool.query(
        "INSERT INTO billing_invoices (tenant_id, subscription_id, amount, currency, status, period_start, period_end, due_date) VALUES (?, (SELECT id FROM tenant_subscriptions WHERE tenant_id = ?), ?, ?, 'pending', ?, ?, ?)",
        [tenantId, tenantId, adjustmentAmount, tenantCurrency, fmt(now), fmt(periodEnd), fmt(now)]
      );
    }

    res.json({
      success: true,
      message: "Plan cambiado a " + newPlan.name,
      plan: { name: newPlan.name, slug: newPlan.slug },
      adjustment: adjustmentAmount > 0 ? { type: adjustmentType, amount: adjustmentAmount, currency: tenantCurrency } : null
    });
  } catch (err) { next(err); }
});

// ============ MULTI-CURRENCY ============

// GET /api/tenant/currency — get tenant's currency
router.get("/currency", requireLogin, async function (req, res, next) {
  try {
    var tenantId = getTenantId(req);
    var [rows] = await getDbPool().query("SELECT currency FROM tenants WHERE id = ?", [tenantId]);
    var currency = (rows && rows[0] && rows[0].currency) ? rows[0].currency : 'COP';
    res.json({ currency: currency });
  } catch (err) { next(err); }
});

// PUT /api/tenant/currency — set tenant's currency
router.put("/currency", requireLogin, async function (req, res, next) {
  try {
    var tenantId = getTenantId(req);
    var { currency } = req.body;
    var validCurrencies = ['COP', 'USD', 'MXN'];
    if (!currency || validCurrencies.indexOf(currency.toUpperCase()) === -1) {
      return res.status(400).json({ error: "Moneda no soportada. Usa: " + validCurrencies.join(", ") });
    }
    await getDbPool().query("UPDATE tenants SET currency = ? WHERE id = ?", [currency.toUpperCase(), tenantId]);
    res.json({ success: true, currency: currency.toUpperCase() });
  } catch (err) { next(err); }
});

// ============ OFFLINE MODE ============

// GET /api/tenant/offline-mode — check offline mode status
router.get("/offline-mode", async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var [rows] = await getDbPool().query("SELECT offline_mode FROM tenants WHERE id = ?", [tenantId]);
    var enabled = rows && rows[0] ? !!rows[0].offline_mode : false;
    res.json({ offline_mode: enabled });
  } catch (err) { next(err); }
});

// PUT /api/tenant/offline-mode — toggle offline mode (require login)
router.put("/offline-mode", requireLogin, async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var { enabled } = req.body;
    await getDbPool().query("UPDATE tenants SET offline_mode = ? WHERE id = ?", [enabled ? 1 : 0, tenantId]);
    res.json({ success: true, offline_mode: !!enabled });
  } catch (err) { next(err); }
});

// ============ STOCK CONFIG ============

// GET /api/tenant/stock-config — get default_min_stock
router.get("/stock-config", async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var [rows] = await getDbPool().query("SELECT default_min_stock FROM tenants WHERE id = ?", [tenantId]);
    var defaultMinStock = (rows && rows[0]) ? rows[0].default_min_stock : 1;
    res.json({ default_min_stock: defaultMinStock });
  } catch (err) { next(err); }
});

// PUT /api/tenant/stock-config — update default_min_stock (require login)
router.put("/stock-config", requireLogin, async (req, res, next) => {
  try {
    var tenantId = getTenantId(req);
    var { defaultMinStock } = req.body;
    if (defaultMinStock == null || Number(defaultMinStock) < 0) {
      return res.status(400).json({ error: "default_min_stock inválido" });
    }
    await getDbPool().query("UPDATE tenants SET default_min_stock = ? WHERE id = ?", [Number(defaultMinStock), tenantId]);
    res.json({ success: true, default_min_stock: Number(defaultMinStock) });
  } catch (err) { next(err); }
});

module.exports = router;
