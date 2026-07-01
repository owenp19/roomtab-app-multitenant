var express = require("express");
var { getDbPool } = require("../config/db");

var router = express.Router();

var currencyLabels = {
  COP: { symbol: "$", label: "COP/mes" },
  USD: { symbol: "US$", label: "USD/mo" },
  MXN: { symbol: "MX$", label: "MXN/mes" }
};

// Approximate exchange rates (base: COP)
var exchangeRates = { COP: 1, USD: 0.00024, MXN: 0.0048 };

router.get("/", async function (req, res, next) {
  try {
    // Detect tenant currency
    var tenantCurrency = 'COP';
    var tenantId = null;
    if (req.tenantId) tenantId = req.tenantId;
    if (!tenantId && req.session && req.session.user && req.session.user.tenantId) tenantId = req.session.user.tenantId;
    if (tenantId) {
      var [tRows] = await getDbPool().query("SELECT currency FROM tenants WHERE id = ?", [tenantId]);
      if (tRows && tRows[0] && tRows[0].currency) tenantCurrency = tRows[0].currency;
    }

    var [rows] = await getDbPool().query(
      "SELECT id, name, slug, description, max_rooms, max_users, max_floors, max_products, max_brands, price_monthly, features, active FROM plans WHERE active = 1 ORDER BY price_monthly ASC"
    );

    var rate = exchangeRates[tenantCurrency] || 1;
    var labels = currencyLabels[tenantCurrency] || currencyLabels.COP;

    var plans = rows.map(function (p) {
      var features = {};
      try { features = JSON.parse(p.features || "{}"); } catch (e) {}
      var priceInCurrency = Math.round(p.price_monthly * rate * 100) / 100;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        maxRooms: p.max_rooms,
        maxUsers: p.max_users,
        maxFloors: p.max_floors,
        maxProducts: p.max_products,
        maxBrands: p.max_brands,
        priceMonthly: p.price_monthly,
        priceInCurrency: priceInCurrency,
        currency: tenantCurrency,
        currencySymbol: labels.symbol,
        priceLabel: labels.symbol + priceInCurrency.toFixed(2) + " " + labels.label,
        features: features
      };
    });
    res.json(plans);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
