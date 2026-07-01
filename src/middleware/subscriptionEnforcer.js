var { getDbPool } = require("../config/db");

var warned = {};

async function enforceSubscription(req, res, next) {
  // Skip for non-API routes and public endpoints
  if (!req.path || !req.path.startsWith("/api/") || req.path === "/api/health" || req.path === "/api/payment/webhook") {
    return next();
  }

  // Skip for auth routes (login, signup, etc.)
  if (req.path.startsWith("/api/auth/")) return next();

  // Skip for public plan listing
  if (req.path.startsWith("/api/plans")) return next();

  // Skip payment status
  if (req.path.startsWith("/api/payment/status") || req.path.startsWith("/api/payment/webhook")) return next();

  var tenantId = req.tenantId;
  if (!tenantId && req.session && req.session.user && req.session.user.tenantId) {
    tenantId = req.session.user.tenantId;
  }
  if (!tenantId) return next();

  try {
    var [rows] = await getDbPool().query(
      "SELECT s.status, s.current_period_end, s.trial_ends_at, p.price_monthly FROM tenant_subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.tenant_id = ? LIMIT 1",
      [tenantId]
    );

    if (!rows || rows.length === 0) return next();

    var sub = rows[0];
    var now = new Date();
    var periodEnd = new Date(sub.current_period_end);
    var trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;

    // Check trial
    if (trialEnd && now > trialEnd && sub.price_monthly > 0) {
      // Trial expired, mark as past_due if not already
      if (sub.status === "active" || sub.status === "trialing") {
        await getDbPool().query(
          "UPDATE tenant_subscriptions SET status = 'past_due' WHERE tenant_id = ? AND (status = 'active' OR status = 'trialing')",
          [tenantId]
        );
      }
    }

    // Check period end
    if (now > periodEnd && sub.price_monthly > 0) {
      if (sub.status === "active" || sub.status === "trialing") {
        await getDbPool().query(
          "UPDATE tenant_subscriptions SET status = 'past_due' WHERE tenant_id = ? AND (status = 'active' OR status = 'trialing')",
          [tenantId]
        );
      }

      // Block non-GET requests if past due for more than 7 days
      var daysOverdue = Math.floor((now - periodEnd) / (1000 * 60 * 60 * 24));
      if (daysOverdue > 7 && req.method !== "GET") {
        if (!warned[tenantId]) {
          warned[tenantId] = true;
          console.log("[Subscription] Tenant " + tenantId + " blocked: " + daysOverdue + " days overdue");
        }
        return res.status(403).json({
          error: "Suscripción vencida. Renueva tu plan para seguir usando el sistema.",
          code: "SUBSCRIPTION_EXPIRED"
        });
      }
    }
  } catch (err) {
    console.error("[SubscriptionEnforcer] Error:", err.message);
  }

  next();
}

module.exports = { enforceSubscription };
