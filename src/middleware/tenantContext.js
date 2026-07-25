const tenantRepository = require("../repositories/tenantRepository");

async function tenantContext(req, res, next) {
  try {
    var tenantId = null;
    var tenant = null;

    // 1. Check header override (only in development)
    var headerSlug = req.headers["x-tenant-slug"];
    if (headerSlug && process.env.NODE_ENV !== "production") {
      tenant = await tenantRepository.getTenantBySlug(headerSlug);
    }

    // 2. Try subdomain from hostname
    if (!tenant) {
      var host = req.hostname || "";
      var parts = host.split(".");
      if (parts.length >= 3) {
        var slug = parts[0];
        tenant = await tenantRepository.getTenantBySlug(slug);
      }
    }

    // 3. Check session user tenant
    if (!tenant && req.session && req.session.user && req.session.user.tenantId) {
      tenant = await tenantRepository.getTenantById(req.session.user.tenantId);
    }

    // 4. Fallback to default tenant (only for public routes like landing, login)
    if (!tenant) {
      tenant = await tenantRepository.getDefaultTenant();
    }

    if (tenant) {
      tenantId = tenant.id;
      req.tenantId = tenantId;
      req.tenant = tenant;
    } else {
      req.tenantId = null;
      req.tenant = null;
    }

    next();
  } catch (err) {
    console.error("tenantContext error:", err);
    req.tenantId = null;
    req.tenant = null;
    next();
  }
}

module.exports = tenantContext;
