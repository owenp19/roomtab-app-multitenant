const CACHE = "chargeit-v3";

const SHELL = [
  "/",
  "/login.html",
  "/registro.html",
  "/minibar.html",
  "/unlock.html",
  "/settings.html",
  "/perfil.html",
  "/revision-rapida.html",
  "/admin.html",
  "/dashboard.html",
  "/auditoria.html",
  "/notificaciones.html",
  "/perdidas.html",
  "/reportes.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/css/theme.css",
  "/css/app.css",
  "/css/login.css",
  "/css/chatbot.css",
  "/css/register.css",
  "/js/theme.js",
  "/js/i18n.js",
  "/js/loader.js",
  "/js/app.js",
  "/js/login.js",
  "/js/register.js",
  "/js/minibar.js",
  "/js/perfil.js",
  "/js/revision-rapida.js",
  "/js/chatbot.js",
  "/js/dashboard.js",
  "/js/register.js",
  "/js/admin.js",
  "/js/auditoria.js",
  "/js/perdidas.js",
  "/js/unlock.js",
  "/images/roomtab-app-icon.png",
  "/images/roomtab-logo-dark-transparent.png",
  "/images/roomtab-logo-vertical.png",
  "/apple-touch-icon.png",
  "/images/roomtab-logo-white.png",
  "/images/mujer_isle%C3%B1a.png",
  "https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/light/style.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(SHELL).catch((err) => {
        console.error("SW cache-addAll failed:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Network-only for API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        // Cache successful responses for future
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    }).catch(() => {
      // Fallback: try network anyway
      return fetch(req);
    })
  );
});
