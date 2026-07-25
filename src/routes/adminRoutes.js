const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query, getDbPool } = require("../config/db");
const { logAudit, getClientIp, getDeviceInfo } = require("../auditLogger");

const router = express.Router();

// Multer config for product images
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "..", "public", "uploads", "products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = "prod_" + Date.now() + ext;
    cb(null, name);
  }
});

const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error("Formato no permitido. Usa JPG, PNG o WebP."));
  }
});

// ============ PRODUCT MANAGEMENT ============

// GET /api/admin/products — all minibar products
router.get("/products", async (req, res) => {
  try {
    const tid = req.tenantId;
    const rows = await query(
      `SELECT mp.id, mp.name, mp.price, mp.default_quantity, mp.min_stock, mp.display_order, mp.image_url, mp.is_active, mp.created_at,
              mc.id AS category_id, mc.name AS category_name
       FROM minibar_products mp
       JOIN minibar_categories mc ON mc.id = mp.category_id
       WHERE mp.tenant_id = ?
       ORDER BY mc.display_order ASC, mp.display_order ASC`,
      [tid]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching admin products:", err);
    res.status(500).json({ error: "Error al cargar productos" });
  }
});

// POST /api/admin/products — create product
router.post("/products", async (req, res) => {
  try {
    const { name, price, categoryId, defaultQuantity, displayOrder, minStock } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    if (!price || price < 0) return res.status(400).json({ error: "Precio inválido" });
    if (!categoryId) return res.status(400).json({ error: "Categoría es obligatoria" });

    // Plan enforcement
    var check = await planEnforcer.checkProductLimit(req.tenantId);
    if (!check.ok) return res.status(403).json({ error: check.message });

    var tid = req.tenantId;
    const result = await query(
      "INSERT INTO minibar_products (category_id, name, price, default_quantity, min_stock, display_order, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [categoryId, name.trim(), price, defaultQuantity || 1, minStock != null ? minStock : 2, displayOrder || 0, tid]
    );

    // Add to all existing rooms for this tenant
    const [rooms] = await getDbPool().query("SELECT id FROM rooms WHERE tenant_id = ?", [tid]);
    for (const room of rooms) {
      await query(
        "INSERT INTO room_minibar_inventory (room_id, product_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity",
        [room.id, result.insertId, defaultQuantity || 1]
      );
    }

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Productos",
      actionType: "product_created",
      actionDescription: "Creó el producto " + name.trim(),
      newData: { name: name.trim(), price, categoryId, defaultQuantity: defaultQuantity || 1 },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, id: result.insertId, message: "Producto creado y agregado a todas las habitaciones." });
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ error: "Error al crear producto" });
  }
});

// PUT /api/admin/products/:id — update product
router.put("/products/:id", async (req, res) => {
  try {
    const { name, price, categoryId, defaultQuantity, displayOrder, isActive, minStock } = req.body;
    const productId = req.params.id;

    const [oldRows] = await query("SELECT name, price, category_id, default_quantity, min_stock, is_active FROM minibar_products WHERE id = ? AND tenant_id = ?", [productId, req.tenantId]);
    const oldProduct = oldRows && oldRows[0] ? oldRows[0] : null;

    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(name.trim()); }
    if (price !== undefined) { sets.push("price = ?"); params.push(price); }
    if (categoryId !== undefined) { sets.push("category_id = ?"); params.push(categoryId); }
    if (defaultQuantity !== undefined) { sets.push("default_quantity = ?"); params.push(defaultQuantity); }
    if (minStock !== undefined) { sets.push("min_stock = ?"); params.push(minStock); }
    if (displayOrder !== undefined) { sets.push("display_order = ?"); params.push(displayOrder); }
    if (isActive !== undefined) { sets.push("is_active = ?"); params.push(isActive ? 1 : 0); }

    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

    params.push(productId);
    await query(`UPDATE minibar_products SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...params, req.tenantId]);

    const actionType = price !== undefined && (oldProduct && Number(oldProduct.price) !== Number(price)) ? "price_updated" : "product_updated";
    const actionDesc = actionType === "price_updated"
      ? "Actualizó el precio de " + (name || oldProduct?.name) + ": " + oldProduct?.price + " → " + price
      : "Editó el producto " + (name || oldProduct?.name);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Productos",
      actionType,
      actionDescription: actionDesc,
      productId: Number(productId),
      previousData: oldProduct ? { name: oldProduct.name, price: oldProduct.price, categoryId: oldProduct.category_id } : null,
      newData: { name: name?.trim(), price, categoryId },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, message: "Producto actualizado correctamente." });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// DELETE /api/admin/products/:id — soft-delete (set inactive)
router.delete("/products/:id", async (req, res) => {
  try {
    const [oldRows] = await query("SELECT name FROM minibar_products WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenantId]);
    await query("UPDATE minibar_products SET is_active = 0 WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenantId]);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Productos",
      actionType: "product_disabled",
      actionDescription: "Desactivó el producto " + (oldRows[0]?.name || "#" + req.params.id),
      productId: Number(req.params.id),
      previousData: oldRows[0] || null,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, message: "Producto desactivado correctamente." });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ error: "Error al desactivar producto" });
  }
});

// POST /api/admin/products/:id/image — upload product image
router.post("/products/:id/image", productUpload.single("image"), async (req, res) => {
  try {
    const productId = req.params.id;
    if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });

    const imageUrl = "/uploads/products/" + req.file.filename;

    // Delete old image if exists
    const rows = await query("SELECT image_url FROM minibar_products WHERE id = ? AND tenant_id = ?", [productId, req.tenantId]);
    const oldRow = rows[0];
    if (oldRow && oldRow.image_url) {
      const oldPath = path.join(__dirname, "..", "..", "public", oldRow.image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await query("UPDATE minibar_products SET image_url = ? WHERE id = ? AND tenant_id = ?", [imageUrl, productId, req.tenantId]);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Productos",
      actionType: "product_image_updated",
      actionDescription: "Actualizó la imagen del producto #" + productId,
      productId: Number(productId),
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, imageUrl, message: "Imagen actualizada correctamente." });
  } catch (err) {
    console.error("Error uploading product image:", err);
    res.status(500).json({ error: "Error al subir la imagen." });
  }
});

// DELETE /api/admin/products/:id/image — remove product image
router.delete("/products/:id/image", async (req, res) => {
  try {
    const productId = req.params.id;
    const rows = await query("SELECT image_url FROM minibar_products WHERE id = ? AND tenant_id = ?", [productId, req.tenantId]);
    const oldRow = rows[0];
    if (oldRow && oldRow.image_url) {
      const oldPath = path.join(__dirname, "..", "..", "public", oldRow.image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await query("UPDATE minibar_products SET image_url = NULL WHERE id = ? AND tenant_id = ?", [productId, req.tenantId]);
    res.json({ success: true, message: "Imagen eliminada." });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar la imagen." });
  }
});

// ============ CATEGORY MANAGEMENT ============

// GET /api/admin/categories
router.get("/categories", async (req, res) => {
  try {
    const rows = await query("SELECT id, name, display_order FROM minibar_categories ORDER BY display_order ASC");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Error al cargar categorías" });
  }
});

// POST /api/admin/categories
router.post("/categories", async (req, res) => {
  try {
    const { name, displayOrder } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    const result = await query(
      "INSERT INTO minibar_categories (name, display_order) VALUES (?, ?)",
      [name.trim(), displayOrder || 0]
    );
    res.json({ success: true, id: result.insertId, message: "Categoría creada correctamente." });
  } catch (err) {
    console.error("Error creating category:", err);
    res.status(500).json({ error: "Error al crear categoría" });
  }
});

// PUT /api/admin/categories/:id
router.put("/categories/:id", async (req, res) => {
  try {
    const { name, displayOrder } = req.body;
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(name.trim()); }
    if (displayOrder !== undefined) { sets.push("display_order = ?"); params.push(displayOrder); }
    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });
    params.push(req.params.id);
    await query(`UPDATE minibar_categories SET ${sets.join(", ")} WHERE id = ?`, params);
    res.json({ success: true, message: "Categoría actualizada correctamente." });
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ error: "Error al actualizar categoría" });
  }
});

// DELETE /api/admin/categories/:id
router.delete("/categories/:id", async (req, res) => {
  try {
    await query("DELETE FROM minibar_categories WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Categoría eliminada correctamente." });
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ error: "No se puede eliminar la categoría. Verifica que no tenga productos asociados." });
  }
});

// ============ FLOOR MANAGEMENT ============

// GET /api/admin/floors
router.get("/floors", async (req, res) => {
  try {
    const rows = await query(
      "SELECT f.id, f.name, f.floor_number, COUNT(r.id) AS room_count FROM floors f LEFT JOIN rooms r ON r.floor_id = f.id WHERE f.tenant_id = ? GROUP BY f.id ORDER BY f.floor_number ASC",
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching floors:", err);
    res.status(500).json({ error: "Error al cargar pisos" });
  }
});

// POST /api/admin/floors
router.post("/floors", async (req, res) => {
  try {
    const { name, floorNumber } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    if (!floorNumber) return res.status(400).json({ error: "El número de piso es obligatorio" });

    // Plan enforcement
    var check = await planEnforcer.checkFloorLimit(req.tenantId);
    if (!check.ok) return res.status(403).json({ error: check.message });

    var tid = req.tenantId;
    const result = await query(
      "INSERT INTO floors (name, floor_number, tenant_id) VALUES (?, ?, ?)",
      [name.trim(), floorNumber, tid]
    );
    res.json({ success: true, id: result.insertId, message: "Piso creado correctamente." });
  } catch (err) {
    console.error("Error creating floor:", err);
    res.status(500).json({ error: "Error al crear piso" });
  }
});

// PUT /api/admin/floors/:id
router.put("/floors/:id", async (req, res) => {
  try {
    const { name, floorNumber } = req.body;
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push("name = ?"); params.push(name.trim()); }
    if (floorNumber !== undefined) { sets.push("floor_number = ?"); params.push(floorNumber); }
    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });
    params.push(req.params.id, req.tenantId);
    await query(`UPDATE floors SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true, message: "Piso actualizado correctamente." });
  } catch (err) {
    console.error("Error updating floor:", err);
    res.status(500).json({ error: "Error al actualizar piso" });
  }
});

// DELETE /api/admin/floors/:id
router.delete("/floors/:id", async (req, res) => {
  try {
    await query("DELETE FROM floors WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenantId]);
    res.json({ success: true, message: "Piso eliminado correctamente." });
  } catch (err) {
    console.error("Error deleting floor:", err);
    res.status(500).json({ error: "No se puede eliminar el piso. Verifica que no tenga habitaciones asociadas." });
  }
});

// ============ ROOM MANAGEMENT ============

// GET /api/admin/rooms
router.get("/rooms", async (req, res) => {
  try {
    const rows = await query(
      "SELECT r.id, r.room_number, r.floor_id, f.name AS floor_name FROM rooms r JOIN floors f ON f.id = r.floor_id WHERE r.tenant_id = ? ORDER BY f.floor_number ASC, CAST(r.room_number AS UNSIGNED) ASC",
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ error: "Error al cargar habitaciones" });
  }
});

// POST /api/admin/rooms
router.post("/rooms", async (req, res) => {
  try {
    var { roomNumber, floorId } = req.body;
    if (!roomNumber || !roomNumber.trim()) return res.status(400).json({ error: "El número de habitación es obligatorio" });
    if (!floorId) return res.status(400).json({ error: "El piso es obligatorio" });

    // Plan enforcement
    var check = await planEnforcer.checkRoomLimit(req.tenantId);
    if (!check.ok) return res.status(403).json({ error: check.message });

    var tid = req.tenantId;
    const result = await query(
      "INSERT INTO rooms (room_number, floor_id, tenant_id) VALUES (?, ?, ?)",
      [roomNumber.trim(), floorId, tid]
    );

    // Add all active minibar products for this tenant to this room's inventory
    const products = await query("SELECT id, default_quantity FROM minibar_products WHERE is_active = 1 AND tenant_id = ?", [tid]);
    for (const prod of products) {
      await query(
        "INSERT INTO room_minibar_inventory (room_id, product_id, quantity) VALUES (?, ?, ?)",
        [result.insertId, prod.id, prod.default_quantity]
      );
    }

    res.json({ success: true, id: result.insertId, message: "Habitación creada con inventario inicial." });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ error: "Error al crear habitación" });
  }
});

// PUT /api/admin/rooms/:id
router.put("/rooms/:id", async (req, res) => {
  try {
    const { roomNumber, floorId } = req.body;
    const sets = [];
    const params = [];
    if (roomNumber !== undefined) { sets.push("room_number = ?"); params.push(roomNumber.trim()); }
    if (floorId !== undefined) { sets.push("floor_id = ?"); params.push(floorId); }
    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });
    params.push(req.params.id, req.tenantId);
    await query(`UPDATE rooms SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    res.json({ success: true, message: "Habitación actualizada correctamente." });
  } catch (err) {
    console.error("Error updating room:", err);
    res.status(500).json({ error: "Error al actualizar habitación" });
  }
});

// DELETE /api/admin/rooms/:id
router.delete("/rooms/:id", async (req, res) => {
  try {
    await query("DELETE FROM rooms WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenantId]);
    res.json({ success: true, message: "Habitación eliminada correctamente." });
  } catch (err) {
    console.error("Error deleting room:", err);
    res.status(500).json({ error: "No se puede eliminar la habitación. Verifica que no tenga movimientos asociados." });
  }
});

// ============ USER MANAGEMENT ============

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const tid = req.tenantId;
    const rows = await query(
      "SELECT id, full_name, email, phone, role, is_active, created_at FROM users WHERE tenant_id = ? AND role != 'super_admin' ORDER BY created_at DESC",
      [tid]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Error al cargar usuarios" });
  }
});

// POST /api/admin/users — create user
router.post("/users", async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    if (!fullName || !fullName.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    if (!email || !email.trim()) return res.status(400).json({ error: "El email es obligatorio" });
    if (!password || password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });

    // Plan enforcement
    var check = await planEnforcer.checkUserLimit(req.tenantId);
    if (!check.ok) return res.status(403).json({ error: check.message });

    var [existing] = await getDbPool().query("SELECT id FROM users WHERE email = ?", [email.trim()]);
    if (existing && existing.length > 0) return res.status(409).json({ error: "El email ya está registrado" });

    var tid = req.tenantId;
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      "INSERT INTO users (full_name, email, password_hash, role, is_active, tenant_id) VALUES (?, ?, ?, ?, 1, ?)",
      [fullName.trim(), email.trim(), hash, role || "operator", tid]
    );
    res.json({ success: true, id: result.insertId, message: "Usuario creado correctamente." });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// PUT /api/admin/users/:id
router.put("/users/:id", async (req, res) => {
  try {
    const { fullName, email, role, isActive, password } = req.body;
    const userId = req.params.id;
    const sets = [];
    const params = [];

    if (fullName !== undefined) { sets.push("full_name = ?"); params.push(fullName.trim()); }
    if (email !== undefined) { sets.push("email = ?"); params.push(email.trim()); }
    if (role !== undefined) { sets.push("role = ?"); params.push(role); }
    if (isActive !== undefined) { sets.push("is_active = ?"); params.push(isActive ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sets.push("password_hash = ?");
      params.push(hash);
    }

    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });
    params.push(userId);
    await query(`UPDATE users SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [userId, req.tenantId]);
    res.json({ success: true, message: "Usuario actualizado correctamente." });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req, res) => {
  try {
    await query("DELETE FROM users WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenantId]);
    res.json({ success: true, message: "Usuario eliminado correctamente." });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

// ============ MOVEMENT VOID ============

// POST /api/admin/movements/:id/void — void a movement and reverse inventory
router.post("/movements/:id/void", async (req, res) => {
  try {
    const movementId = req.params.id;
    const userName = req.session?.user?.fullName || "Admin";

    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [movRows] = await conn.query("SELECT mm.*, r.tenant_id FROM minibar_movements mm JOIN rooms r ON r.id = mm.room_id WHERE mm.id = ?", [movementId]);
      if (!movRows || movRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: "Movimiento no encontrado" });
      }

      const movement = movRows[0];

      if (String(movement.tenant_id) !== String(req.tenantId)) {
        await conn.rollback();
        return res.status(404).json({ error: "Movimiento no encontrado" });
      }

      if (movement.movement_type === "void") {
        await conn.rollback();
        return res.status(400).json({ error: "Este movimiento ya fue anulado" });
      }

      // Reverse: restore quantity_before
      const restoreQty = movement.quantity_before;

      await conn.query(
        "UPDATE room_minibar_inventory SET quantity = ? WHERE room_id = ? AND product_id = ?",
        [restoreQty, movement.room_id, movement.product_id]
      );

      // Record void movement
      const [prodRows] = await conn.query("SELECT name FROM minibar_products WHERE id = ?", [movement.product_id]);
      const productName = prodRows[0]?.name || "Producto";

      await conn.query(
        `INSERT INTO minibar_movements (room_id, product_id, movement_type, quantity_before, quantity_moved, quantity_after, user_id, user_name, notes)
         VALUES (?, ?, 'void', ?, ?, ?, ?, ?, ?)`,
        [movement.room_id, movement.product_id, movement.quantity_before, -movement.quantity_moved, restoreQty,
         req.session?.user?.id || null, userName,
         "Anulación del movimiento #" + movementId + " (" + productName + ")"]
      );

      await conn.commit();

      logAudit({
        userId: req.session?.user?.id,
        userName: req.session?.user?.fullName,
        userRole: req.session?.user?.role,
        moduleName: "Minibares",
        actionType: "record_voided",
        actionDescription: "Anuló movimiento #" + movementId + " (" + productName + ")",
        roomId: movement.room_id,
        floorId: movement.floor_id || null,
        productId: movement.product_id,
        quantityBefore: movement.quantity_before,
        quantityAfter: restoreQty,
        previousData: { movement },
        newData: { restoredQty: restoreQty },
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req)
      });

      res.json({ success: true, message: "Movimiento anulado correctamente. Inventario restaurado." });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("Error voiding movement:", err);
    res.status(500).json({ error: "Error al anular movimiento" });
  }
});

// ============ DASHBOARD ============

// GET /api/admin/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const tid = req.tenantId;
    const today = new Date();
    const todayStart = today.toISOString().split("T")[0] + " 00:00:00";
    const todayEnd = today.toISOString().split("T")[0] + " 23:59:59";

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split("T")[0] + " 00:00:00";

    // Today's consumption
    const [[todayConsumption]] = await getDbPool().query(
      `SELECT COUNT(*) AS movements, COALESCE(SUM(quantity_moved), 0) AS products,
              COALESCE(SUM(quantity_moved * mp.price), 0) AS total
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND mm.tenant_id = ?`,
      [todayStart, todayEnd, tid]
    );

    // Week consumption
    const [[weekConsumption]] = await getDbPool().query(
      `SELECT COUNT(*) AS movements, COALESCE(SUM(quantity_moved), 0) AS products,
              COALESCE(SUM(quantity_moved * mp.price), 0) AS total
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.tenant_id = ?`,
      [weekStartStr, tid]
    );

    // Total rooms
    const [[{ total: totalRooms }]] = await getDbPool().query("SELECT COUNT(*) AS total FROM rooms WHERE tenant_id = ?", [tid]);

    // Rooms with low stock (any product with quantity < min_stock)
    const [[{ total: lowStockRooms }]] = await getDbPool().query(
      `SELECT COUNT(DISTINCT rmi.room_id) AS total
       FROM room_minibar_inventory rmi
       JOIN minibar_products mp ON mp.id = rmi.product_id
       WHERE rmi.quantity < mp.min_stock AND mp.is_active = 1 AND rmi.tenant_id = ?`,
      [tid]
    );

    // Products that are agotado (quantity = 0)
    const [[{ total: agotadoCount }]] = await getDbPool().query(
      `SELECT COUNT(*) AS total
       FROM room_minibar_inventory rmi
       JOIN minibar_products mp ON mp.id = rmi.product_id
       WHERE rmi.quantity = 0 AND mp.is_active = 1 AND rmi.tenant_id = ?`,
      [tid]
    );

    // Recent movements (last 10 across all rooms)
    const recentMovements = await query(
      `SELECT mm.id, mm.movement_type, mm.quantity_moved, mm.user_name, mm.created_at,
              mp.name AS product_name, r.room_number, f.name AS floor_name
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       JOIN rooms r ON r.id = mm.room_id
       JOIN floors f ON f.id = r.floor_id
       WHERE mm.movement_type != 'void' AND r.tenant_id = ?
       ORDER BY mm.created_at DESC LIMIT 10`,
      [tid]
    );

    // Top consumed products today
    const topProducts = await query(
      `SELECT mp.name, SUM(mm.quantity_moved) AS total_qty,
              SUM(mm.quantity_moved * mp.price) AS total_amount
       FROM minibar_movements mm
       JOIN minibar_products mp ON mp.id = mm.product_id
       WHERE mm.movement_type = 'consumption' AND mm.created_at >= ? AND mm.created_at <= ? AND mm.tenant_id = ?
       GROUP BY mp.id, mp.name
       ORDER BY total_qty DESC LIMIT 5`,
      [todayStart, todayEnd, tid]
    );

    // Rooms with agotado products (room detail)
    const roomsWithAgotados = await query(
      `SELECT r.id, r.room_number, f.name AS floor_name,
              COUNT(rmi.product_id) AS agotados
       FROM room_minibar_inventory rmi
       JOIN rooms r ON r.id = rmi.room_id
       JOIN floors f ON f.id = r.floor_id
       JOIN minibar_products mp ON mp.id = rmi.product_id
       WHERE rmi.quantity = 0 AND mp.is_active = 1 AND r.tenant_id = ?
       GROUP BY r.id, r.room_number, f.name
       ORDER BY agotados DESC LIMIT 10`,
      [tid]
    );

    res.json({
      today: todayConsumption,
      week: weekConsumption,
      totalRooms,
      lowStockRoomCount: lowStockRooms,
      agotadoCount,
      recentMovements,
      topProducts,
      roomsWithAgotados
    });
  } catch (err) {
    console.error("Error fetching dashboard:", err);
    res.status(500).json({ error: "Error al cargar dashboard" });
  }
});

// ============ TENANT (SUPER-ADMIN) MANAGEMENT ============

var tenantStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    var dir = path.join(__dirname, "..", "..", "public", "uploads", "tenants");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname).toLowerCase();
    cb(null, "tenant_" + Date.now() + ext);
  }
});

var tenantUpload = multer({
  storage: tenantStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    var allowed = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
    var ext = path.extname(file.originalname).toLowerCase();
    if (allowed.indexOf(ext) !== -1) return cb(null, true);
    cb(new Error("Formato no permitido. Usa JPG, PNG, WebP o SVG."));
  }
});

// GET /api/admin/tenants — list all
router.get("/tenants", async function (req, res) {
  try {
    var rows = await query(
      `SELECT t.id, t.name, t.slug, t.primary_color, t.secondary_color, t.logo_url, t.hero_image_url, t.brand_name, t.active, t.created_at,
              t.offline_mode, t.default_min_stock,
              ts.plan_id, p.name AS plan_name,
              (SELECT COUNT(*) FROM rooms WHERE tenant_id = t.id) AS room_count,
              (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) AS user_count
       FROM tenants t
       LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status = 'active'
       LEFT JOIN plans p ON p.id = ts.plan_id
       ORDER BY t.id ASC`
    );
    rows.forEach(function (t) { t.active = !!t.active; });
    res.json(rows);
  } catch (err) {
    console.error("Error fetching tenants:", err);
    res.status(500).json({ error: "Error al cargar hoteles" });
  }
});

// POST /api/admin/tenants — create
router.post("/tenants", async function (req, res) {
  try {
    var { name, slug, brandName, primaryColor, secondaryColor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
    if (!slug || !slug.trim()) return res.status(400).json({ error: "El slug es obligatorio" });

    var [existing] = await getDbPool().query("SELECT id FROM tenants WHERE slug = ?", [slug.trim()]);
    if (existing && existing.length > 0) return res.status(409).json({ error: "El slug ya está en uso" });

    var result = await query(
      "INSERT INTO tenants (name, slug, brand_name, primary_color, secondary_color) VALUES (?, ?, ?, ?, ?)",
      [name.trim(), slug.trim().toLowerCase(), brandName || name.trim(), primaryColor || "#0B2E59", secondaryColor || "#C89B3C"]
    );

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Tenants",
      actionType: "tenant_created",
      actionDescription: "Creó el hotel " + name.trim(),
      newData: { name: name.trim(), slug: slug.trim(), brandName, primaryColor, secondaryColor },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, id: result.insertId, message: "Hotel creado correctamente." });
  } catch (err) {
    console.error("Error creating tenant:", err);
    res.status(500).json({ error: "Error al crear hotel" });
  }
});

// PUT /api/admin/tenants/:id — update
router.put("/tenants/:id", async function (req, res) {
  try {
    var { name, slug, brandName, primaryColor, secondaryColor, offlineMode, defaultMinStock } = req.body;
    var tenantId = req.params.id;
    var sets = [];
    var params = [];

    if (name !== undefined) { sets.push("name = ?"); params.push(name.trim()); }
    if (slug !== undefined) { sets.push("slug = ?"); params.push(slug.trim().toLowerCase()); }
    if (brandName !== undefined) { sets.push("brand_name = ?"); params.push(brandName.trim()); }
    if (primaryColor !== undefined) { sets.push("primary_color = ?"); params.push(primaryColor); }
    if (secondaryColor !== undefined) { sets.push("secondary_color = ?"); params.push(secondaryColor); }
    if (offlineMode !== undefined) { sets.push("offline_mode = ?"); params.push(offlineMode ? 1 : 0); }
    if (defaultMinStock !== undefined && defaultMinStock !== null) { sets.push("default_min_stock = ?"); params.push(Number(defaultMinStock)); }

    if (sets.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

    params.push(tenantId);
    await query("UPDATE tenants SET " + sets.join(", ") + " WHERE id = ?", params);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Tenants",
      actionType: "tenant_updated",
      actionDescription: "Actualizó el hotel #" + tenantId,
      newData: { name, slug, brandName, primaryColor, secondaryColor },
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, message: "Hotel actualizado correctamente." });
  } catch (err) {
    console.error("Error updating tenant:", err);
    res.status(500).json({ error: "Error al actualizar hotel" });
  }
});

// PUT /api/admin/tenants/:id/toggle — activate/deactivate
router.put("/tenants/:id/toggle", async function (req, res) {
  try {
    var tenantId = req.params.id;
    var [rows] = await getDbPool().query("SELECT id, name, active FROM tenants WHERE id = ?", [tenantId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Hotel no encontrado" });
    var newActive = rows[0].active ? 0 : 1;
    await query("UPDATE tenants SET active = ? WHERE id = ?", [newActive, tenantId]);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Tenants",
      actionType: newActive ? "tenant_activated" : "tenant_deactivated",
      actionDescription: (newActive ? "Activó" : "Desactivó") + " el hotel " + rows[0].name,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, active: !!newActive, message: "Hotel " + (newActive ? "activado" : "desactivado") + " correctamente." });
  } catch (err) {
    console.error("Error toggling tenant:", err);
    res.status(500).json({ error: "Error al cambiar estado del hotel" });
  }
});

// POST /api/admin/tenants/:id/logo — upload logo
router.post("/tenants/:id/logo", tenantUpload.single("logo"), async function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });
    var imageUrl = "/uploads/tenants/" + req.file.filename;
    var tenantId = req.params.id;

    var [oldRows] = await getDbPool().query("SELECT logo_url FROM tenants WHERE id = ?", [tenantId]);
    if (oldRows && oldRows[0] && oldRows[0].logo_url) {
      var oldPath = path.join(__dirname, "..", "..", "public", oldRows[0].logo_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await query("UPDATE tenants SET logo_url = ? WHERE id = ?", [imageUrl, tenantId]);
    res.json({ success: true, imageUrl: imageUrl, message: "Logo actualizado correctamente." });
  } catch (err) {
    console.error("Error uploading logo:", err);
    res.status(500).json({ error: "Error al subir el logo." });
  }
});

// POST /api/admin/tenants/:id/hero — upload hero image
router.post("/tenants/:id/hero", tenantUpload.single("hero"), async function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No se envió ninguna imagen." });
    var imageUrl = "/uploads/tenants/" + req.file.filename;
    var tenantId = req.params.id;

    var [oldRows] = await getDbPool().query("SELECT hero_image_url FROM tenants WHERE id = ?", [tenantId]);
    if (oldRows && oldRows[0] && oldRows[0].hero_image_url) {
      var oldPath = path.join(__dirname, "..", "..", "public", oldRows[0].hero_image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await query("UPDATE tenants SET hero_image_url = ? WHERE id = ?", [imageUrl, tenantId]);
    res.json({ success: true, imageUrl: imageUrl, message: "Imagen de portada actualizada correctamente." });
  } catch (err) {
    console.error("Error uploading hero:", err);
    res.status(500).json({ error: "Error al subir la imagen de portada." });
  }
});

// GET /api/admin/tenants/:id/stats — view users/rooms/consumption by tenant
router.get("/tenants/:id/stats", async function (req, res) {
  try {
    var tid = Number(req.params.id);
    if (!tid || tid < 1) return res.status(400).json({ error: "ID inválido" });

    var [[{ userCount }]] = await getDbPool().query("SELECT COUNT(*) AS userCount FROM users WHERE tenant_id = ?", [tid]);
    var [[{ roomCount }]] = await getDbPool().query("SELECT COUNT(*) AS roomCount FROM rooms WHERE tenant_id = ?", [tid]);
    var [[{ floorCount }]] = await getDbPool().query("SELECT COUNT(*) AS floorCount FROM floors WHERE tenant_id = ?", [tid]);

    var [products] = await getDbPool().query("SELECT COUNT(*) AS cnt FROM minibar_products WHERE tenant_id = ?", [tid]);
    var productCount = products[0]?.cnt || 0;

    var consumptionRows = await getDbPool().query("SELECT COUNT(*) AS cnt FROM consumptions WHERE tenant_id = ?", [tid]);
    var consumptionCount = consumptionRows[0]?.[0]?.cnt || 0;

    res.json({
      users: userCount,
      rooms: roomCount,
      floors: floorCount,
      products: productCount,
      consumptions: consumptionCount
    });
  } catch (err) {
    console.error("Error fetching tenant stats:", err);
    res.status(500).json({ error: "Error al cargar estadísticas" });
  }
});

// ============ PLANS & SUBSCRIPTIONS ============

var planEnforcer = require("../middleware/planEnforcer");

// GET /api/admin/plans — list all plans
router.get("/plans", async function (req, res) {
  try {
    var rows = await query("SELECT id, name, slug, description, max_rooms, max_users, max_floors, max_products, max_brands, price_monthly, features, active FROM plans ORDER BY price_monthly ASC");
    rows.forEach(function (p) {
      try { p.features = JSON.parse(p.features || "{}"); } catch (e) { p.features = {}; }
    });
    res.json(rows);
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Error al cargar planes" });
  }
});

// POST /api/admin/plans — create plan
router.post("/plans", async function (req, res) {
  try {
    var { name, slug, description, price_monthly, active, max_rooms, max_users, max_floors, max_products, max_brands, features } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "Nombre y slug son obligatorios" });
    var featStr = typeof features === "string" ? features : JSON.stringify(features || {});
    var result = await query(
      "INSERT INTO plans (name, slug, description, price_monthly, active, max_rooms, max_users, max_floors, max_products, max_brands, features) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [name, slug, description || "", price_monthly || 0, active !== false ? 1 : 0, max_rooms != null ? max_rooms : null, max_users != null ? max_users : null, max_floors != null ? max_floors : null, max_products != null ? max_products : null, max_brands != null ? max_brands : null, featStr]
    );
    res.json({ success: true, id: result.insertId, message: "Plan creado" });
  } catch (err) {
    console.error("Error creating plan:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El slug ya existe" });
    res.status(500).json({ error: "Error al crear plan" });
  }
});

// PUT /api/admin/plans/:id — update plan
router.put("/plans/:id", async function (req, res) {
  try {
    var planId = req.params.id;
    var { name, slug, description, price_monthly, active, max_rooms, max_users, max_floors, max_products, max_brands, features } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "Nombre y slug son obligatorios" });
    var featStr = typeof features === "string" ? features : JSON.stringify(features || {});
    await query(
      "UPDATE plans SET name=?, slug=?, description=?, price_monthly=?, active=?, max_rooms=?, max_users=?, max_floors=?, max_products=?, max_brands=?, features=? WHERE id=?",
      [name, slug, description || "", price_monthly || 0, active !== false ? 1 : 0, max_rooms != null ? max_rooms : null, max_users != null ? max_users : null, max_floors != null ? max_floors : null, max_products != null ? max_products : null, max_brands != null ? max_brands : null, featStr, planId]
    );
    res.json({ success: true, message: "Plan actualizado" });
  } catch (err) {
    console.error("Error updating plan:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El slug ya existe" });
    res.status(500).json({ error: "Error al actualizar plan" });
  }
});

// PUT /api/admin/tenants/:id/plan — change tenant plan
router.put("/tenants/:id/plan", async function (req, res) {
  try {
    var tenantId = req.params.id;
    var { planId } = req.body;
    if (!planId) return res.status(400).json({ error: "Plan requerido" });

    var [rows] = await getDbPool().query("SELECT id FROM tenants WHERE id = ?", [tenantId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Hotel no encontrado" });

    var [planRows] = await getDbPool().query("SELECT id, name FROM plans WHERE id = ?", [planId]);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: "Plan no encontrado" });

    var today = new Date();
    var endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    var fmt = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

    var [existing] = await getDbPool().query("SELECT id FROM tenant_subscriptions WHERE tenant_id = ?", [tenantId]);
    if (existing && existing.length > 0) {
      await query("UPDATE tenant_subscriptions SET plan_id = ?, status = 'active', current_period_end = ? WHERE tenant_id = ?", [planId, fmt(endOfMonth), tenantId]);
    } else {
      await query("INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end, billing_day) VALUES (?, ?, 'active', ?, ?, ?)", [tenantId, planId, fmt(today), fmt(endOfMonth), today.getDate()]);
    }

    planEnforcer.invalidateCache(tenantId);

    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Planes",
      actionType: "plan_changed",
      actionDescription: "Cambió el plan del hotel #" + tenantId + " a " + planRows[0].name,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });

    res.json({ success: true, message: "Plan actualizado a " + planRows[0].name });
  } catch (err) {
    console.error("Error changing plan:", err);
    res.status(500).json({ error: "Error al cambiar plan" });
  }
});

// GET /api/admin/tenants/:id/plan — get current plan + usage
router.get("/tenants/:id/plan", async function (req, res) {
  try {
    var tid = Number(req.params.id) || 1;
    var limits = await planEnforcer.getPlanLimits(tid);

    var [[{ roomCount }]] = await getDbPool().query("SELECT COUNT(*) AS roomCount FROM rooms WHERE tenant_id = ?", [tid]);
    var [[{ userCount }]] = await getDbPool().query("SELECT COUNT(*) AS userCount FROM users WHERE tenant_id = ?", [tid]);
    var [[{ floorCount }]] = await getDbPool().query("SELECT COUNT(*) AS floorCount FROM floors WHERE tenant_id = ?", [tid]);
    var [[{ productCount }]] = await getDbPool().query("SELECT COUNT(*) AS productCount FROM minibar_products WHERE tenant_id = ? AND is_active = 1", [tid]);

    var [subRows] = await getDbPool().query("SELECT id, status, current_period_start, current_period_end, billing_day, trial_ends_at, canceled_at, created_at FROM tenant_subscriptions WHERE tenant_id = ?", [tid]);

    res.json({
      plan: limits,
      usage: { rooms: roomCount, users: userCount, floors: floorCount, products: productCount },
      subscription: subRows && subRows.length > 0 ? subRows[0] : null
    });
  } catch (err) {
    console.error("Error fetching plan info:", err);
    res.status(500).json({ error: "Error al cargar información del plan" });
  }
});

// ============ BILLING / INVOICES ============

// POST /api/admin/billing/generate — manually trigger invoice generation
router.post("/billing/generate", async function (req, res) {
  try {
    var { generateInvoices } = require("../scripts/generate-invoices");
    var count = await generateInvoices();
    logAudit({
      userId: req.session?.user?.id,
      userName: req.session?.user?.fullName,
      userRole: req.session?.user?.role,
      moduleName: "Facturación",
      actionType: "invoices_generated",
      actionDescription: "Generó " + count + " factura(s) manualmente",
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req)
    });
    res.json({ success: true, invoicesGenerated: count });
  } catch (err) {
    console.error("Error generating invoices:", err);
    res.status(500).json({ error: "Error al generar facturas" });
  }
});

// GET /api/admin/billing/invoices — list all invoices (admin overview)
router.get("/billing/invoices", async function (req, res) {
  try {
    var filter = req.query.status || "";
    var sql = "SELECT bi.id, bi.tenant_id, bi.amount, bi.currency, bi.status, bi.period_start, bi.period_end, bi.due_date, bi.paid_at, bi.created_at, bi.subscription_id, t.name AS tenant_name FROM billing_invoices bi JOIN tenants t ON bi.tenant_id = t.id";
    var params = [];
    if (filter === "pending" || filter === "paid" || filter === "overdue" || filter === "cancelled") {
      sql += " WHERE bi.status = ?";
      params.push(filter);
    }
    sql += " ORDER BY bi.created_at DESC";
    var [rows] = await getDbPool().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Error al cargar facturas" });
  }
});

// GET /api/admin/billing/invoices/:tenantId — invoices for a specific tenant
router.get("/billing/invoices/:tenantId", async function (req, res) {
  try {
    var [rows] = await getDbPool().query(
      "SELECT id, tenant_id, amount, currency, status, period_start, period_end, due_date, paid_at, created_at FROM billing_invoices WHERE tenant_id = ? ORDER BY created_at DESC",
      [req.params.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching tenant invoices:", err);
    res.status(500).json({ error: "Error al cargar facturas" });
  }
});

module.exports = router;
