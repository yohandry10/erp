-- ============================================================================
-- 019__runtime_columns_alignment_core.sql
-- Alinea columnas críticas usadas por API/Web/Worker en módulos core.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- empresa_config: configuración operativa/fiscal usada por wizard y servicios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empresa_config
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS tipo_empresa text DEFAULT 'MICRO',
  ADD COLUMN IF NOT EXISTS usar_flujo_logistica boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS monto_maximo_sin_aprobacion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje_descuento_maximo numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requiere_aprobacion_descuento boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aplicar_limite_credito boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requiere_ubicaciones_inventario boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requiere_lotes_series boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS objetivo_otif numeric(5,2) DEFAULT 95,
  ADD COLUMN IF NOT EXISTS habilitar_dashboards_otif boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS regimen_tributario text,
  ADD COLUMN IF NOT EXISTS retencion_renta_porcentaje numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS serie_boleta text,
  ADD COLUMN IF NOT EXISTS serie_nota_credito text,
  ADD COLUMN IF NOT EXISTS emision_cpe_modo text DEFAULT 'SUNAT_DIRECTO',
  ADD COLUMN IF NOT EXISTS ose_activo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ose_url text,
  ADD COLUMN IF NOT EXISTS ose_status_url text,
  ADD COLUMN IF NOT EXISTS ose_username text,
  ADD COLUMN IF NOT EXISTS ose_password text,
  ADD COLUMN IF NOT EXISTS ose_auth_tipo text DEFAULT 'BASIC',
  ADD COLUMN IF NOT EXISTS ose_api_key text,
  ADD COLUMN IF NOT EXISTS ose_api_header text,
  ADD COLUMN IF NOT EXISTS ose_bearer_token text,
  ADD COLUMN IF NOT EXISTS dian_activo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dian_url text,
  ADD COLUMN IF NOT EXISTS dian_usuario text,
  ADD COLUMN IF NOT EXISTS dian_password text,
  ADD COLUMN IF NOT EXISTS dian_software_id text,
  ADD COLUMN IF NOT EXISTS dian_software_pin text,
  ADD COLUMN IF NOT EXISTS dian_test_set_id text,
  ADD COLUMN IF NOT EXISTS dian_environment text DEFAULT 'HOMOLOGACION',
  ADD COLUMN IF NOT EXISTS dian_regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS dian_tipo_contribuyente text,
  ADD COLUMN IF NOT EXISTS dian_resolucion_numero text,
  ADD COLUMN IF NOT EXISTS dian_resolucion_prefijo text,
  ADD COLUMN IF NOT EXISTS dian_resolucion_desde integer,
  ADD COLUMN IF NOT EXISTS dian_resolucion_hasta integer,
  ADD COLUMN IF NOT EXISTS dian_resolucion_fecha_inicio date,
  ADD COLUMN IF NOT EXISTS dian_resolucion_fecha_fin date;

-- ----------------------------------------------------------------------------
-- integration_logs: trazabilidad de integraciones (SUNAT/GRE/FINANZAS/POS)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.integration_logs
  ADD COLUMN IF NOT EXISTS servicio text,
  ADD COLUMN IF NOT EXISTS operacion text,
  ADD COLUMN IF NOT EXISTS correlacion_id text,
  ADD COLUMN IF NOT EXISTS correlacion_tipo text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS request_summary jsonb,
  ADD COLUMN IF NOT EXISTS response_summary jsonb,
  ADD COLUMN IF NOT EXISTS status_code integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS cpe_id uuid,
  ADD COLUMN IF NOT EXISTS sesion_caja_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_entrante_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_saliente_id uuid,
  ADD COLUMN IF NOT EXISTS saldo_sistema numeric(14,2),
  ADD COLUMN IF NOT EXISTS saldo_contado numeric(14,2),
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS filas integer,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_created_at
ON public.integration_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_status_created_at
ON public.integration_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_correlacion
ON public.integration_logs (correlacion_tipo, correlacion_id);

-- ----------------------------------------------------------------------------
-- cxc_pagos: estructura de pagos de cuentas por cobrar
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cxc_pagos
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'PAGO',
  ADD COLUMN IF NOT EXISTS aplica_retencion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencion_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_tenant_cuenta_fecha
ON public.cxc_pagos (tenant_id, cuenta_id, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_event_id
ON public.cxc_pagos (event_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cxc_pagos_tenant_idempotency
ON public.cxc_pagos (tenant_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- CxC / CxP / bancos: columnas de integración y correlación de eventos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS event_source text,
  ADD COLUMN IF NOT EXISTS monto_original numeric(14,2),
  ADD COLUMN IF NOT EXISTS numero_documento text,
  ADD COLUMN IF NOT EXISTS tipo_documento text;

ALTER TABLE IF EXISTS public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS condiciones_pago text,
  ADD COLUMN IF NOT EXISTS discrepancias jsonb,
  ADD COLUMN IF NOT EXISTS estado_comparacion text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS orden_id uuid,
  ADD COLUMN IF NOT EXISTS tipo_documento text;

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS cxc_id uuid,
  ADD COLUMN IF NOT EXISTS doc text;

-- ----------------------------------------------------------------------------
-- Notificaciones y outbox
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.notificaciones
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS mensaje text,
  ADD COLUMN IF NOT EXISTS severidad text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS leida boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS leida_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_leida
ON public.notificaciones (tenant_id, leida, created_at DESC);

ALTER TABLE IF EXISTS public.outbox_events
  ADD COLUMN IF NOT EXISTS event_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_events_event_id
ON public.outbox_events (event_id)
WHERE event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- comprobantes_electronicos: estado de anulación y trazabilidad
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.comprobantes_electronicos
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero integer,
  ADD COLUMN IF NOT EXISTS ruc_emisor text,
  ADD COLUMN IF NOT EXISTS razon_social_emisor text,
  ADD COLUMN IF NOT EXISTS tipo_documento_receptor text,
  ADD COLUMN IF NOT EXISTS documento_receptor text,
  ADD COLUMN IF NOT EXISTS razon_social_receptor text,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS total_gravadas numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_igv numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_venta numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS nota_credito_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_comprobantes_electronicos_tenant_serie_numero
ON public.comprobantes_electronicos (tenant_id, serie, numero);

CREATE INDEX IF NOT EXISTS idx_comprobantes_electronicos_estado
ON public.comprobantes_electronicos (estado, updated_at DESC);

COMMIT;
