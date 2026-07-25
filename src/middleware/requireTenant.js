function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({ error: "No se pudo resolver el tenant. Verifica la configuración." });
  }
  next();
}

module.exports = requireTenant;
