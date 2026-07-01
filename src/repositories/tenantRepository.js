const db = require("../config/db");

async function getTenantBySlug(slug) {
  const rows = await db.query(
    "SELECT id, name, slug, primary_color, secondary_color, logo_url, hero_image_url, brand_name, active FROM tenants WHERE slug = ? AND active = 1 LIMIT 1",
    [slug]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

async function getTenantById(id) {
  const rows = await db.query(
    "SELECT id, name, slug, primary_color, secondary_color, logo_url, hero_image_url, brand_name, active FROM tenants WHERE id = ? AND active = 1 LIMIT 1",
    [id]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

async function getTenantConfig(id) {
  const tenant = await getTenantById(id);
  if (!tenant) return null;
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    brandName: tenant.brand_name,
    primaryColor: tenant.primary_color,
    secondaryColor: tenant.secondary_color,
    logoUrl: tenant.logo_url,
    heroImageUrl: tenant.hero_image_url,
  };
}

async function getDefaultTenant() {
  const rows = await db.query(
    "SELECT id, name, slug, primary_color, secondary_color, logo_url, hero_image_url, brand_name, active FROM tenants WHERE active = 1 ORDER BY id ASC LIMIT 1"
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

module.exports = {
  getTenantBySlug,
  getTenantById,
  getTenantConfig,
  getDefaultTenant,
};
