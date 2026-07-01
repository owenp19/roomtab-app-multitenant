require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

async function seed() {
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "minibar_app";

  const conn = await mysql.createConnection({ host, port, user, password });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${database}\``);

  // ============================================================
  // USERS
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(30) DEFAULT NULL,
      avatar_url VARCHAR(255) DEFAULT NULL,
      role ENUM('operator','admin','super_admin') NOT NULL DEFAULT 'operator',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add columns if they don't exist (for existing databases)
  try {
    await conn.query("ALTER TABLE users ADD COLUMN phone VARCHAR(30) DEFAULT NULL AFTER password_hash");
  } catch (e) { /* column may already exist */ }
  try {
    await conn.query("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) DEFAULT NULL AFTER phone");
  } catch (e) { /* column may already exist */ }

  const hash = await bcrypt.hash("minibar123", 12);

  // Verificar si el nuevo usuario ya existe
  const [[{ cnt }]] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM users WHERE email = 'minibar@roomtab.com'"
  );

  if (cnt > 0) {
    // Solo actualizar contraseña y nombre
    await conn.query(
      "UPDATE users SET password_hash = ?, role = 'admin', full_name = 'Minibar Operator' WHERE email = ?",
      [hash, "minibar@roomtab.com"]
    );
    console.log("  ✓ Contraseña actualizada para minibar@roomtab.com");
  } else {
    try {
      await conn.query(
        "INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, 'admin', 1)",
        ["Minibar Operator", "minibar@roomtab.com", hash]
      );
      console.log("  ✓ Usuario creado: minibar@roomtab.com");
    } catch (e) {
      // Si el INSERT falla (ej. duplicate), actualizar el existente
      await conn.query(
        "UPDATE users SET password_hash = ?, role = 'admin', full_name = 'Minibar Operator' WHERE email = ?",
        [hash, "minibar@roomtab.com"]
      );
      console.log("  ✓ Usuario actualizado: minibar@roomtab.com");
    }
  }

  // ============================================================
  // TENANTS
  // ============================================================
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(50) NOT NULL,
      primary_color VARCHAR(7) NOT NULL DEFAULT '#0B2E59',
      secondary_color VARCHAR(7) NOT NULL DEFAULT '#C89B3C',
      logo_url VARCHAR(500) DEFAULT NULL,
      hero_image_url VARCHAR(500) DEFAULT NULL,
      brand_name VARCHAR(100) NOT NULL DEFAULT 'Minibar MS',
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  var [[{ count: tenantCount }]] = await conn.query("SELECT COUNT(*) AS count FROM tenants");
  if (tenantCount === 0) {
    await conn.query(
      "INSERT INTO tenants (name, slug, brand_name, logo_url, hero_image_url) VALUES (?, ?, ?, ?, ?)",
      ["Hotel Minibar", "default", "Minibar MS", "/images/roomtab-logo-white.png", "/images/minibar.jpg"]
    );
    console.log("  ✓ Tenant por defecto creado");
  } else {
    console.log("  - Tenants ya existen");
  }

  var [[defaultTenant]] = await conn.query("SELECT id FROM tenants ORDER BY id ASC LIMIT 1");
  var defaultTenantId = defaultTenant ? defaultTenant.id : 1;

  // Super admin: owen@roomtab.com / 12345678
  const superHash = await bcrypt.hash("12345678", 12);
  const [[{ superCnt }]] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM users WHERE email = 'owen@roomtab.com'"
  );
  if (superCnt > 0) {
    await conn.query(
      "UPDATE users SET password_hash = ?, role = 'super_admin', full_name = 'Owen Pusey', is_active = 1, tenant_id = ? WHERE email = ?",
      [superHash, defaultTenantId, "owen@roomtab.com"]
    );
    console.log("  ✓ Contraseña actualizada para owen@roomtab.com");
  } else {
    try {
      await conn.query(
        "INSERT IGNORE INTO users (full_name, email, password_hash, role, is_active, tenant_id) VALUES (?, ?, ?, 'super_admin', 1, ?)",
        ["Owen Pusey", "owen@roomtab.com", superHash, defaultTenantId]
      );
      var [[{ saCnt }]] = await conn.query(
        "SELECT COUNT(*) AS cnt FROM users WHERE email = 'owen@roomtab.com'"
      );
      if (saCnt === 0) {
        // Fallback sin tenant_id
        await conn.query(
          "INSERT IGNORE INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, 'super_admin', 1)",
          ["Owen Pusey", "owen@roomtab.com", superHash]
        );
      }
    } catch (e) {
      // Último recurso: actualizar si el INSERT falló
      await conn.query(
        "UPDATE users SET password_hash = ?, role = 'super_admin', full_name = 'Owen Pusey', is_active = 1 WHERE email = ?",
        [superHash, "owen@roomtab.com"]
      );
    }
    console.log("  ✓ Super admin creado: owen@roomtab.com");
  }

  // ============================================================
  // PRODUCTS (for consumption module)
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(150) NOT NULL,
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[{ count: productCount }]] = await conn.query("SELECT COUNT(*) AS count FROM products");
  if (productCount === 0) {
    const products = [
      ["Agua sin gas 500ml", 5000],
      ["Agua con gas 500ml", 5500],
      ["Gaseosa Cola 355ml", 7000],
      ["Gaseosa Naranja 355ml", 7000],
      ["Cerveza Rubia 330ml", 9000],
      ["Cerveza Negra 330ml", 9500],
      ["Jugo Natural 350ml", 8000],
      ["Jugo de Naranja 350ml", 8000],
      ["Vino Tinto Copa", 15000],
      ["Vino Blanco Copa", 15000],
      ["Whisky 50ml", 25000],
      ["Ron 50ml", 18000],
      ["Vodka 50ml", 20000],
      ["Chocolate Caliente", 6000],
      ["Café Premium", 5000],
      ["Té Selección", 4500],
      ["Mani Salado 100g", 4000],
      ["Papas Fritas 120g", 4500],
      ["Almendras 100g", 8000],
      ["Barra de Cereal", 3500],
    ];
    for (const [name, price] of products) {
      await conn.query(
        "INSERT INTO products (name, price, active) VALUES (?, ?, 1)",
        [name, price]
      );
    }
    console.log("  ✓ Productos creados");
  } else {
    console.log("  - Productos ya existen");
  }

  // ============================================================
  // FLOORS (unified - merged from old pisos)
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS floors (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL,
      floor_number INT(10) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY floor_number (tenant_id, floor_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[{ count: floorCount }]] = await conn.query("SELECT COUNT(*) AS count FROM floors");
  if (floorCount === 0) {
    const floorData = [
      [1, "Piso 1"],
      [2, "Piso 2"],
      [3, "Piso 3"],
      [4, "Piso 4"],
      [5, "Piso 5"],
      [6, "Piso 6"]
    ];
    for (const [num, name] of floorData) {
      await conn.query("INSERT INTO floors (floor_number, name) VALUES (?, ?)", [num, name]);
    }
    console.log("  ✓ Pisos creados");
  } else {
    console.log("  - Pisos ya existen");
  }

  // ============================================================
  // ROOMS (unified - merged from old habitaciones)
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      room_number VARCHAR(10) NOT NULL,
      floor_id INT(10) UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (floor_id) REFERENCES floors(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[{ count: roomCount }]] = await conn.query("SELECT COUNT(*) AS count FROM rooms");
  if (roomCount === 0) {
    // rooms from old habitaciones (floors 1-3)
    for (let floorNum = 1; floorNum <= 3; floorNum++) {
      const [[floor]] = await conn.query("SELECT id FROM floors WHERE floor_number = ? LIMIT 1", [floorNum]);
      if (!floor) continue;
      for (let num = 1; num <= 8; num++) {
        const roomNum = `${floorNum}0${num.toString().padStart(2, "0")}`;
        await conn.query(
          "INSERT INTO rooms (room_number, floor_id) VALUES (?, ?)",
          [roomNum, floor.id]
        );
      }
    }

    // additional minibar rooms (floors 2-6)
    const extraRoomData = {
      2: [205, 207, 209, 213, 215, 216, 217, 218, 219, 220, 221, 222],
      3: [301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322],
      4: [402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422],
      5: [501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522],
      6: [601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621]
    };
    const [floors] = await conn.query("SELECT id, floor_number FROM floors");
    const floorMap = {};
    for (const f of floors) {
      floorMap[f.floor_number] = f.id;
    }
    for (const [floorNum, rooms] of Object.entries(extraRoomData)) {
      const floorId = floorMap[floorNum];
      if (!floorId) continue;
      for (const roomNum of rooms) {
        // avoid duplicates
        const [[existing]] = await conn.query(
          "SELECT id FROM rooms WHERE room_number = ? AND floor_id = ? LIMIT 1",
          [String(roomNum), floorId]
        );
        if (!existing) {
          await conn.query(
            "INSERT INTO rooms (room_number, floor_id) VALUES (?, ?)",
            [String(roomNum), floorId]
          );
        }
      }
    }
    console.log("  ✓ Habitaciones creadas");
  } else {
    console.log("  - Habitaciones ya existen");
  }

  // ============================================================
  // CONSUMPTIONS
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS consumptions (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id INT(10) UNSIGNED NOT NULL,
      note TEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      consumption_date DATETIME DEFAULT NULL,
      PRIMARY KEY (id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS consumption_items (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      consumption_id INT(10) UNSIGNED NOT NULL,
      product_id INT(10) UNSIGNED NOT NULL,
      quantity INT(10) NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      FOREIGN KEY (consumption_id) REFERENCES consumptions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // MINIBAR MANAGEMENT TABLES
  // ============================================================

  await conn.query(`
    CREATE TABLE IF NOT EXISTS minibar_categories (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL,
      display_order INT(10) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS minibar_products (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      category_id INT(10) UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      default_quantity INT(10) NOT NULL DEFAULT 1,
      display_order INT(10) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (category_id) REFERENCES minibar_categories(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add price column if missing (for existing databases)
  try {
    await conn.query("ALTER TABLE minibar_products ADD COLUMN price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER name");
  } catch (e) { /* column may already exist */ }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS room_minibar_inventory (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id INT(10) UNSIGNED NOT NULL,
      product_id INT(10) UNSIGNED NOT NULL,
      quantity INT(10) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY room_product (room_id, product_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (product_id) REFERENCES minibar_products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Minibar movements table for tracking all inventory changes
  await conn.query(`
    CREATE TABLE IF NOT EXISTS minibar_movements (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id INT(10) UNSIGNED NOT NULL,
      product_id INT(10) UNSIGNED NOT NULL,
      movement_type ENUM('consumption','restock','adjustment','void') NOT NULL,
      quantity_before INT(10) NOT NULL,
      quantity_moved INT(10) NOT NULL,
      quantity_after INT(10) NOT NULL,
      user_id INT(10) UNSIGNED DEFAULT NULL,
      user_name VARCHAR(100) DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (product_id) REFERENCES minibar_products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed minibar categories
  const [[{ count: catCount }]] = await conn.query("SELECT COUNT(*) AS count FROM minibar_categories");
  let canastaId, neveraId;
  if (catCount === 0) {
    const catRes = await conn.query(
      "INSERT INTO minibar_categories (name, display_order) VALUES ('Canasta', 1), ('Nevera', 2)"
    );
    canastaId = catRes[0].insertId;
    neveraId = canastaId + 1;
    console.log("  ✓ Categorías de minibar creadas");
  } else {
    const [[canasta]] = await conn.query("SELECT id FROM minibar_categories WHERE name = 'Canasta' LIMIT 1");
    const [[nevera]] = await conn.query("SELECT id FROM minibar_categories WHERE name = 'Nevera' LIMIT 1");
    canastaId = canasta.id;
    neveraId = nevera.id;
    console.log("  - Categorías de minibar ya existen");
  }

  // Seed minibar products
  const [[{ count: prodCount }]] = await conn.query("SELECT COUNT(*) AS count FROM minibar_products");
  if (prodCount === 0) {
    const canastaProducts = [
      ["Chiclets Trident", 15000, 1, 1],
      ["Salchichas Viena", 13000, 1, 2],
      ["Aceitunas", 25000, 1, 3],
      ["Monterrojo", 18000, 1, 4],
      ["Pringles", 16000, 1, 5],
      ["Combo Cheddar", 15000, 1, 6],
      ["Pistacho", 15000, 1, 7],
      ["Barra de proteína Zubu", 12000, 1, 8],
      ["Pretzels sal marina", 15000, 1, 9],
      ["Albaricoques deshidratados", 27000, 1, 10],
      ["Kinops", 15000, 2, 11],
      ["Gummis", 15000, 1, 12],
      ["Chocolate Mundial", 29000, 1, 13]
    ];
    for (const [name, price, qty, order] of canastaProducts) {
      await conn.query(
        "INSERT INTO minibar_products (category_id, name, price, default_quantity, display_order) VALUES (?, ?, ?, ?, ?)",
        [canastaId, name, price, qty, order]
      );
    }

    const neveraProducts = [
      ["Electronit", 25000, 2, 1],
      ["Agua Mineral", 12000, 2, 2],
      ["Agua con gas", 12000, 2, 3],
      ["Soda Júpiter", 18000, 1, 4],
      ["Júpiter Toronja", 16000, 1, 5],
      ["Júpiter Tónica", 5000, 1, 6],
      ["Red Bull", 17000, 1, 7],
      ["Coca Cola Clásica", 11000, 2, 8],
      ["Coca Cola Cero", 11000, 2, 9],
      ["Coronita", 11000, 2, 10],
      ["Club Colombia", 11000, 4, 11]
    ];
    for (const [name, price, qty, order] of neveraProducts) {
      await conn.query(
        "INSERT INTO minibar_products (category_id, name, price, default_quantity, display_order) VALUES (?, ?, ?, ?, ?)",
        [neveraId, name, price, qty, order]
      );
    }
    console.log("  ✓ Productos de minibar creados");
  } else {
    console.log("  - Productos de minibar ya existen");
  }

  // Seed initial inventory for each room
  const [[{ count: invCount }]] = await conn.query("SELECT COUNT(*) AS count FROM room_minibar_inventory");
  if (invCount === 0) {
    const [allRooms] = await conn.query("SELECT id FROM rooms");
    const [allProducts] = await conn.query("SELECT id, default_quantity FROM minibar_products WHERE is_active = 1");
    for (const room of allRooms) {
      for (const prod of allProducts) {
        await conn.query(
          "INSERT INTO room_minibar_inventory (room_id, product_id, quantity) VALUES (?, ?, ?)",
          [room.id, prod.id, prod.default_quantity]
        );
      }
    }
    console.log("  ✓ Inventario inicial de minibar creado para todas las habitaciones");
  } else {
    console.log("  - Inventario de minibar ya existe");
  }

  // ============================================================
  // PLANS
  // ============================================================
  var [[{ count: planCount }]] = await conn.query("SELECT COUNT(*) AS count FROM plans");
  if (planCount === 0) {
    var plans = [
      ["Starter", "starter", "Para hoteles peque\u00f1os", 10, 3, 1, 20, 1, 0, JSON.stringify({ auditLogs: false, whatsapp: false, reports: true })],
      ["Pro", "pro", "Para hoteles en crecimiento", 30, 10, 3, 50, 3, 29.99, JSON.stringify({ auditLogs: true, whatsapp: true, reports: true })],
      ["Enterprise", "enterprise", "Para grandes cadenas hoteleras", 999, 100, 20, 200, 10, 99.99, JSON.stringify({ auditLogs: true, whatsapp: true, reports: true, api: true, priority: true })],
    ];
    for (var pi = 0; pi < plans.length; pi++) {
      var p = plans[pi];
      await conn.query(
        "INSERT INTO plans (name, slug, description, max_rooms, max_users, max_floors, max_products, max_brands, price_monthly, features) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        p
      );
    }
    console.log("  Planes creados: Starter, Growth, Enterprise");
  } else {
    console.log("  - Planes ya existen");
  }

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================
  var [[{ count: subCount }]] = await conn.query("SELECT COUNT(*) AS count FROM tenant_subscriptions");
  if (subCount === 0) {
    var [[enterprisePlan]] = await conn.query("SELECT id FROM plans WHERE slug = 'enterprise' ORDER BY id ASC LIMIT 1");
    var planId = enterprisePlan ? enterprisePlan.id : 1;
    var today = new Date();
    var endOfYear = new Date(today.getFullYear() + 10, 11, 31);
    var fmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    await conn.query(
      "INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end, billing_day) VALUES (?, ?, 'active', ?, ?, ?)",
      [defaultTenantId, planId, fmt(today), fmt(endOfYear), today.getDate()]
    );
    console.log("  Subscripci\u00f3n Enterprise asignada al tenant default");
  } else {
    console.log("  - Subscripciones ya existen");
  }

  var tenantTables = [
    "users", "floors", "rooms", "minibar_categories", "minibar_products",
    "room_minibar_inventory", "minibar_movements", "products", "consumptions",
    "consumption_items", "minibar_loss_records", "minibar_loss_record_items",
    "notifications", "audit_logs"
  ];
  for (var t of tenantTables) {
    try {
      await conn.query(
        "UPDATE " + t + " SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = 0",
        [defaultTenantId]
      );
      console.log("  tenant_id actualizado en " + t);
    } catch (e) {
      /* column may not exist yet */
    }
  }

  await conn.end();
  console.log("\nSeed completado exitosamente");
}

seed().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});
