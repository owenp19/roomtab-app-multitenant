var { getDbPool, query } = require("../config/db");

var cache = {};

async function getPlanLimits(tenantId) {
  var tid = Number(tenantId) || 1;
  if (cache[tid] && cache[tid].expires > Date.now()) return cache[tid].data;

  var [rows] = await getDbPool().query(
    "SELECT p.id, p.name, p.price_monthly, p.max_rooms, p.max_users, p.max_floors, p.max_products, p.max_brands, p.features, s.status AS sub_status FROM plans p JOIN tenant_subscriptions s ON s.plan_id = p.id WHERE s.tenant_id = ? AND s.status = 'active' LIMIT 1",
    [tid]
  );

  if (!rows || rows.length === 0) {
    var limits = { planId: null, name: "Sin plan", planName: "Sin plan", price: 0, interval: "month", maxRooms: 5, maxUsers: 2, maxFloors: 1, maxProducts: 10, maxBrands: 1, features: {}, active: false };
    cache[tid] = { data: limits, expires: Date.now() + 60000 };
    return limits;
  }

  var p = rows[0];
  var features = {};
  try { features = JSON.parse(p.features || "{}"); } catch (e) { features = {}; }

  var limits = {
    planId: p.id,
    name: p.name,
    planName: p.name,
    price: p.price_monthly,
    interval: "month",
    maxRooms: p.max_rooms,
    maxUsers: p.max_users,
    maxFloors: p.max_floors,
    maxProducts: p.max_products,
    maxBrands: p.max_brands,
    features: features,
    active: p.sub_status === "active"
  };

  cache[tid] = { data: limits, expires: Date.now() + 60000 };
  return limits;
}

async function checkRoomLimit(tenantId) {
  var limits = await getPlanLimits(tenantId);
  if (limits.maxRooms <= 0) return { ok: true };
  var [[{ count }]] = await getDbPool().query("SELECT COUNT(*) AS count FROM rooms WHERE tenant_id = ?", [Number(tenantId) || 1]);
  if (count >= limits.maxRooms) return { ok: false, message: "L\u00edmite de " + limits.maxRooms + " habitaciones alcanzado. Actualiza tu plan." };
  return { ok: true };
}

async function checkUserLimit(tenantId) {
  var limits = await getPlanLimits(tenantId);
  if (limits.maxUsers <= 0) return { ok: true };
  var [[{ count }]] = await getDbPool().query("SELECT COUNT(*) AS count FROM users WHERE tenant_id = ?", [Number(tenantId) || 1]);
  if (count >= limits.maxUsers) return { ok: false, message: "L\u00edmite de " + limits.maxUsers + " usuarios alcanzado. Actualiza tu plan." };
  return { ok: true };
}

async function checkFloorLimit(tenantId) {
  var limits = await getPlanLimits(tenantId);
  if (limits.maxFloors <= 0) return { ok: true };
  var [[{ count }]] = await getDbPool().query("SELECT COUNT(*) AS count FROM floors WHERE tenant_id = ?", [Number(tenantId) || 1]);
  if (count >= limits.maxFloors) return { ok: false, message: "L\u00edmite de " + limits.maxFloors + " pisos alcanzado. Actualiza tu plan." };
  return { ok: true };
}

async function checkProductLimit(tenantId) {
  var limits = await getPlanLimits(tenantId);
  if (limits.maxProducts <= 0) return { ok: true };
  var [[{ count }]] = await getDbPool().query("SELECT COUNT(*) AS count FROM minibar_products WHERE tenant_id = ? AND is_active = 1", [Number(tenantId) || 1]);
  if (count >= limits.maxProducts) return { ok: false, message: "L\u00edmite de " + limits.maxProducts + " productos alcanzado. Actualiza tu plan." };
  return { ok: true };
}

function invalidateCache(tenantId) {
  delete cache[Number(tenantId) || 1];
}

module.exports = {
  getPlanLimits,
  checkRoomLimit,
  checkUserLimit,
  checkFloorLimit,
  checkProductLimit,
  invalidateCache
};
