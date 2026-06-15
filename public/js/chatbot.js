const FAQ_ES = [
  {
    q: "Como funciona esta aplicacion",
    a: "RoomTab es un sistema de gestion de minibar para hoteles. Permite registrar consumos por habitacion, llevar inventario, generar reportes en PDF y Excel, enviar resumenes por WhatsApp, y controlar perdidas y danos. Todo desde un dashboard central con indicadores clave."
  },
  {
    q: "Como registro un consumo",
    a: "Ve al modulo de Minibar, selecciona un piso y luego una habitacion. En la pestana 'Registrar consumo', marca los productos consumidos, ajusta cantidades si es necesario, agrega una nota opcional y haz clic en 'Guardar consumo' o 'Guardar y enviar a recepcion'."
  },
  {
    q: "Como envio por WhatsApp",
    a: "Despues de seleccionar los productos consumidos, haz clic en 'Guardar y enviar a recepcion'. Se abrira WhatsApp con un mensaje prearmado que incluye el numero de habitacion, productos, cantidades, total y enlace al PDF de la cuenta de cobro."
  },
  {
    q: "Que es el desbloqueo de folio",
    a: "La herramienta de Desbloqueo de Folio te permite seleccionar una o varias habitaciones y generar un mensaje para solicitar el desbloqueo del folio, por ejemplo para mantenimiento o salida tardia. Puedes enviarlo por WhatsApp o copiar el mensaje al portapapeles."
  },
  {
    q: "Como descargo un PDF de consumo",
    a: "Despues de registrar un consumo, el sistema genera automaticamente un PDF con la cuenta de cobro. Puedes acceder al enlace directo que aparece en la respuesta. Tambien puedes generar informes desde la seccion Reportes seleccionando un rango de fechas y exportar a PDF o Excel."
  },
  {
    q: "Que significa cada KPI del dashboard",
    a: "Las tarjetas KPI del dashboard muestran: Habitacion (la habitacion seleccionada), Items (cantidad total de productos marcados), Total (suma de precios por cantidades), y Ultima accion (hora del ultimo cambio). Ademas el dashboard principal muestra: productos hoy, movimientos hoy, habitaciones totales, stock bajo, productos mas consumidos, top habitaciones, consumo por piso y alertas operativas."
  },
  {
    q: "Como cambio de tema claro oscuro",
    a: "Puedes cambiar entre tema claro y oscuro desde la pagina de Configuracion (icono de engranaje en la barra lateral). Tambien puedes usar el interruptor de tema que aparece en la barra superior de la mayoria de las paginas."
  },
  {
    q: "Puedo seleccionar varias habitaciones",
    a: "Si, en la herramienta de Desbloqueo de Folio puedes seleccionar multiples habitaciones usando Ctrl (Windows) o Cmd (Mac) mientras haces clic. Tambien hay un boton 'Seleccionar todas' para agilizar el proceso."
  },
  {
    q: "Los datos se guardan automaticamente",
    a: "Si, cada consumo que registras se guarda inmediatamente en la base de datos MySQL. El PDF de factura se genera bajo demanda al acceder al enlace. Todos los movimientos quedan registrados en el modulo de Auditoria."
  },
  {
    q: "Como inicio sesion",
    a: "Ve a la pagina de Inicio de Sesion desde la portada. Ingresa tu correo electronico corporativo y contrasena. Si no tienes cuenta, haz clic en 'Crear cuenta' en la portada o en la pagina de registro. Si olvidaste tu contrasena, usa la opcion 'Olvidaste tu contrasena' en la pagina de login."
  },
  {
    q: "Como crear una cuenta",
    a: "Desde la portada, haz clic en 'Crear cuenta' o 'Registrarse'. Completa el formulario con tu nombre completo, correo electronico, contrasena (minimo 6 caracteres) y confirmacion de contrasena. Acepta los terminos y haz clic en 'Crear cuenta'."
  },
  {
    q: "Que hay en el dashboard",
    a: "El dashboard principal muestra un resumen operativo con: productos consumidos hoy, movimientos del dia, total de habitaciones, habitaciones con stock bajo, productos mas consumidos, top habitaciones por consumo, consumo por piso, movimientos recientes, alertas operativas, perdidas y danos del periodo, y graficos interactivos con Chart.js."
  },
  {
    q: "Como funciona el modulo de minibar",
    a: "El modulo de Minibar esta organizado por pisos y habitaciones. Seleccionas un piso, luego una habitacion, y accedes a pestanas: Inventario (ver stock actual), Registrar consumo (marcar productos consumidos), Reponer productos (agregar stock), Ajuste manual (corregir cantidades), Historial (movimientos anteriores) y Reportes (informes por rango de fechas)."
  },
  {
    q: "Como reponer productos",
    a: "En el modulo de Minibar, selecciona la habitacion y ve a la pestana 'Reponer productos'. Selecciona los productos que deseas reponer, ingresa la cantidad a agregar al inventario y haz clic en 'Guardar reposicion'."
  },
  {
    q: "Como hacer un ajuste manual de inventario",
    a: "En el modulo de Minibar, selecciona la habitacion y ve a la pestana 'Ajuste manual'. Aqui puedes corregir manualmente las cantidades de los productos cuando sea necesario. Ingresa la nueva cantidad para cada producto y haz clic en 'Guardar ajuste'."
  },
  {
    q: "Que es el panel de administracion",
    a: "El panel de Administracion solo esta disponible para usuarios con rol de administrador. Permite gestionar: Productos (crear, editar, eliminar), Categorias, Pisos, Habitaciones, y Usuarios del sistema. Incluye un dashboard administrativo con estadisticas globales."
  },
  {
    q: "Como gestionar productos en admin",
    a: "En el panel de Admin, ve a la seccion Productos. Puedes crear nuevos productos con nombre, precio, categoria e imagen. Tambien puedes editar productos existentes, activarlos/desactivarlos o eliminarlos. Las imagenes se suben mediante el formulario de creacion."
  },
  {
    q: "Como gestionar habitaciones en admin",
    a: "En el panel de Admin, ve a la seccion Habitaciones. Puedes crear nuevas habitaciones asignandolas a un piso existente, editar el numero de habitacion, cambiar su piso, o eliminarla. Las habitaciones se organizan numericamente dentro de cada piso."
  },
  {
    q: "Como gestionar pisos en admin",
    a: "En el panel de Admin, ve a la seccion Pisos. Puedes crear nuevos pisos con un nombre (ej: 'Piso 1', 'Piso 2') y editar o eliminar pisos existentes. Al eliminar un piso, las habitaciones asociadas se quedan sin piso asignado."
  },
  {
    q: "Como gestionar categorias en admin",
    a: "En el panel de Admin, ve a la seccion Categorias. Puedes crear categorias para clasificar los productos del minibar (ej: 'Bebidas', 'Snacks', 'Alcohol'). Las categorias se usan al crear o editar productos."
  },
  {
    q: "Como gestionar usuarios en admin",
    a: "En el panel de Admin, ve a la seccion Usuarios. Puedes crear nuevos usuarios, editar sus datos, cambiar su rol (operador/admin), activarlos o desactivarlos, y eliminar usuarios del sistema."
  },
  {
    q: "Que es el modulo de auditoria",
    a: "El modulo de Auditoria registra todas las acciones realizadas en el sistema: consumos, reposiciones, ajustes, perdidas, inicios de sesion, etc. Muestra el usuario, modulo, accion, descripcion, fecha, hora, IP y dispositivo. Puedes filtrar por fecha, usuario, modulo y tipo de accion, y exportar los resultados a PDF o Excel."
  },
  {
    q: "Que es el modulo de perdidas y danos",
    a: "El modulo de Perdidas permite registrar productos robados o danados en las habitaciones. Puedes seleccionar la habitacion, marcar los productos afectados, indicar si es perdida (robo) o dano, y guardar el registro. El dashboard muestra estadisticas de perdidas y danos del periodo."
  },
  {
    q: "Como generar reportes",
    a: "En la seccion de Reportes puedes generar informes de consumo por rango de fechas. Selecciona la fecha inicial y final, y haz clic en 'Generar reporte'. Puedes exportar los resultados a PDF o Excel. Los reportes incluyen detalle de productos, cantidades, totales y habitaciones."
  },
  {
    q: "Como editar mi perfil",
    a: "Ve a la pagina de Perfil (icono de usuario en la barra lateral). Puedes actualizar tu nombre completo, correo electronico, telefono y foto de perfil. Haz clic en 'Guardar cambios' para aplicar las modificaciones."
  },
  {
    q: "Que configuraciones puedo ajustar",
    a: "En la pagina de Configuracion puedes: cambiar entre tema claro y oscuro, ver la informacion del sistema (version, base de datos, entorno), y consultar las credenciales de acceso predefinidas para pruebas."
  },
  {
    q: "Como funcionan las notificaciones",
    a: "El modulo de Notificaciones muestra alertas y avisos importantes del sistema, como habitaciones con stock bajo, productos agotados, o movimientos pendientes de revision. Las notificaciones te ayudan a mantenerte al tanto del estado operativo."
  },
  {
    q: "Que es la revision rapida",
    a: "La Revision Rapida es una vista compacta que te permite revisar rapidamente el estado de todas las habitaciones: cuales tienen consumos registrados, cuales estan pendientes, y cuales tienen stock bajo o productos agotados. Ideal para recorridos de supervision."
  },
  {
    q: "Que son los movimientos",
    a: "El modulo de Movimientos muestra el historial completo de todas las transacciones del inventario: consumos, reposiciones, ajustes, perdidas y danos. Puedes ver la fecha, habitacion, producto, cantidad, tipo de movimiento y usuario que lo realizo."
  },
  {
    q: "Como cambiar el idioma",
    a: "Puedes cambiar entre espanol e ingles usando el selector de idioma (ES/EN) que aparece en la barra superior de la mayoria de las paginas o en la portada. El idioma seleccionado se guarda y se mantiene al navegar entre paginas."
  },
  {
    q: "La aplicacion funciona sin conexion",
    a: "Si, RoomTab es una PWA (Progressive Web App). Puedes instalarla en tu dispositivo y algunas funciones basicas estan disponibles sin conexion gracias al Service Worker. Sin embargo, la mayoria de las operaciones requieren conexion a internet para comunicarse con la base de datos."
  },
  {
    q: "Como instalar la aplicacion en mi dispositivo",
    a: "RoomTab es una PWA instalable. En el navegador de tu dispositivo movil o desktop, busca la opcion 'Instalar' o 'Agregar a pantalla de inicio' en el menu del navegador. Una vez instalada, funciona como una aplicacion nativa."
  },
  {
    q: "Que atajos de teclado estan disponibles",
    a: "El sistema soporta atajos de teclado: Ctrl+N para nueva nota, Ctrl+F para buscar, Ctrl+L para cerrar sesion, Ctrl+R para recargar, Ctrl+D para ir al dashboard. Estos atajos agilizan la navegacion y operacion diaria."
  },
  {
    q: "Como se calculan los totales del consumo",
    a: "El total del consumo se calcula multiplicando el precio unitario de cada producto por la cantidad consumida. El sistema suma automaticamente todos los productos marcados y muestra el total en la interfaz antes de guardar."
  },
  {
    q: "Que significa stock bajo",
    a: "Una habitacion tiene stock bajo cuando la cantidad de uno o mas productos en su inventario es menor o igual al limite minimo definido. El sistema marca estas habitaciones para que sepas cuales necesitan reposicion."
  },
  {
    q: "Como funciona el envio a recepcion",
    a: "Al hacer clic en 'Guardar y enviar a recepcion', el sistema primero guarda el consumo en la base de datos, genera un PDF con la cuenta de cobro, y luego abre WhatsApp Web o la aplicacion de WhatsApp con un mensaje prearmado que contiene toda la informacion del consumo y el enlace al PDF."
  },
  {
    q: "Que datos aparecen en el reporte PDF",
    a: "El reporte PDF incluye: encabezado del hotel, numero de habitacion, fecha y hora del consumo, lista de productos con cantidades y precios unitarios, subtotal por producto, total general, y codigo QR o enlace para verificar la factura."
  },
  {
    q: "Cuantos pisos y habitaciones puedo tener",
    a: "No hay limite definido de pisos ni habitaciones. El sistema es escalable y puedes gestionar desde un pequeno hotel con pocas habitaciones hasta un hotel grande con multiples pisos y cientos de habitaciones."
  },
  {
    q: "Que roles de usuario existen",
    a: "Existen dos roles: 'operador' (puede registrar consumos, gestionar minibar, usar desbloqueo, ver reportes) y 'admin' (acceso completo incluyendo panel de administracion para gestionar productos, categorias, pisos, habitaciones y usuarios)."
  },
  {
    q: "Como recuperar mi contrasena",
    a: "En la pagina de inicio de sesion, haz clic en 'Olvidaste tu contrasena'. Ingresa tu correo electronico y recibiras un enlace para restablecer tu contrasena. Si estas en entorno de desarrollo, puedes ejecutar 'npm run seed' para restablecer las credenciales por defecto."
  }
];

const FAQ_EN = [
  {
    q: "How does this application work",
    a: "RoomTab is a minibar management system for hotels. It allows you to register consumption per room, manage inventory, generate PDF and Excel reports, send summaries via WhatsApp, and track losses and damages. All from a central dashboard with key indicators."
  },
  {
    q: "How do I register consumption",
    a: "Go to the Minibar module, select a floor and then a room. In the 'Register consumption' tab, mark the consumed products, adjust quantities if needed, add an optional note and click 'Save consumption' or 'Save and send to reception'."
  },
  {
    q: "How do I send via WhatsApp",
    a: "After selecting the consumed products, click 'Save and send to reception'. WhatsApp will open with a pre-built message including the room number, products, quantities, total and link to the invoice PDF."
  },
  {
    q: "What is folio unlock",
    a: "The Folio Unlock tool allows you to select one or multiple rooms and generate a message to request folio unlock, for example for maintenance or late checkout. You can send it via WhatsApp or copy the message to clipboard."
  },
  {
    q: "How do I download a consumption PDF",
    a: "After registering a consumption, the system automatically generates a PDF with the invoice. You can access the direct link that appears in the response. You can also generate reports from the Reports section by selecting a date range and exporting to PDF or Excel."
  },
  {
    q: "What does each KPI on the dashboard mean",
    a: "The KPI cards show: Room (selected room), Items (total quantity of marked products), Total (sum of prices times quantities), and Last action (time of last change). The main dashboard also shows: products today, movements today, total rooms, low stock, most consumed products, top rooms, consumption by floor and operational alerts."
  },
  {
    q: "How do I change light dark theme",
    a: "You can switch between light and dark theme from the Settings page (gear icon in the sidebar). You can also use the theme toggle that appears in the top bar on most pages."
  },
  {
    q: "Can I select multiple rooms",
    a: "Yes, in the Folio Unlock tool you can select multiple rooms using Ctrl (Windows) or Cmd (Mac) while clicking. There is also a 'Select all' button to speed up the process."
  },
  {
    q: "Is data saved automatically",
    a: "Yes, every consumption you register is saved immediately to the MySQL database. The invoice PDF is generated on-demand when you access the link. All movements are recorded in the Audit module."
  },
  {
    q: "How do I log in",
    a: "Go to the Login page from the landing page. Enter your corporate email and password. If you don't have an account, click 'Create account' on the landing page or registration page. If you forgot your password, use the 'Forgot your password' option on the login page."
  },
  {
    q: "How do I create an account",
    a: "From the landing page, click 'Create account' or 'Sign up'. Complete the form with your full name, email, password (minimum 6 characters) and password confirmation. Agree to the terms and click 'Create account'."
  },
  {
    q: "What is on the dashboard",
    a: "The main dashboard shows an operational summary with: products consumed today, daily movements, total rooms, rooms with low stock, most consumed products, top consumption rooms, consumption by floor, recent movements, operational alerts, period losses and damages, and interactive charts with Chart.js."
  },
  {
    q: "How does the minibar module work",
    a: "The Minibar module is organized by floors and rooms. You select a floor, then a room, and access tabs: Inventory (view current stock), Register consumption (mark consumed products), Restock products (add stock), Manual adjustment (correct quantities), History (past movements) and Reports (date range reports)."
  },
  {
    q: "How do I restock products",
    a: "In the Minibar module, select the room and go to the 'Restock products' tab. Select the products you want to restock, enter the quantity to add to inventory and click 'Save restock'."
  },
  {
    q: "How do I make a manual inventory adjustment",
    a: "In the Minibar module, select the room and go to the 'Manual adjustment' tab. Here you can manually correct product quantities when needed. Enter the new quantity for each product and click 'Save adjustment'."
  },
  {
    q: "What is the administration panel",
    a: "The Administration panel is only available for users with admin role. It allows managing: Products (create, edit, delete), Categories, Floors, Rooms, and System Users. It includes an administrative dashboard with global statistics."
  },
  {
    q: "How to manage products in admin",
    a: "In the Admin panel, go to the Products section. You can create new products with name, price, category and image. You can also edit existing products, activate/deactivate them or delete them. Images are uploaded through the creation form."
  },
  {
    q: "How to manage rooms in admin",
    a: "In the Admin panel, go to the Rooms section. You can create new rooms assigning them to an existing floor, edit the room number, change its floor, or delete it. Rooms are organized numerically within each floor."
  },
  {
    q: "How to manage floors in admin",
    a: "In the Admin panel, go to the Floors section. You can create new floors with a name (e.g. 'Floor 1', 'Floor 2') and edit or delete existing floors. When deleting a floor, associated rooms become unassigned."
  },
  {
    q: "How to manage categories in admin",
    a: "In the Admin panel, go to the Categories section. You can create categories to classify minibar products (e.g. 'Drinks', 'Snacks', 'Alcohol'). Categories are used when creating or editing products."
  },
  {
    q: "How to manage users in admin",
    a: "In the Admin panel, go to the Users section. You can create new users, edit their data, change their role (operator/admin), activate or deactivate them, and delete users from the system."
  },
  {
    q: "What is the audit module",
    a: "The Audit module records all actions performed in the system: consumptions, restocks, adjustments, losses, logins, etc. It shows the user, module, action, description, date, time, IP and device. You can filter by date, user, module and action type, and export results to PDF or Excel."
  },
  {
    q: "What is the losses and damages module",
    a: "The Losses module allows you to record stolen or damaged products in rooms. You can select the room, mark the affected products, indicate if it is a loss (theft) or damage, and save the record. The dashboard shows loss and damage statistics for the period."
  },
  {
    q: "How to generate reports",
    a: "In the Reports section you can generate consumption reports by date range. Select the start and end date, and click 'Generate report'. You can export the results to PDF or Excel. Reports include product details, quantities, totals and rooms."
  },
  {
    q: "How to edit my profile",
    a: "Go to the Profile page (user icon in the sidebar). You can update your full name, email, phone and profile photo. Click 'Save changes' to apply the modifications."
  },
  {
    q: "What settings can I adjust",
    a: "In the Settings page you can: switch between light and dark theme, view system information (version, database, environment), and check predefined access credentials for testing."
  },
  {
    q: "How do notifications work",
    a: "The Notifications module shows important system alerts and warnings, such as rooms with low stock, out-of-stock products, or pending review movements. Notifications help you stay on top of operational status."
  },
  {
    q: "What is quick review",
    a: "Quick Review is a compact view that lets you quickly check the status of all rooms: which have registered consumption, which are pending, and which have low stock or out-of-stock products. Ideal for supervision rounds."
  },
  {
    q: "What are movements",
    a: "The Movements module shows the complete history of all inventory transactions: consumptions, restocks, adjustments, losses and damages. You can view the date, room, product, quantity, movement type and user who performed it."
  },
  {
    q: "How to change the language",
    a: "You can switch between Spanish and English using the language selector (ES/EN) that appears in the top bar on most pages or on the landing page. The selected language is saved and maintained when navigating between pages."
  },
  {
    q: "Does the app work offline",
    a: "Yes, RoomTab is a PWA (Progressive Web App). You can install it on your device and some basic functions are available offline thanks to the Service Worker. However, most operations require internet connection to communicate with the database."
  },
  {
    q: "How to install the app on my device",
    a: "RoomTab is an installable PWA. In your mobile or desktop browser, look for the 'Install' or 'Add to home screen' option in the browser menu. Once installed, it works like a native application."
  },
  {
    q: "What keyboard shortcuts are available",
    a: "The system supports keyboard shortcuts: Ctrl+N for new note, Ctrl+F for search, Ctrl+L for logout, Ctrl+R for reload, Ctrl+D for dashboard. These shortcuts streamline daily navigation and operation."
  },
  {
    q: "How are consumption totals calculated",
    a: "The consumption total is calculated by multiplying the unit price of each product by the consumed quantity. The system automatically adds all marked products and shows the total in the interface before saving."
  },
  {
    q: "What does low stock mean",
    a: "A room has low stock when the quantity of one or more products in its inventory is less than or equal to the defined minimum limit. The system marks these rooms so you know which ones need restocking."
  },
  {
    q: "How does send to reception work",
    a: "When you click 'Save and send to reception', the system first saves the consumption in the database, generates a PDF with the invoice, and then opens WhatsApp Web or the WhatsApp app with a pre-built message containing all consumption information and the PDF link."
  },
  {
    q: "What data appears in the PDF report",
    a: "The PDF report includes: hotel header, room number, consumption date and time, product list with quantities and unit prices, subtotal by product, grand total, and QR code or link to verify the invoice."
  },
  {
    q: "How many floors and rooms can I have",
    a: "There is no defined limit of floors or rooms. The system is scalable and you can manage from a small hotel with few rooms to a large hotel with multiple floors and hundreds of rooms."
  },
  {
    q: "What user roles exist",
    a: "There are two roles: 'operator' (can register consumption, manage minibar, use unlock, view reports) and 'admin' (full access including administration panel to manage products, categories, floors, rooms and users)."
  },
  {
    q: "How to recover my password",
    a: "On the login page, click 'Forgot your password'. Enter your email and you will receive a link to reset your password. If you are in a development environment, you can run 'npm run seed' to reset the default credentials."
  }
];

(function () {
  if (document.getElementById("chatbot-root")) return;

  function getLang() {
    return (typeof getCurrentLang === "function" ? getCurrentLang() : localStorage.getItem("roomtab-lang")) || "es";
  }

  var FAQ = getLang() === "en" ? FAQ_EN : FAQ_ES;

  var strings = {
    es: {
      title: "Asistente Minibar",
      subtitle: "Resuelve tus dudas al instante",
      greeting: "Hola! Soy el asistente de RoomTab. Haz clic en una pregunta rapida o escribe tu consulta.",
      placeholder: "Escribe tu pregunta...",
      clearTitle: "Borrar conversacion",
      closeTitle: "Cerrar",
      sendLabel: "Enviar",
      toggleLabel: "Abrir chat de ayuda",
      notFound: 'No encontre una respuesta exacta para "<strong>{q}</strong>".<br><br>Prueba con una de estas preguntas:<br>',
      noResults: "Intenta con otras palabras o revisa la documentacion del sistema."
    },
    en: {
      title: "Minibar Assistant",
      subtitle: "Get your questions answered instantly",
      greeting: "Hello! I am the RoomTab assistant. Click a quick question or type your query.",
      placeholder: "Type your question...",
      clearTitle: "Clear conversation",
      closeTitle: "Close",
      sendLabel: "Send",
      toggleLabel: "Open help chat",
      notFound: 'I could not find an exact answer for "<strong>{q}</strong>".<br><br>Try one of these questions:<br>',
      noResults: "Try different words or check the system documentation."
    }
  };

  var FAQ_ES_QUESTIONS = FAQ_ES.map(function (f) { return f.q; });
  var FAQ_EN_QUESTIONS = FAQ_EN.map(function (f) { return f.q; });

  function updateLanguage() {
    var lang = getLang();
    FAQ = lang === "en" ? FAQ_EN : FAQ_ES;
    var s = strings[lang];
    var headerTitle = document.querySelector(".chatbot-header h3");
    var headerSub = document.querySelector(".chatbot-header p");
    var greetingMsg = document.querySelector(".chatbot-msg.bot");
    var inputEl = document.getElementById("chatbot-input");
    var toggleBtn = document.getElementById("chatbot-toggle");
    var clearBtn = document.getElementById("chatbot-clear");
    var closeBtn = document.getElementById("chatbot-close");

    if (headerTitle) headerTitle.textContent = s.title;
    if (headerSub) headerSub.textContent = s.subtitle;
    if (inputEl) inputEl.placeholder = s.placeholder;
    if (toggleBtn) toggleBtn.setAttribute("aria-label", s.toggleLabel);
    if (clearBtn) {
      clearBtn.setAttribute("title", s.clearTitle);
      clearBtn.setAttribute("aria-label", s.clearTitle);
    }
    if (closeBtn) {
      closeBtn.setAttribute("title", s.closeTitle);
      closeBtn.setAttribute("aria-label", s.closeTitle);
    }
    if (greetingMsg && !greetingMsg.dataset.greetingSet) {
      greetingMsg.innerHTML = s.greeting + '<div class="chatbot-msg-time" id="chatbot-init-time"></div>';
      greetingMsg.dataset.greetingSet = "1";
    }
    if (greetingMsg && greetingMsg.dataset.greetingSet) {
      greetingMsg.innerHTML = s.greeting + '<div class="chatbot-msg-time">' + nowLabel() + "</div>";
    }
    renderQuickQuestions();
  }

  var container = document.createElement("div");
  container.id = "chatbot-root";
  container.style.display = "contents";
  var lang = getLang();
  var s = strings[lang];
  container.innerHTML = [
    '<link rel="stylesheet" href="/css/chatbot.css">',
    '<button class="chatbot-btn" id="chatbot-toggle" aria-label="' + s.toggleLabel + '">',
    '  <img src="/images/chatbot_minibar.png" alt="Ayuda" class="chatbot-btn-img" />',
    "</button>",
    '<div class="chatbot-panel" id="chatbot-panel">',
    '  <div class="chatbot-header">',
    '    <div class="chatbot-header-left">',
    '      <div class="chatbot-header-avatar">',
    '        <i class="ph-light ph-headset"></i>',
    "      </div>",
    "      <div>",
    "        <h3>" + s.title + "</h3>",
    "        <p>" + s.subtitle + "</p>",
    "      </div>",
    "    </div>",
    '    <div class="chatbot-header-actions">',
    '      <button class="chatbot-header-btn" id="chatbot-clear" title="' + s.clearTitle + '" aria-label="' + s.clearTitle + '">',
    '        <i class="ph-light ph-trash"></i>',
    "      </button>",
    '      <button class="chatbot-header-btn" id="chatbot-close" title="' + s.closeTitle + '" aria-label="' + s.closeTitle + '">',
    '        <i class="ph-light ph-x"></i>',
    "      </button>",
    "    </div>",
    "  </div>",
    '  <div class="chatbot-messages" id="chatbot-messages">',
    '    <div class="chatbot-msg bot">',
    "      " + s.greeting + '<div class="chatbot-msg-time" id="chatbot-init-time"></div>',
    "    </div>",
    '    <div class="chatbot-typing" id="chatbot-typing">',
    '      <div class="chatbot-typing-dot"></div>',
    '      <div class="chatbot-typing-dot"></div>',
    '      <div class="chatbot-typing-dot"></div>',
    "    </div>",
    "  </div>",
    '  <div class="chatbot-questions" id="chatbot-questions"></div>',
    '  <div class="chatbot-input-area">',
    '    <input class="chatbot-input" id="chatbot-input" type="text" placeholder="' + s.placeholder + '" />',
    '    <button class="chatbot-send" id="chatbot-send" aria-label="' + s.sendLabel + '">',
    '      <i class="ph-light ph-paper-plane-right"></i>',
    "    </button>",
    "  </div>",
    "</div>"
  ].join("\n");
  document.body.appendChild(container);

  var toggle = document.getElementById("chatbot-toggle");
  var panel = document.getElementById("chatbot-panel");
  var close = document.getElementById("chatbot-close");
  var clear = document.getElementById("chatbot-clear");
  var messages = document.getElementById("chatbot-messages");
  var input = document.getElementById("chatbot-input");
  var send = document.getElementById("chatbot-send");
  var questionsContainer = document.getElementById("chatbot-questions");
  var typing = document.getElementById("chatbot-typing");
  var initTime = document.getElementById("chatbot-init-time");

  initTime.textContent = nowLabel();

  function renderQuickQuestions() {
    questionsContainer.innerHTML = "";
    var count = Math.min(FAQ.length, 4);
    for (var i = 0; i < count; i++) {
      var btn = document.createElement("button");
      btn.className = "chatbot-question-btn";
      btn.textContent = FAQ[i].q.length > 40 ? FAQ[i].q.substring(0, 40) + "..." : FAQ[i].q;
      btn.addEventListener("click", function (text) {
        return function () { handleUserMessage(text); };
      }(FAQ[i].q));
      questionsContainer.appendChild(btn);
    }
  }

  function nowLabel() {
    var lang = getLang();
    var locale = lang === "en" ? "en-US" : "es-CO";
    return new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  function addMessage(text, type) {
    var div = document.createElement("div");
    div.className = "chatbot-msg " + type;
    div.innerHTML = text + '<div class="chatbot-msg-time">' + nowLabel() + "</div>";
    messages.insertBefore(div, typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping(show) {
    typing.classList.toggle("visible", show);
    if (show) messages.scrollTop = messages.scrollHeight;
  }

  function findAnswer(query) {
    var q = query.toLowerCase().trim();
    var best = null;
    var bestScore = 0;

    for (var i = 0; i < FAQ.length; i++) {
      var faq = FAQ[i];
      var keywords = faq.q.toLowerCase();
      var score = 0;
      var words = q.split(/\s+/);

      for (var j = 0; j < words.length; j++) {
        if (words[j].length < 3) continue;
        if (keywords.indexOf(words[j]) !== -1) score += 2;
      }

      if (q.indexOf(keywords) !== -1 || keywords.indexOf(q) !== -1) score += 5;

      if (score > bestScore) {
        bestScore = score;
        best = faq;
      }
    }

    return best;
  }

  function getCurrentQuestions() {
    var lang = getLang();
    return lang === "en" ? FAQ_EN_QUESTIONS : FAQ_ES_QUESTIONS;
  }

  function handleUserMessage(text) {
    var msg = String(text || "").trim();
    if (!msg) return;

    addMessage(msg, "user");
    input.value = "";

    showTyping(true);

    var answer = findAnswer(msg);
    setTimeout(function () {
      showTyping(false);
      if (answer && answer.a) {
        addMessage(answer.a, "bot");
      } else {
        var questions = getCurrentQuestions();
        var suggestions = [];
        for (var i = 0; i < questions.length; i++) {
          suggestions.push(questions[i]);
        }
        var lang = getLang();
        var notFoundMsg = strings[lang].notFound.replace("{q}", msg);
        addMessage(notFoundMsg + "  " + suggestions.join(".<br>  ") + ".", "bot");
      }
    }, 800);
  }

  function clearConversation() {
    var botMessages = messages.querySelectorAll(".chatbot-msg");
    for (var i = 1; i < botMessages.length; i++) {
      botMessages[i].remove();
    }
    var lang = getLang();
    var firstMsg = messages.querySelector(".chatbot-msg.bot");
    if (firstMsg) {
      firstMsg.innerHTML = strings[lang].greeting + '<div class="chatbot-msg-time">' + nowLabel() + "</div>";
    }
    showTyping(false);
  }

  function togglePanel(open) {
    if (open === undefined) {
      panel.classList.toggle("open");
    } else if (open) {
      panel.classList.add("open");
    } else {
      panel.classList.remove("open");
    }
  }

  toggle.addEventListener("click", function () {
    togglePanel();
    if (panel.classList.contains("open")) renderQuickQuestions();
  });

  close.addEventListener("click", function () { togglePanel(false); });
  clear.addEventListener("click", clearConversation);

  send.addEventListener("click", function () { handleUserMessage(input.value); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") handleUserMessage(input.value);
  });

  // Listen for language changes
  var origSetLang = window.setLanguage;
  if (origSetLang) {
    window.setLanguage = function (lang) {
      origSetLang(lang);
      updateLanguage();
    };
  }
})();
