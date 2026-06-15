# RoomTab - Minibar Management System

Sistema de gestion de minibar para hoteles. Permite registrar consumos por habitacion, controlar inventario, generar reportes en PDF y Excel, enviar resumenes por WhatsApp, y realizar auditoria de todas las operaciones.

## Tech Stack

- **Backend**: Node.js, Express 4.19
- **Base de datos**: MySQL 8+ con mysql2
- **Frontend**: HTML5, CSS3 (vanilla, sin frameworks)
- **Iconos**: Phosphor Icons (Web Light)
- **Graficos**: Chart.js 4.5
- **PDF**: PDFKit (servidor) / jsPDF (cliente)
- **Excel**: ExcelJS
- **PWA**: Service Worker + Web Manifest
- **Autenticacion**: express-session con bcryptjs
- **Seguridad**: helmet, cors, express-rate-limit
- **Archivos**: multer para subida de imagenes

## Requisitos

- Node.js 18+
- MySQL 8+
- npm

## Instalacion

```bash
# Clonar el repositorio
git clone <repo-url>
cd minibar-app

# Instalar dependencias
npm install

# Configurar variables de entorno
# Editar .env con tus credenciales de base de datos
cp .env.example .env

# Migrar la base de datos
node src/db/migrate.js

# (Opcional) Poblar con datos de ejemplo
npm run seed

# Iniciar servidor
npm run dev
```

## Variables de Entorno (.env)

| Variable | Descripcion | Valor por defecto |
|---|---|---|
| PORT | Puerto del servidor | 3000 |
| DB_HOST | Host de MySQL | localhost |
| DB_PORT | Puerto de MySQL | 3306 |
| DB_USER | Usuario de MySQL | root |
| DB_PASSWORD | Contrasena de MySQL | (vacio) |
| DB_NAME | Nombre de base de datos | minibar_app |
| SESSION_SECRET | Secreto para sesiones | (generado) |

## Estructura del Proyecto

```
minibar-app/
  server.js                  # Entry point
  src/
    app.js                   # Configuracion de Express, rutas, middleware
    auditLogger.js           # Logger de auditoria
    pdfHelper.js             # Generacion de PDF en servidor
    config/
      db.js                  # Pool de conexion MySQL
    db/
      migrate.js             # Migracion de base de datos
      seed.js                # Datos de ejemplo
    middleware/
      errorHandler.js        # Manejo de errores 404
    repositories/            # Capa de acceso a datos
      consumptionRepository.js
      productRepository.js
      roomRepository.js
    routes/                  # Rutas de API
      adminRoutes.js
      auditRoutes.js
      authRoutes.js
      consumptionRoutes.js
      dashboardRoutes.js
      minibarRoutes.js
      notificationRoutes.js
      perdidasRoutes.js
      productRoutes.js
      roomRoutes.js
  public/                    # Frontend estatico
    index.html               # (legacy redirect)
    landing.html             # Portada / Landing page
    login.html               # Inicio de sesion
    registro.html            # Registro de usuarios
    forgot-password.html     # Recuperacion de contrasena
    reset-password.html      # Restablecer contrasena
    dashboard.html           # Dashboard principal
    minibar.html             # Gestion de minibar
    admin.html               # Panel de administracion
    notificaciones.html      # Notificaciones
    auditoria.html           # Auditoria
    perdidas.html            # Perdidas y danos
    reportes.html            # Reportes
    movimientos.html         # Historial de movimientos
    revision-rapida.html     # Revision rapida
    unlock.html              # Desbloqueo de habitaciones
    perfil.html              # Perfil de usuario
    settings.html            # Configuracion
    sw.js                    # Service Worker (PWA)
    manifest.webmanifest     # PWA manifest
    css/
      theme.css              # Design tokens, tema claro/oscuro
      app.css                # Estilos principales
      login.css              # Estilos de login
      register.css           # Estilos de registro
      chatbot.css            # Estilos del chatbot
    js/
      app.js                 # Logica compartida (sidebar, modales, toasts)
      theme.js               # Cambio de tema claro/oscuro
      i18n.js                # Sistema de traducciones ES/EN
      chatbot.js             # Chatbot de ayuda
      loader.js              # Overlay de carga
      login.js, register.js, dashboard.js, minibar.js, ...
    images/                  # Imagenes y logos
    icons/                   # Iconos PWA
    uploads/products/        # Imagenes de productos
```

## Rutas de API

### Autenticacion
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesion
- `GET /api/auth/me` - Obtener usuario actual
- `POST /api/auth/logout` - Cerrar sesion

### Productos
- `GET /api/products` - Listar productos
- `POST /api/products` - Crear producto (admin)
- `PUT /api/products/:id` - Actualizar producto (admin)
- `DELETE /api/products/:id` - Eliminar producto (admin)

### Habitaciones
- `GET /api/rooms` - Listar habitaciones (con pisos)
- `GET /api/rooms/:id` - Detalle de habitacion
- `POST /api/rooms` - Crear habitacion (admin)
- `PUT /api/rooms/:id` - Actualizar habitacion (admin)
- `DELETE /api/rooms/:id` - Eliminar habitacion (admin)

### Consumos
- `GET /api/consumptions` - Listar consumos
- `POST /api/consumptions` - Registrar consumo
- `GET /api/consumptions/:id/pdf` - Obtener PDF de consumo
- `PUT /api/consumptions/:id` - Actualizar consumo

### Minibar
- `GET /api/minibar/rooms/:id` - Inventario de habitacion
- `POST /api/minibar/restock` - Reponer productos
- `POST /api/minibar/adjust` - Ajuste manual de inventario
- `GET /api/minibar/movements` - Historial de movimientos
- `GET /api/minibar/rooms-low-stock` - Habitaciones con stock bajo

### Dashboard
- `GET /api/dashboard/stats` - Estadisticas del dashboard
- `GET /api/dashboard/top-products` - Productos mas consumidos
- `GET /api/dashboard/top-rooms` - Habitaciones con mayor consumo
- `GET /api/dashboard/consumption-by-floor` - Consumo por piso
- `GET /api/dashboard/recent-movements` - Movimientos recientes
- `GET /api/dashboard/alerts` - Alertas operativas

### Administracion
- `GET /api/admin/floors` - Listar pisos
- `POST /api/admin/floors` - Crear piso
- `PUT /api/admin/floors/:id` - Actualizar piso
- `DELETE /api/admin/floors/:id` - Eliminar piso
- `GET /api/admin/categories` - Listar categorias
- `POST /api/admin/categories` - Crear categoria
- `PUT /api/admin/categories/:id` - Actualizar categoria
- `DELETE /api/admin/categories/:id` - Eliminar categoria
- `GET /api/admin/users` - Listar usuarios (admin)
- `POST /api/admin/users` - Crear usuario (admin)
- `PUT /api/admin/users/:id` - Actualizar usuario (admin)
- `DELETE /api/admin/users/:id` - Eliminar usuario (admin)

### Auditoria
- `GET /api/audit/logs` - Listar registros de auditoria
- `GET /api/audit/stats` - Estadisticas de auditoria
- `GET /api/audit/export/pdf` - Exportar auditoria a PDF
- `GET /api/audit/export/excel` - Exportar auditoria a Excel

### Perdidas
- `GET /api/perdidas` - Listar perdidas
- `POST /api/perdidas` - Registrar perdida/dano
- `GET /api/perdidas/stats` - Estadisticas de perdidas

### Notificaciones
- `GET /api/notifications` - Listar notificaciones
- `PUT /api/notifications/:id/read` - Marcar como leida

## Roles de Usuario

| Rol | Permisos |
|---|---|
| operador | Registrar consumos, gestionar minibar, desbloqueo de folio, reportes, perfil |
| admin | Acceso completo, incluyendo panel de administracion (productos, categorias, pisos, habitaciones, usuarios) |

## Funcionalidades

- **Dashboard interactivo** con graficos Chart.js, KPIs, alertas y consumo por piso
- **Gestion de minibar** por pisos y habitaciones con inventario, consumo, reposicion y ajuste
- **Reportes en PDF y Excel** con rango de fechas personalizable
- **Desbloqueo de folio** con generacion de mensaje para WhatsApp
- **Auditoria completa** de todas las acciones del sistema con filtros y exportacion
- **Control de perdidas y danos** con estadisticas por periodo
- **Notificaciones** de stock bajo y movimientos pendientes
- **PWA instalable** con soporte offline parcial
- **Tema claro/oscuro** con persistencia en localStorage
- **Idioma ES/EN** con traduccion completa de la interfaz
- **Chatbot de ayuda** con FAQ sobre todas las funcionalidades del sistema
- **Atajos de teclado**: Ctrl+N, Ctrl+F, Ctrl+L, Ctrl+R, Ctrl+D

## Scripts

```bash
npm start    # Iniciar en produccion
npm run dev  # Iniciar en desarrollo con recarga automatica
npm run seed # Poblar base de datos con datos de ejemplo
```

## Base de Datos

Ejecutar `node src/db/migrate.js` para crear las tablas. Las tablas principales son:

- `users` - Usuarios del sistema
- `floors` - Pisos del hotel
- `rooms` - Habitaciones
- `categories` - Categorias de productos
- `products` - Productos del minibar
- `consumptions` - Registros de consumo
- `consumption_items` - Detalle de productos consumidos
- `inventory` - Inventario por habitacion
- `inventory_movements` - Movimientos de inventario
- `losses` - Registros de perdidas y danos
- `audit_logs` - Registros de auditoria
- `notifications` - Notificaciones del sistema

## Licencia

MIT
