const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { initDbPool } = require("./config/db");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

// Ensure upload directories exist
const productsDir = path.join(__dirname, "..", "public", "uploads", "products");
if (!require("fs").existsSync(productsDir)) {
  require("fs").mkdirSync(productsDir, { recursive: true });
}

const productRoutes = require("./routes/productRoutes");
const roomRoutes = require("./routes/roomRoutes");
const consumptionRoutes = require("./routes/consumptionRoutes");
const authRoutes = require("./routes/authRoutes");
const minibarRoutes = require("./routes/minibarRoutes");
const adminRoutes = require("./routes/adminRoutes");
const perdidasRoutes = require("./routes/perdidasRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const auditRoutes = require("./routes/auditRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

function createApp() {
  initDbPool();

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." }
  });
  app.use("/api/", apiLimiter);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) {
    console.warn("ADVERTENCIA: SESSION_SECRET débil o no configurado. Usa una clave de 32+ caracteres en .env");
  }

  app.use(
    session({
      secret: sessionSecret || "chargeit-default-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  function requireLogin(req, res, next) {
    if (!req.session.user) {
      return res.redirect("/");
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.session.user) {
      return res.redirect("/");
    }
    if (req.session.user.role !== "admin") {
      return res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
    }
    next();
  }

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "landing.html"));
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Minibar API</title>

        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&family=Sigmar&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div class="page-wrapper">
          <div class="container">
            <div class="header">
              <div class="title-block">
                <h1>Minibar API</h1>
                <p>Backend para el reporte de consumos del minibar del hotel.</p>
              </div>
              <div class="brand">
                <img 
                  src="/images/roomtab-logo-dark-transparent.png"
                  alt="RoomTab" 
                />
              </div>
            </div>

            <div class="meta">
              <div class="meta-row">Estado: <strong>running</strong></div>
              <div class="meta-row">Versión: <strong>1.0.0</strong></div>
              <div class="meta-row">
                Base de datos: <code>minibar_app</code>
              </div>
            </div>

            <div class="endpoints">
              <h2>Endpoints disponibles</h2>
              <ul>
                <li>
                  <span class="badge">
                    <span class="badge-method">GET</span>
                    <span class="badge-path">/api/health</span>
                  </span>
                  <span class="tag">healthcheck</span>
                  <a href="/api/health" target="_blank">probar</a>
                </li>
                <li>
                  <span class="badge">
                    <span class="badge-method">GET</span>
                    <span class="badge-path">/api/rooms</span>
                  </span>
                  <span class="tag">habitaciones</span>
                  <a href="/api/rooms" target="_blank">probar</a>
                </li>
                <li>
                  <span class="badge">
                    <span class="badge-method">GET</span>
                    <span class="badge-path">/api/products</span>
                  </span>
                  <span class="tag">productos minibar</span>
                  <a href="/api/products" target="_blank">probar</a>
                </li>
                <li>
                  <span class="badge">
                    <span class="badge-method">POST</span>
                    <span class="badge-path">/api/consumptions</span>
                  </span>
                  <span class="tag">registro consumo</span>
                </li>
              </ul>
            </div>

            <div class="footer">
              Usa estas rutas desde tu PWA o desde Postman para registrar consumos y consultar información.
            </div>
          </div>
        </div>

        <style>
          :root {
            --color-bg: #ece0cfa9;
            --color-card: rgba(70, 74, 60, 0.92);
            --color-border: rgba(70, 74, 60, 0.92);
            --color-heading: #f6f3ea;
            --color-subheading: #ece0cf;
            --color-text: #f4f1e7;
            --color-muted: #cbc6b5;
            --color-muted-strong: #a29d8d;

            --color-tag-border: #6d7162;
            --color-link: #c8aa6a;
            --shadow-strong: 0 20px 40px rgba(70, 74, 60, 0.92);
            --radius-card: 16px;

            --font-title: "Sigmar", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            --font-text: "Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            --font-mono: "JetBrains Mono","Fira Code",monospace;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            font-family: var(--font-text);
            background: var(--color-bg);
            color: var(--color-text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .page-wrapper {
            width: 100%;
            max-width: 1100px;
            padding: 16px;
          }

          .container {
            margin: 0 auto;
            padding: 24px 28px;
            background: var(--color-card);
            border-radius: var(--radius-card);
            box-shadow: var(--shadow-strong);
            border: 1px solid var(--color-border);
            backdrop-filter: blur(6px);
          }

          .header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 20px;
          }

          .title-block h1 {
            margin: 0 0 8px 0;
            font-size: 28px;
            color: var(--color-heading);
            font-family: var(--font-title);
            letter-spacing: 0.03em;
          }

          .title-block p {
            margin: 0;
            color: var(--color-muted);
            font-size: 14px;
            font-family: var(--font-text);
          }

          .brand {
            flex-shrink: 0;
          }

          .brand img {
            max-width: 180px;
            max-height: 80px;
            object-fit: contain;
            display: block;
          }

          .meta {
            margin: 8px 0 24px;
            font-size: 13px;
            color: var(--color-muted-strong);
            font-family: var(--font-text);
          }

          .meta-row {
            margin-bottom: 4px;
          }

          .meta-row code {
            background: var(--color-bg-alt);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--font-mono);
            font-size: 12px;
            border: 1px solid var(--color-border);
          }

          .endpoints {
            margin-top: 16px;
          }

          .endpoints h2 {
            font-size: 18px;
            margin-bottom: 8px;
            color: var(--color-subheading);
            font-family: var(--font-text);
          }

          ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }

          li {
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }

          .badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid var(--color-border);
            font-family: var(--font-mono);
            font-size: 12px;
            background: rgba(40,44,32,0.95);
          }

          .badge-method {
            background: #2f3528;
            color: var(--color-text);
            margin-right: 4px;
          }

          .badge-path {
            background: var(--color-bg-alt);
            color: var(--color-text);
          }

          .tag {
            display: inline-flex;
            align-items: center;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 999px;
            border: 1px solid var(--color-tag-border);
            color: var(--color-muted);
            font-family: var(--font-text);
          }

          a {
            color: var(--color-link);
            text-decoration: none;
            font-size: 13px;
            font-family: var(--font-text);
          }

          a:hover {
            text-decoration: underline;
          }

          .footer {
            margin-top: 24px;
            font-size: 12px;
            color: var(--color-muted-strong);
            font-family: var(--font-text);
          }

          @media (max-width: 768px) {
            .container {
              padding: 20px 18px;
            }
            .header {
              flex-direction: column-reverse;
              align-items: flex-start;
            }
            .brand img {
              max-width: 160px;
            }
            .title-block h1 {
              font-size: 22px;
            }
          }

          @media (max-width: 480px) {
            .page-wrapper {
              padding: 8px;
            }
            .container {
              padding: 18px 14px;
              border-radius: 12px;
            }
            .title-block h1 {
              font-size: 20px;
            }
            .meta {
              font-size: 12px;
            }
            li {
              flex-direction: column;
              align-items: flex-start;
            }
          }
        </style>
      </body>
      </html>
    `);
  });

  app.get("/app", requireLogin, (req, res) => {
    res.redirect("/app/dashboard");
  });

  app.get("/app/ChargeIt", requireLogin, (req, res) => {
    res.redirect("/app/dashboard");
  });

  app.get("/app/RoomTab", requireLogin, (req, res) => {
    res.redirect("/app/dashboard");
  });

  app.get("/perfil", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "perfil.html"));
  });

  app.get("/settings", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "settings.html"));
  });

  app.get("/app/minibar", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "minibar.html"));
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/auth", authRoutes);

  app.use("/api/products", requireLogin, productRoutes);
  app.use("/api/rooms", requireLogin, roomRoutes);
  app.use("/api/consumptions", requireLogin, consumptionRoutes);
  app.use("/api/minibar", requireLogin, minibarRoutes);
  app.use("/api/admin", requireAdmin, adminRoutes);
  app.use("/api/perdidas", requireLogin, perdidasRoutes);
  app.use("/api/notifications", requireLogin, notificationRoutes);
  app.use("/api/audit", requireLogin, auditRoutes);
  app.use("/api/dashboard", requireLogin, dashboardRoutes);

  app.get("/app/dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "dashboard.html"));
  });

  app.get("/app/auditoria", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "auditoria.html"));
  });

  app.get("/app/notificaciones", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "notificaciones.html"));
  });

  app.get("/app/revision-rapida", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "revision-rapida.html"));
  });

  app.get("/app/admin", requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
  });

  app.get("/app/perdidas", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "perdidas.html"));
  });

  app.get("/app/reportes", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "reportes.html"));
  });

  app.get("/app/movimientos", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "movimientos.html"));
  });

  app.get("/forgot-password.html", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "forgot-password.html"));
  });

  app.get("/reset-password/:token", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "reset-password.html"));
  });

  app.get("/reset-password", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "reset-password.html"));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
