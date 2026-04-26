-- Ver información del tenant Vierdes
SELECT 
  ec.tenant_id,
  ec.razon_social,
  COUNT(p.id) as total_permisos
FROM empresa_config ec
LEFT JOIN permisos p ON p.tenant_id = ec.tenant_id
WHERE ec.razon_social ILIKE '%vierdes%'
GROUP BY ec.tenant_id, ec.razon_social;

-- Ver TODOS los tenants con sus permisos
SELECT 
  ec.tenant_id,
  ec.razon_social,
  COUNT(p.id) as total_permisos
FROM empresa_config ec
LEFT JOIN permisos p ON p.tenant_id = ec.tenant_id
GROUP BY ec.tenant_id, ec.razon_social
ORDER BY total_permisos;
