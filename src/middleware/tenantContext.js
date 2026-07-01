const tenantRepository = require("../repositories/tenantRepository");

async function tenantContext(req, res, next) {
  try {
    var tenantId = null;
    var tenant = null;

    // 1. Check header override (for development/testing)
    var headerSlug = req.headers["x-tenant-slug"];
    if (headerSlug) {
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

    // 4. Fallback to default tenant
    if (!tenant) {
      tenant = await tenantRepository.getDefaultTenant();
    }

    if (tenant) {
      tenantId = tenant.id;
      req.tenantId = tenantId;
      req.tenant = tenant;
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
