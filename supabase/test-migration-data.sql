-- =====================================================
-- TEST DATA: SUNAT Validations & GRE Automation
-- Description: Sample data for testing the new schema
-- WARNING: This is for testing only. Do not run in production.
-- =====================================================

-- ⚠️ IMPORTANT: Run the main migration FIRST!
-- You must execute 'supabase-migration-validations-gre-automation.sql'
-- before running this test data script.

-- Note: Replace these UUIDs with actual values from your database
-- SET app.current_tenant_id = 'your-tenant-id-here';
-- SET app.current_user_id = 'your-user-id-here';

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
  get_current_tenant_id(),
  'certificate',
  '{"expiresAt": "2025-12-31", "daysUntilExpiration": 75, "format": "PFX"}'::jsonb,
  true,
  '[]'::jsonb,
  '[]'::jsonb
);

-- Sample certificate validation (expiring soon)
INSERT INTO validaciones_sunat (
  tenant_id,
  tipo_validacion,
  resultado,
  es_valido,
  errores,
  advertencias
) VALUES (
  get_current_tenant_id(),
  'certificate',
  '{"expiresAt": "2025-11-15", "daysUntilExpiration": 28, "format": "PFX"}'::jsonb,
  true,
  '[]'::jsonb,
  '[{"code": "CERT_EXPIRING", "message": "Certificate expires in less than 30 days"}]'::jsonb
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
  get_current_tenant_id(),
  'ruc',
  '{"missingFields": ["direccion", "ubigeo"]}'::jsonb,
  false,
  '[{"field": "direccion", "code": "RUC_001", "message": "Dirección fiscal es requerida"}]'::jsonb,
  '[]'::jsonb
);

-- Sample document validation (valid)
INSERT INTO validaciones_sunat (
  tenant_id,
  tipo_validacion,
  resultado,
  es_valido,
  errores,
  advertencias
) VALUES (
  get_current_tenant_id(),
  'document',
  '{"itemCount": 5, "totalAmount": 1500.00, "serie": "F001"}'::jsonb,
  true,
  '[]'::jsonb,
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
  get_current_tenant_id(),
  NULL, -- Tenant-wide notification
  'certificate_expiring',
  'warning',
  'Certificado próximo a vencer',
  'Su certificado digital vence en 28 días. Por favor, renuévelo para evitar interrupciones en la emisión de comprobantes.',
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
  get_current_tenant_id(),
  NULL,
  'configuration_incomplete',
  'error',
  'Configuración incompleta',
  'Faltan datos obligatorios en la configuración de su empresa. Complete la configuración para poder emitir comprobantes.',
  '/configuracion/wizard',
  'Completar configuración',
  false
);

-- GRE auto-created notification
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
  get_current_tenant_id(),
  get_current_user_id(),
  'gre_auto_created',
  'info',
  'Guía de remisión creada automáticamente',
  'Se ha generado automáticamente la guía de remisión GRE-001 para la venta F001-00000123 por superar el umbral de S/ 700.',
  '/gre/GRE-001',
  'Ver guía',
  false
);

-- Validation error notification
INSERT INTO notificaciones (
  tenant_id,
  usuario_id,
  tipo,
  severidad,
  titulo,
  mensaje,
  leida
) VALUES (
  get_current_tenant_id(),
  get_current_user_id(),
  'validation_error',
  'error',
  'Error en validación de documento',
  'El documento no pudo ser emitido debido a errores de validación. Revise los datos e intente nuevamente.',
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
  get_current_tenant_id(),
  3,
  '[1, 2]'::jsonb,
  '{
    "ruc": "20123456789",
    "razon_social": "MI EMPRESA SAC",
    "direccion": "Av. Principal 123"
  }'::jsonb,
  false
);

-- =====================================================
-- TEST DATA FOR empresa_config (update existing)
-- =====================================================

-- Update empresa_config with new fields
-- Note: This assumes empresa_config record exists for the tenant
UPDATE empresa_config
SET
  configuracion_completa = false,
  fecha_validacion_certificado = NOW(),
  certificado_expira_en = '2025-12-31',
  umbral_gre_automatico = 700.00,
  gre_automatico_habilitado = true,
  ultima_validacion = NOW(),
  errores_configuracion = '[
    {"field": "direccion", "message": "Dirección fiscal incompleta"}
  ]'::jsonb
WHERE tenant_id = get_current_tenant_id();

-- =====================================================
-- TEST DATA FOR gre_guias (insert sample automatic GRE)
-- =====================================================

-- Sample automatic GRE
-- Note: Replace venta_id and movimiento_inventario_id with actual UUIDs
INSERT INTO gre_guias (
  tenant_id,
  numero,
  fecha_traslado,
  estado,
  es_automatica,
  venta_id,
  motivo_creacion
) VALUES (
  get_current_tenant_id(),
  'GRE-001',
  CURRENT_DATE + INTERVAL '1 day',
  'PENDIENTE',
  true,
  NULL, -- Replace with actual venta_id
  'Venta mayor a S/ 700 - Generación automática'
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Count records in new tables
SELECT 
  'validaciones_sunat' as tabla,
  COUNT(*) as registros
FROM validaciones_sunat
WHERE tenant_id = get_current_tenant_id()

UNION ALL

SELECT 
  'notificaciones' as tabla,
  COUNT(*) as registros
FROM notificaciones
WHERE tenant_id = get_current_tenant_id()

UNION ALL

SELECT 
  'wizard_progress' as tabla,
  COUNT(*) as registros
FROM wizard_progress
WHERE tenant_id = get_current_tenant_id();

-- Show unread notifications
SELECT 
  tipo,
  severidad,
  titulo,
  created_at
FROM notificaciones
WHERE tenant_id = get_current_tenant_id()
AND leida = false
ORDER BY created_at DESC;

-- Show latest validations
SELECT 
  tipo_validacion,
  es_valido,
  created_at
FROM validaciones_sunat
WHERE tenant_id = get_current_tenant_id()
ORDER BY created_at DESC
LIMIT 5;

-- Show wizard progress
SELECT 
  paso_actual,
  pasos_completados,
  completado
FROM wizard_progress
WHERE tenant_id = get_current_tenant_id();

-- Show automatic GREs
SELECT 
  numero,
  fecha_traslado,
  estado,
  motivo_creacion
FROM gre_guias
WHERE tenant_id = get_current_tenant_id()
AND es_automatica = true;

-- =====================================================
-- CLEANUP (Optional - run to remove test data)
-- =====================================================

/*
DELETE FROM validaciones_sunat WHERE tenant_id = get_current_tenant_id();
DELETE FROM notificaciones WHERE tenant_id = get_current_tenant_id();
DELETE FROM wizard_progress WHERE tenant_id = get_current_tenant_id();
DELETE FROM gre_guias WHERE tenant_id = get_current_tenant_id() AND es_automatica = true;

UPDATE empresa_config
SET
  configuracion_completa = NULL,
  fecha_validacion_certificado = NULL,
  certificado_expira_en = NULL,
  umbral_gre_automatico = 700.00,
  gre_automatico_habilitado = true,
  ultima_validacion = NULL,
  errores_configuracion = NULL
WHERE tenant_id = get_current_tenant_id();
*/
