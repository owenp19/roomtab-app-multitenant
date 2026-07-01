var express = require("express");
var { getDbPool } = require("../config/db");
var { logAudit, getClientIp, getDeviceInfo } = require("../auditLogger");
var crypto = require("crypto");

var router = express.Router();
var webhookRouter = express.Router();

// ── Gateway state ──
var stripe = null;
var mpClient = null;
var mpPreference = null;
var mpPayment = null;
var GATEWAYS = { stripe: false, mercadopago: false, wompi: false };

function initGateways() {
  // Stripe
  var stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    try {
      stripe = require("stripe")(stripeKey);
      GATEWAYS.stripe = true;
      console.log("[Payments] Stripe enabled");
    } catch (e) { console.warn("[Payments] Stripe package missing"); }
  }

  // MercadoPago (SDK v3)
  var mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (mpToken) {
    try {
      var { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
      mpClient = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
      mpPreference = new Preference(mpClient);
      mpPayment = new Payment(mpClient);
      GATEWAYS.mercadopago = true;
      console.log("[Payments] MercadoPago enabled");
    } catch (e) { console.warn("[Payments] MercadoPago package missing:", e.message); }
  }

  // Wompi
  if (process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_PRIVATE_KEY) {
    GATEWAYS.wompi = true;
    console.log("[Payments] Wompi enabled");
  }
}

initGateways();

// ── Helpers ──
function getTenantId(req) {
  var tid = req.tenantId;
  if (!tid && req.session && req.session.user && req.session.user.tenantId) tid = req.session.user.tenantId;
  return tid || 1;
}

function wompiApi(path, method, body) {
  var base = process.env.WOMPI_ENV === "production"
    ? "https://production.wompi.co/v1"
    : "https://sandbox.wompi.co/v1";
  var url = base + path;
  return new Promise(function (resolve, reject) {
    var https = require("https");
    var parsed = new URL(url);
    var opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method || "GET",
      headers: {
        "Authorization": "Bearer " + process.env.WOMPI_PRIVATE_KEY,
        "Content-Type": "application/json"
      }
    };
    var reqH = https.request(opts, function (resH) {
      var data = "";
      resH.on("data", function (chunk) { data += chunk; });
      resH.on("end", function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid Wompi response: " + data)); }
      });
    });
    reqH.on("error", reject);
    if (body) reqH.write(JSON.stringify(body));
    reqH.end();
  });
}

function wompiIntegritySignature(reference, amountInCents, currency) {
  var secret = process.env.WOMPI_PRIVATE_KEY;
  return crypto.createHmac("sha256", secret)
    .update(reference + amountInCents + currency)
    .digest("hex");
}

// ── GET /api/payment/status ──
router.get("/status", function (req, res) {
  res.json({
    gateways: {
      stripe: GATEWAYS.stripe,
      mercadopago: GATEWAYS.mercadopago,
      wompi: GATEWAYS.wompi
    },
    mode: process.env.STRIPE_MODE || process.env.MERCADOPAGO_MODE || process.env.WOMPI_ENV || "test"
  });
});

// ── GET /api/payment/invoices — current tenant's invoices ──
router.get("/invoices", async function (req, res, next) {
  try {
    var tenantId = getTenantId(req);
    var [rows] = await getDbPool().query(
      "SELECT id, amount, currency, status, period_start, period_end, due_date, paid_at, created_at FROM billing_invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50",
      [tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/payment/checkout — unified multi-gateway checkout ──
router.post("/checkout", async function (req, res, next) {
  try {
    var { planSlug, planPrice, invoiceId, hotelName, adminName, adminEmail, gateway, currency } = req.body;
    var tenantId = getTenantId(req);
    var APP_URL = process.env.APP_URL || "http://localhost:" + (process.env.PORT || 3000);
    var useGateway = gateway || "mercadopago";
    var curr = (currency || "COP").toUpperCase();

    // ── Resolve amount and context ──
    var amount = 0;
    var isSignup = !invoiceId;
    var reference = "ref-" + Date.now() + "-" + (tenantId || Math.random().toString(36).slice(2, 8));

    if (invoiceId) {
      var [rows] = await getDbPool().query(
        "SELECT id, amount, currency, status FROM billing_invoices WHERE id = ? AND tenant_id = ?",
        [invoiceId, tenantId]
      );
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Factura no encontrada" });
      if (rows[0].status === "paid") return res.status(400).json({ error: "Esta factura ya fue pagada" });
      amount = Number(rows[0].amount);
      curr = rows[0].currency || curr;
      reference = "inv-" + invoiceId;
    } else if (planPrice) {
      amount = Number(planPrice);
    } else {
      return res.status(400).json({ error: "Se requiere invoiceId o planPrice" });
    }

    // ── Wompi ──
    if (useGateway === "wompi") {
      if (!GATEWAYS.wompi) return res.status(503).json({ error: "Wompi no está configurado" });

      var amountInCents = Math.round(amount * 100);
      var wompiRef = reference + "-" + Date.now();
      var integrity = wompiIntegritySignature(wompiRef, amountInCents, curr);

      var customer = {};
      if (adminEmail) customer.email = adminEmail;
      if (adminName) customer.full_name = adminName;

      var txData = {
        amount_in_cents: amountInCents,
        currency: curr,
        reference: wompiRef,
        customer: customer,
        redirect_url: APP_URL + (isSignup ? "/signup?payment=success" : "/settings?payment=success"),
        payment_source_id: null,
        payment_method: null
      };

      try {
        var result = await wompiApi("/transactions", "POST", txData);
        if (result.data && result.data.id) {
          return res.json({
            gateway: "wompi",
            url: result.data.redirect_url || (result.data.payment_method && result.data.payment_method.extra && result.data.payment_method.extra.external_url),
            payment_id: result.data.id,
            reference: wompiRef,
            integrity: integrity
          });
        }
        return res.status(500).json({ error: "Error creando transacción en Wompi", details: result });
      } catch (err) {
        console.error("[Wompi] Error creating transaction:", err);
        return res.status(500).json({ error: "Error al crear transacción en Wompi" });
      }
    }

    // ── MercadoPago ──
    if (useGateway === "mercadopago") {
      if (!GATEWAYS.mercadopago) return res.status(503).json({ error: "MercadoPago no está configurado" });

      var title = isSignup
        ? "Plan " + (planSlug || "") + " — " + (hotelName || "Registro")
        : "Suscripción";
      var desc = isSignup
        ? "Registro de " + (adminName || "") + " (" + (adminEmail || "") + ")"
        : "Período de facturación";

      var preferenceData = {
        body: {
          items: [{
            id: isSignup ? "PLAN-" + planSlug : "INV-" + invoiceId,
            title: title,
            description: desc,
            quantity: 1,
            currency_id: curr,
            unit_price: amount
          }],
          external_reference: reference,
          back_urls: {
            success: APP_URL + (isSignup ? "/signup?payment=success" : "/settings?payment=success"),
            failure: APP_URL + (isSignup ? "/signup?payment=failure" : "/settings?payment=failure"),
            pending: APP_URL + (isSignup ? "/signup?payment=pending" : "/settings?payment=pending")
          },
          auto_return: "approved",
          notification_url: APP_URL + "/api/payment/webhook"
        }
      };

      var mpResponse = await mpPreference.create(preferenceData);
      return res.json({
        gateway: "mercadopago",
        url: mpResponse.body.init_point,
        payment_id: mpResponse.body.id,
        reference: reference
      });
    }

    // ── Stripe ──
    if (useGateway === "stripe") {
      if (!GATEWAYS.stripe) return res.status(503).json({ error: "Stripe no está configurado" });

      var sessionData = {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: curr.toLowerCase(),
            product_data: {
              name: isSignup ? "Plan " + (planSlug || "") : "Suscripción",
              description: isSignup
                ? "Registro de " + (adminName || "") + " (" + (adminEmail || "") + ")"
                : "Factura #" + invoiceId
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: isSignup
          ? { planSlug: planSlug || "", hotelName: hotelName || "", adminEmail: adminEmail || "" }
          : { invoiceId: String(invoiceId), tenantId: String(tenantId) },
        success_url: APP_URL + (isSignup ? "/signup?payment=success" : "/settings?payment=success"),
        cancel_url: APP_URL + (isSignup ? "/signup?payment=failure" : "/settings?payment=cancelled")
      };

      var session = await stripe.checkout.sessions.create(sessionData);
      return res.json({
        gateway: "stripe",
        url: session.url,
        payment_id: session.id,
        reference: reference
      });
    }

    return res.status(400).json({ error: "Pasarela no soportada: " + useGateway });
  } catch (err) { next(err); }
});

// ── POST /api/payment/webhook — Stripe, MercadoPago & Wompi ──
webhookRouter.post("/", express.raw({ type: function () { return true; } }), async function (req, res) {
  var sig = req.headers["stripe-signature"];
  var contentType = req.headers["content-type"] || "";

  // ── Stripe ──
  if (sig && GATEWAYS.stripe) {
    var endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    var event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("[Stripe] Webhook signature failed:", err.message);
      return res.status(400).send("Webhook Error: " + err.message);
    }

    if (event.type === "checkout.session.completed") {
      await handleStripeCompleted(event.data.object);
    }
    return res.json({ received: true });
  }

  // ── MercadoPago ──
  if (GATEWAYS.mercadopago && (contentType.includes("application/json") || contentType.includes("application/x-www-form-urlencoded"))) {
    var mpWebhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (mpWebhookSecret) {
      var mpHeaderSig = req.headers["x-signature"];
      if (!mpHeaderSig) {
        console.error("[MP] Missing x-signature");
        return res.status(400).send("Missing signature");
      }
      var sigParts = {};
      mpHeaderSig.split(",").forEach(function (part) {
        var kv = part.trim().split("=");
        if (kv.length === 2) sigParts[kv[0].trim()] = kv[1].trim();
      });
      var ts = sigParts.ts;
      var v1 = sigParts.v1;
      if (!ts || !v1) return res.status(400).send("Invalid signature format");

      var expectedSig = crypto.createHmac("sha256", mpWebhookSecret)
        .update(req.body.toString() + ts)
        .digest("hex");

      if (v1 !== expectedSig) {
        console.error("[MP] Signature mismatch");
        return res.status(400).send("Invalid signature");
      }
    }

    var body = req.body;
    if (Buffer.isBuffer(req.body)) {
      try { body = JSON.parse(req.body.toString()); } catch (e) {
        try { body = require("querystring").parse(req.body.toString()); } catch (e2) {}
      }
    }

    var topic = req.query.topic || (body && body.type);
    var mpId = req.query.id || (body && body.data && body.data.id);
    if (!topic && body && body.action) topic = body.action;

    if ((topic === "payment" || topic === "merchant_order") && mpId) {
      try {
        var paymentData = await mpPayment.get({ id: mpId });
        var payment = paymentData && paymentData.body ? paymentData.body : (paymentData && paymentData.response);
        if (payment && payment.status === "approved") {
          var ref = payment.external_reference;
          if (ref) await markInvoicePaid(ref);
        }
      } catch (e) {
        console.error("[MP] Error processing payment:", e.message);
      }
    }
    return res.status(200).send("OK");
  }

  // ── Wompi ──
  if (GATEWAYS.wompi && body) {
    // Wompi sends JSON body with transaction data
    var bodyStr = req.body;
    if (Buffer.isBuffer(req.body)) {
      try { bodyStr = JSON.parse(req.body.toString()); } catch (e) { bodyStr = null; }
    }

    if (bodyStr && bodyStr.event && bodyStr.data && bodyStr.data.transaction) {
      var tx = bodyStr.data.transaction;
      var txRef = tx.reference;
      var txStatus = tx.status;

      // Verify integrity signature
      var wompiSecret = process.env.WOMPI_PRIVATE_KEY;
      var receivedSig = req.headers["x-signature"] || (bodyStr.signature && bodyStr.signature.checksum);
      if (receivedSig) {
        var computedSig = crypto.createHmac("sha256", wompiSecret)
          .update(bodyStr.data.id + txRef + (tx.amount_in_cents || "") + (txStatus || ""))
          .digest("hex");
        if (receivedSig !== computedSig) {
          console.error("[Wompi] Signature mismatch");
          return res.status(400).send("Invalid signature");
        }
      }

      if (txStatus === "APPROVED") {
        await markInvoicePaid(txRef);
        // If signup reference, create a pending_approval record
        console.log("[Wompi] Transaction " + txRef + " approved.");
      }
      return res.status(200).send("OK");
    }
  }

  res.status(400).json({ error: "Unknown webhook" });
});

// ── POST /api/payment/wompi-transaction — verify Wompi transaction status ──
router.post("/wompi-transaction", async function (req, res, next) {
  try {
    var { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: "transactionId requerido" });
    var result = await wompiApi("/transactions/" + transactionId, "GET");
    res.json(result);
  } catch (err) { next(err); }
});

// ── Helpers ──
async function handleStripeCompleted(session) {
  var invoiceId = session.metadata && session.metadata.invoiceId;
  var tenantId = session.metadata && session.metadata.tenantId;
  if (invoiceId && tenantId) {
    try {
      await markInvoicePaid(String(invoiceId));
      console.log("[Stripe] Invoice " + invoiceId + " paid.");
    } catch (e) { console.error("[Stripe] Error updating invoice:", e); }
  }
}

async function markInvoicePaid(reference) {
  // reference can be an invoice ID or a custom reference
  // Try to parse as invoice ID
  var invId = reference;
  if (reference && reference.startsWith("inv-")) invId = reference.slice(4);

  var numId = Number(invId);
  if (!isNaN(numId) && numId > 0) {
    var [result] = await getDbPool().query(
      "UPDATE billing_invoices SET status = 'paid', paid_at = NOW() WHERE id = ? AND status != 'paid'",
      [numId]
    );
    if (result.affectedRows > 0) {
      logAudit({
        userId: null, userName: "system", userRole: "system",
        moduleName: "Pagos", actionType: "payment_received",
        actionDescription: "Pago recibido para factura #" + numId,
        newData: { reference: reference },
        ipAddress: null, deviceInfo: null
      });
    }
  }
}

module.exports = router;
module.exports.webhookRouter = webhookRouter;
