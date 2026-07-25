require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "minibar_app",
    multipleStatements: true
  });

  try {
    await conn.query(
      "ALTER TABLE minibar_movements MODIFY COLUMN movement_type ENUM('consumption','restock','adjustment','void','perdida','dano') NOT NULL"
    );
    console.log("OK: new loss types added to movement_type ENUM");
  } catch (e) {
    console.log("Note:", e.message);
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS minibar_loss_records (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        room_id INT(10) UNSIGNED NOT NULL,
        floor_id INT(10) UNSIGNED NOT NULL,
        user_id INT(10) UNSIGNED DEFAULT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        notes TEXT DEFAULT NULL,
        registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (floor_id) REFERENCES floors(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: minibar_loss_records table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS minibar_loss_record_items (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        minibar_loss_record_id INT(10) UNSIGNED NOT NULL,
        product_id INT(10) UNSIGNED NOT NULL,
        product_name VARCHAR(100) NOT NULL,
        category_name VARCHAR(50) NOT NULL,
        loss_type ENUM('perdida','dano') NOT NULL,
        quantity INT(10) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        total_price DECIMAL(12,2) NOT NULL,
        notes TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (minibar_loss_record_id) REFERENCES minibar_loss_records(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES minibar_products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: minibar_loss_record_items table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Add status column if missing
  try {
    await conn.query("ALTER TABLE minibar_loss_records ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pendiente' AFTER total_amount");
    console.log("OK: status column added to minibar_loss_records");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Update loss_type ENUM if needed
  try {
    await conn.query(
      "ALTER TABLE minibar_loss_record_items MODIFY COLUMN loss_type ENUM('perdida','dano') NOT NULL"
    );
    console.log("OK: loss_type ENUM updated in minibar_loss_record_items");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Add expiration_date to room_minibar_inventory
  try {
    await conn.query(
      "ALTER TABLE room_minibar_inventory ADD COLUMN expiration_date DATE DEFAULT NULL AFTER quantity"
    );
    console.log("OK: expiration_date column added to room_minibar_inventory");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Create notifications table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        product_name VARCHAR(100) NOT NULL,
        room_id INT(10) UNSIGNED NOT NULL,
        floor_id INT(10) UNSIGNED NOT NULL,
        room_number VARCHAR(20) NOT NULL,
        floor_name VARCHAR(100) NOT NULL,
        expiration_date DATE NOT NULL,
        days_remaining INT(10) NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_is_read (is_read),
        KEY idx_floor (floor_id),
        KEY idx_room (room_id),
        KEY idx_expiration (expiration_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: notifications table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Create audit_logs table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT(10) UNSIGNED DEFAULT NULL,
        user_name VARCHAR(150) DEFAULT NULL,
        user_role VARCHAR(50) DEFAULT NULL,
        module_name VARCHAR(100) NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        action_description TEXT DEFAULT NULL,
        floor_id INT(10) UNSIGNED DEFAULT NULL,
        room_id INT(10) UNSIGNED DEFAULT NULL,
        product_id INT(10) UNSIGNED DEFAULT NULL,
        previous_data JSON DEFAULT NULL,
        new_data JSON DEFAULT NULL,
        quantity_before DECIMAL(12,2) DEFAULT NULL,
        quantity_after DECIMAL(12,2) DEFAULT NULL,
        amount DECIMAL(12,2) DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        device_info VARCHAR(255) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'success',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_id (user_id),
        KEY idx_module_name (module_name),
        KEY idx_action_type (action_type),
        KEY idx_floor_id (floor_id),
        KEY idx_room_id (room_id),
        KEY idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: audit_logs table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // Add image_url to minibar_products
  try {
    await conn.query(
      "ALTER TABLE minibar_products ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER display_order"
    );
    console.log("OK: image_url column added to minibar_products");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // ============================================================
  // TENANTS (multi-tenant support)
  // ============================================================
  try {
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
        font_family VARCHAR(100) DEFAULT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: tenants table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // ============================================================
  // Add tenant_id to existing tables
  // ============================================================

  var tenantTables = [
    { table: "users", ref: "id" },
    { table: "floors", ref: "id" },
    { table: "rooms", ref: "id" },
    { table: "minibar_categories", ref: "id" },
    { table: "minibar_products", ref: "id" },
    { table: "room_minibar_inventory", ref: "id" },
    { table: "minibar_movements", ref: "id" },
    { table: "products", ref: "id" },
    { table: "consumptions", ref: "id" },
    { table: "consumption_items", ref: "id" },
    { table: "minibar_loss_records", ref: "id" },
    { table: "minibar_loss_record_items", ref: "id" },
    { table: "notifications", ref: "id" },
    { table: "audit_logs", ref: "id" },
  ];

  for (var t of tenantTables) {
    try {
      await conn.query(
        "ALTER TABLE " + t.table + " ADD COLUMN tenant_id INT(10) UNSIGNED DEFAULT 1 AFTER " + t.ref
      );
      console.log("OK: tenant_id added to " + t.table);
    } catch (e) {
      console.log("Note: tenant_id in " + t.table + " - " + e.message);
    }
  }

  // Change floors UNIQUE KEY from (floor_number) to (tenant_id, floor_number)
  try {
    await conn.query("ALTER TABLE floors DROP INDEX floor_number");
    await conn.query("ALTER TABLE floors ADD UNIQUE KEY floor_number (tenant_id, floor_number)");
    console.log("OK: floors UNIQUE KEY updated to (tenant_id, floor_number)");
  } catch (e) {
    console.log("Note: floors unique key - " + e.message);
  }

  // ============================================================
  // PLANS & SUBSCRIPTIONS (FASE 5)
  // ============================================================
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL,
        slug VARCHAR(50) NOT NULL,
        description VARCHAR(255) DEFAULT NULL,
        max_rooms INT(10) NOT NULL DEFAULT 0,
        max_users INT(10) NOT NULL DEFAULT 0,
        max_floors INT(10) NOT NULL DEFAULT 0,
        max_products INT(10) NOT NULL DEFAULT 0,
        max_brands INT(10) NOT NULL DEFAULT 1,
        price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
        features JSON DEFAULT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: plans table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT(10) UNSIGNED NOT NULL,
        plan_id INT(10) UNSIGNED NOT NULL,
        status ENUM('active','past_due','canceled','trialing') NOT NULL DEFAULT 'active',
        current_period_start DATE NOT NULL,
        current_period_end DATE NOT NULL,
        billing_day TINYINT(2) NOT NULL DEFAULT 1,
        trial_ends_at DATE DEFAULT NULL,
        canceled_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY tenant_id (tenant_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: tenant_subscriptions table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT(10) UNSIGNED NOT NULL,
        subscription_id INT(10) UNSIGNED NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'COP',
        status ENUM('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        due_date DATE NOT NULL,
        paid_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_id (tenant_id),
        KEY idx_status (status),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: billing_invoices table created");
  } catch (e) {
    console.log("Note:", e.message);
  }

  // ============================================================
  // CURRENCY support for tenants
  // ============================================================
  try {
    await conn.query("ALTER TABLE tenants ADD COLUMN currency VARCHAR(3) DEFAULT 'COP' AFTER brand_name");
    console.log("OK: currency column added to tenants");
  } catch (e) {
    console.log("Note: currency in tenants - " + e.message);
  }

  // ============================================================
  // Generic notifications support (title, message, type)
  // ============================================================
  try {
    await conn.query("ALTER TABLE notifications ADD COLUMN title VARCHAR(100) DEFAULT NULL AFTER product_name");
    console.log("OK: title column added to notifications");
  } catch (e) {
    console.log("Note: title in notifications - " + e.message);
  }
  try {
    await conn.query("ALTER TABLE notifications ADD COLUMN message TEXT DEFAULT NULL AFTER title");
    console.log("OK: message column added to notifications");
  } catch (e) {
    console.log("Note: message in notifications - " + e.message);
  }
  try {
    await conn.query("ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'expiration' AFTER is_read");
    console.log("OK: type column added to notifications");
  } catch (e) {
    console.log("Note: type in notifications - " + e.message);
  }
  try {
    await conn.query("ALTER TABLE notifications ADD COLUMN reference_id INT(10) UNSIGNED DEFAULT NULL AFTER type");
    console.log("OK: reference_id column added to notifications");
  } catch (e) {
    console.log("Note: reference_id in notifications - " + e.message);
  }
  try {
    await conn.query("ALTER TABLE notifications ADD COLUMN tenant_id INT(10) UNSIGNED DEFAULT NULL AFTER reference_id");
    console.log("OK: tenant_id column added to notifications");
  } catch (e) {
    console.log("Note: tenant_id in notifications - " + e.message);
  }

  // ============================================================
  // LOW STOCK threshold for products
  // ============================================================
  try {
    await conn.query("ALTER TABLE minibar_products ADD COLUMN min_stock INT(10) NOT NULL DEFAULT 2 AFTER default_quantity");
    console.log("OK: min_stock column added to minibar_products");
  } catch (e) {
    console.log("Note: min_stock in minibar_products - " + e.message);
  }

  // ============================================================
  // LOW STOCK notification type support
  // ============================================================
  try {
    await conn.query("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(50) DEFAULT 'expiration'");
    console.log("OK: notifications.type expanded for low_stock");
  } catch (e) {
    console.log("Note: notifications.type - " + e.message);
  }

  // ============================================================
  // PUSH SUBSCRIPTIONS for Web Push notifications
  // ============================================================
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT(10) UNSIGNED DEFAULT 1,
        user_id INT(10) UNSIGNED DEFAULT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY endpoint (endpoint(255)),
        KEY idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: push_subscriptions table created");
  } catch (e) {
    console.log("Note: push_subscriptions - " + e.message);
  }

  try {
    await conn.query("ALTER TABLE tenants ADD COLUMN font_family VARCHAR(100) DEFAULT NULL AFTER brand_name");
    console.log("OK: font_family column added to tenants");
  } catch (e) {
    console.log("Note: font_family in tenants - " + e.message);
  }

  // ============================================================
  // CLEANUP: Reset all expiration dates and notifications (data cleanup)
  // ============================================================
  try {
    const [[{ count }]] = await conn.query(
      "SELECT COUNT(*) AS count FROM room_minibar_inventory WHERE expiration_date IS NOT NULL"
    );
    if (count > 0) {
      await conn.query("UPDATE room_minibar_inventory SET expiration_date = NULL WHERE expiration_date IS NOT NULL");
      console.log("OK: Cleared " + count + " expiration_date(s) from room_minibar_inventory");
    } else {
      console.log("Note: No expiration_date values to clear");
    }
  } catch (e) {
    console.log("Note: cleanup expiration_date - " + e.message);
  }

  try {
    const [[{ count }]] = await conn.query("SELECT COUNT(*) AS count FROM notifications WHERE type IN ('low_stock', 'expiration')");
    if (count > 0) {
      await conn.query("DELETE FROM notifications WHERE type IN ('low_stock', 'expiration')");
      console.log("OK: Deleted " + count + " low_stock/expiration notification(s)");
    } else {
      console.log("Note: No low_stock/expiration notifications to delete");
    }
  } catch (e) {
    console.log("Note: cleanup notifications - " + e.message);
  }

  // ============================================================
  // OFFLINE MODE + DEFAULT MIN STOCK for tenants
  // ============================================================
  try {
    await conn.query("ALTER TABLE tenants ADD COLUMN offline_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER active");
    console.log("OK: offline_mode column added to tenants");
  } catch (e) {
    console.log("Note: offline_mode in tenants - " + e.message);
  }

  try {
    await conn.query("ALTER TABLE tenants ADD COLUMN default_min_stock INT(10) NOT NULL DEFAULT 1 AFTER currency");
    console.log("OK: default_min_stock column added to tenants");
  } catch (e) {
    console.log("Note: default_min_stock in tenants - " + e.message);
  }

  // ============================================================
  // OFFLINE SYNC QUEUE table
  // ============================================================
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS offline_sync_queue (
        id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT(10) UNSIGNED NOT NULL,
        user_id INT(10) UNSIGNED DEFAULT NULL,
        user_name VARCHAR(150) DEFAULT NULL,
        operation_type ENUM('consumption','restock','adjustment') NOT NULL,
        payload JSON NOT NULL,
        status ENUM('pending','synced','failed') NOT NULL DEFAULT 'pending',
        error_message TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced_at DATETIME DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_tenant_status (tenant_id, status),
        KEY idx_status (status),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("OK: offline_sync_queue table created");
  } catch (e) {
    console.log("Note: offline_sync_queue - " + e.message);
  }

  await conn.end();
}

migrate().catch(console.error);
