const CACHE = "roomtab-v6";

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
  "/images/favicon.png",
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
  "/js/admin.js",
  "/js/auditoria.js",
  "/js/perdidas.js",
  "/js/unlock.js",
  "/js/offline-sync.js",
  "/images/roomtab-app-icon.png",
  "/images/roomtab-logo-dark-transparent.png",
  "/images/roomtab-logo-vertical.png",
  "/apple-touch-icon.png",
  "/images/roomtab-logo-white.png",
  "/images/mujer_isle%C3%B1a.png",
  "https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/light/style.css"
];

const OFFLINE_MUTATION_URLS = [
  "/api/minibar/consumption",
  "/api/minibar/restock",
  "/api/minibar/adjust"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return Promise.allSettled(
        SHELL.filter((url) => url.startsWith("/")).map((url) => cache.add(url))
      ).then(() => {});
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

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "OFFLINE_MODE_STATUS") {
    self._offlineModeEnabled = event.data.enabled;
  }
  if (event.data && event.data.type === "SYNC_OFFLINE_QUEUE") {
    self._triggerSync = true;
    self.clients.matchAll().then(function (clients) {
      clients.forEach(function (client) {
        client.postMessage({ type: "TRIGGER_SYNC" });
      });
    });
  }
});

self.addEventListener("push", function (event) {
  let data = { title: "RoomTab", body: "", icon: "/images/roomtab-app-icon.png", badge: "/images/favicon.png", url: "/app/notificaciones" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed.title) data.title = parsed.title;
      if (parsed.body) data.body = parsed.body;
      if (parsed.icon) data.icon = parsed.icon;
      if (parsed.badge) data.badge = parsed.badge;
      if (parsed.url) data.url = parsed.url;
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [200, 100, 200],
      data: { url: data.url },
      actions: [
        { action: "open", title: "Ver" },
        { action: "close", title: "Cerrar" }
      ]
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/app/notificaciones";
  if (event.action === "close") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" && req.method !== "POST") return;

  if (url.pathname.startsWith("/api/")) {
    if (req.method === "POST" && OFFLINE_MUTATION_URLS.indexOf(url.pathname) !== -1) {
      event.respondWith(
        fetch(req.clone()).catch(function () {
          return new Response(JSON.stringify({ offline: true, queued: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        })
      );
      return;
    }

    event.respondWith(fetch(req).catch(function() {
      return new Response(JSON.stringify({ error: "Sin conexion" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    }).catch(() => {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    })
  );
});
