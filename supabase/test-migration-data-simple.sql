-- =====================================================
-- TEST DATA SIMPLE: SUNAT Validations & GRE Automation
-- Description: Sample data for testing (without RLS context)
-- WARNING: This is for testing only. Do not run in production.
-- =====================================================

-- ⚠️ IMPORTANT: Replace 'YOUR_TENANT_ID_HERE' with your actual tenant UUID
-- You can get it from: SELECT id FROM tenants LIMIT 1;
-- Or from: SELECT tenant_id FROM empresa_config LIMIT 1;

-- =====================================================
-- TEST DATA FOR validaciones_sunat
-- =====================================================

-- Sample certificate validation (valid)
INSERT INTO validaciones_sunat (
  tenant_id,
  tipo_validacion,
  resultado,
  es_valido,
  errores,
  advertencias
) VALUES (
  'YOUR_TENANT_ID_HERE'::uuid,
  'certificate',
  '{"expiresAt": "2025-12-31", "daysUntilExpiration": 75, "format": "PFX"}'::jsonb,
  true,
  '[]'::jsonb,
  '[]'::jsonb
);

-- Sample RUC validation (incomplete)
INSERT INTO validaciones_sunat (
  tenant_id,
  tipo_validacion,
  resultado,
  es_valido,
  errores,
  advertencias
) VALUES (
  'YOUR_TENANT_ID_HERE'::uuid,
  'ruc',
  '{"missingFields": ["direccion", "ubigeo"]}'::jsonb,
  false,
  '[{"field": "direccion", "code": "RUC_001", "message": "Dirección fiscal es requerida"}]'::jsonb,
  '[]'::jsonb
);

-- =====================================================
-- TEST DATA FOR notificaciones
-- =====================================================

-- Certificate expiring notification
INSERT INTO notificaciones (
  tenant_id,
  usuario_id,
  tipo,
  severidad,
  titulo,
  mensaje,
  action_url,
  action_label,
  leida
) VALUES (
  'YOUR_TENANT_ID_HERE'::uuid,
  NULL,
  'certificate_expiring',
  'warning',
  'Certificado próximo a vencer',
  'Su certificado digital vence en 28 días. Por favor, renuévelo para evitar interrupciones.',
  '/configuracion/certificado',
  'Renovar certificado',
  false
);

-- Configuration incomplete notification
INSERT INTO notificaciones (
  tenant_id,
  usuario_id,
  tipo,
  severidad,
  titulo,
  mensaje,
  action_url,
  action_label,
  leida
) VALUES (
  'YOUR_TENANT_ID_HERE'::uuid,
  NULL,
  'configuration_incomplete',
  'error',
  'Configuración incompleta',
  'Faltan datos obligatorios en la configuración de su empresa.',
  '/configuracion/wizard',
  'Completar configuración',
  false
);

-- =====================================================
-- TEST DATA FOR wizard_progress
-- =====================================================

-- Sample wizard progress (in progress)
INSERT INTO wizard_progress (
  tenant_id,
  paso_actual,
  pasos_completados,
  configuracion_temporal,
  completado
) VALUES (
  'YOUR_TENANT_ID_HERE'::uuid,
  3,
  '[1, 2]'::jsonb,
  '{"ruc": "20123456789", "razon_social": "MI EMPRESA SAC"}'::jsonb,
  false
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Count records
SELECT 'validaciones_sunat' as tabla, COUNT(*) as registros FROM validaciones_sunat
UNION ALL
SELECT 'notificaciones' as tabla, COUNT(*) as registros FROM notificaciones
UNION ALL
SELECT 'wizard_progress' as tabla, COUNT(*) as registros FROM wizard_progress;

-- Show data
SELECT * FROM validaciones_sunat ORDER BY created_at DESC LIMIT 5;
SELECT * FROM notificaciones ORDER BY created_at DESC LIMIT 5;
SELECT * FROM wizard_progress;
