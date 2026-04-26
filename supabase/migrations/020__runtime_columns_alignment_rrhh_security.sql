-- ============================================================================
-- 020__runtime_columns_alignment_rrhh_security.sql
-- Alinea columnas pendientes en RRHH, auditoría, seguridad y logística.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- RRHH base
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.asistencia
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS hora_entrada time,
  ADD COLUMN IF NOT EXISTS hora_salida time,
  ADD COLUMN IF NOT EXISTS horas_trabajadas numeric(6,2);

ALTER TABLE IF EXISTS public.asistencias
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS hora_entrada time,
  ADD COLUMN IF NOT EXISTS hora_salida time,
  ADD COLUMN IF NOT EXISTS horas_trabajadas numeric(6,2);

ALTER TABLE IF EXISTS public.contratos
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS motivo_finalizacion text,
  ADD COLUMN IF NOT EXISTS observaciones text;

ALTER TABLE IF EXISTS public.solicitudes
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS observaciones_aprobacion text;

ALTER TABLE IF EXISTS public.expediente_documentos
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS nombre_archivo text,
  ADD COLUMN IF NOT EXISTS archivo_url text,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS fecha_subida timestamptz,
  ADD COLUMN IF NOT EXISTS subido_por uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.historial_pagos_planilla
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS metodo text,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empleados_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero_operacion text,
  ADD COLUMN IF NOT EXISTS observaciones text;

ALTER TABLE IF EXISTS public.empleado_horarios
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS id_horario uuid,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.empleado_beneficios
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS id_beneficio uuid,
  ADD COLUMN IF NOT EXISTS fecha_inicio date;

ALTER TABLE IF EXISTS public.empleado_capacitaciones
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS id_capacitacion uuid,
  ADD COLUMN IF NOT EXISTS fecha_inscripcion date;

ALTER TABLE IF EXISTS public.empleado_planilla
  ADD COLUMN IF NOT EXISTS faltas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horas_extras_25 numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horas_extras_35 numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tardanzas_minutos integer DEFAULT 0;

ALTER TABLE IF EXISTS public.rrhh_pagos
  ADD COLUMN IF NOT EXISTS planilla_id uuid,
  ADD COLUMN IF NOT EXISTS empleado_id uuid,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS metodo_pago text,
  ADD COLUMN IF NOT EXISTS monto_bruto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuentos numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

ALTER TABLE IF EXISTS public.liquidaciones
  ADD COLUMN IF NOT EXISTS id_empleado uuid,
  ADD COLUMN IF NOT EXISTS fecha_terminacion date,
  ADD COLUMN IF NOT EXISTS ultimo_dia_trabajado date,
  ADD COLUMN IF NOT EXISTS motivo_terminacion text,
  ADD COLUMN IF NOT EXISTS monto_cts numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacaciones_pendientes numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indemnizacion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_cts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_liquidacion numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.libro_retenciones
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS categoria_retencion text,
  ADD COLUMN IF NOT EXISTS numero_comprobante text,
  ADD COLUMN IF NOT EXISTS numero_correlativo text,
  ADD COLUMN IF NOT EXISTS fecha_emision date,
  ADD COLUMN IF NOT EXISTS fecha_pago date,
  ADD COLUMN IF NOT EXISTS monto_pago numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_retencion numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasa_retencion numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones text;

CREATE INDEX IF NOT EXISTS idx_asistencia_empleado_fecha
ON public.asistencia (tenant_id, id_empleado, fecha);

CREATE INDEX IF NOT EXISTS idx_asistencias_empleado_fecha
ON public.asistencias (tenant_id, empleado_id, fecha);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_planilla
ON public.rrhh_pagos (tenant_id, planilla_id, fecha_pago DESC);

-- ----------------------------------------------------------------------------
-- RMA / logística / compras
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.rma_solicitudes
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS nota_credito_documento_id uuid,
  ADD COLUMN IF NOT EXISTS almacen_retorno_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_general text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS aprobado_por uuid,
  ADD COLUMN IF NOT EXISTS aprobado_en timestamptz,
  ADD COLUMN IF NOT EXISTS recibido_por uuid,
  ADD COLUMN IF NOT EXISTS recibido_en timestamptz;

ALTER TABLE IF EXISTS public.logistica_eventos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS datos jsonb,
  ADD COLUMN IF NOT EXISTS registrado_por uuid,
  ADD COLUMN IF NOT EXISTS registrado_en timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.oc_aprobaciones
  ADD COLUMN IF NOT EXISTS orden_id uuid,
  ADD COLUMN IF NOT EXISTS aprobador_id uuid,
  ADD COLUMN IF NOT EXISTS nivel integer DEFAULT 1;

ALTER TABLE IF EXISTS public.pedido_gres
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS creado_en timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.proveedores
  ADD COLUMN IF NOT EXISTS contacto text,
  ADD COLUMN IF NOT EXISTS nombre_comercial text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE IF EXISTS public.proveedores_cuarta_categoria
  ADD COLUMN IF NOT EXISTS proveedor_id uuid,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- ----------------------------------------------------------------------------
-- Contabilidad / presupuestos / plantillas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.periodos_contables
  ADD COLUMN IF NOT EXISTS anio integer,
  ADD COLUMN IF NOT EXISTS mes integer,
  ADD COLUMN IF NOT EXISTS fecha_cierre date,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid;

ALTER TABLE IF EXISTS public.presupuestos
  ADD COLUMN IF NOT EXISTS centro_costo_id uuid,
  ADD COLUMN IF NOT EXISTS cuenta_id uuid,
  ADD COLUMN IF NOT EXISTS periodo_contable_id uuid,
  ADD COLUMN IF NOT EXISTS monto_ejecutado numeric(14,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.plantillas_asientos_ventas
  ADD COLUMN IF NOT EXISTS pais_id bigint,
  ADD COLUMN IF NOT EXISTS tipo_documento text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- ----------------------------------------------------------------------------
-- Auditoría y eventos técnicos
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.audit_log
  ADD COLUMN IF NOT EXISTS record_id text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS changed_fields jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE IF EXISTS public.documento_auditoria
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS accion text,
  ADD COLUMN IF NOT EXISTS detalles_cambio jsonb,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.caja_audit_log
  ADD COLUMN IF NOT EXISTS evento text,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.event_processing_log
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS processor_name text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_details jsonb,
  ADD COLUMN IF NOT EXISTS stack text;

CREATE INDEX IF NOT EXISTS idx_event_processing_log_status_created
ON public.event_processing_log (tenant_id, status, created_at DESC);

-- ----------------------------------------------------------------------------
-- Demo / seguridad operacional
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.demo_conversiones_pendientes
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS ruc text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS plan_id text,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE IF EXISTS public.secret_rotation_state
  ADD COLUMN IF NOT EXISTS secret_key text,
  ADD COLUMN IF NOT EXISTS current_secret_hash text,
  ADD COLUMN IF NOT EXISTS previous_secret_hash text,
  ADD COLUMN IF NOT EXISTS rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_hours integer DEFAULT 24;

ALTER TABLE IF EXISTS public.system_alerts
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS message text;

ALTER TABLE IF EXISTS public.rate_limit_baselines
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS avg_requests_per_hour numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_requests_per_hour numeric(12,2),
  ADD COLUMN IF NOT EXISTS std_deviation numeric(12,4),
  ADD COLUMN IF NOT EXISTS sample_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_calculated timestamptz;

ALTER TABLE IF EXISTS public.rate_limit_blocks
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE IF EXISTS public.trusted_ips
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_endpoint
ON public.rate_limit_baselines (tenant_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_expires_at
ON public.rate_limit_blocks (expires_at);

CREATE INDEX IF NOT EXISTS idx_trusted_ips_address
ON public.trusted_ips (ip_address);

-- ----------------------------------------------------------------------------
-- Otros catálogos operativos usados por servicios
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.capacitaciones
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS fecha_inicio date;

ALTER TABLE IF EXISTS public.configuracion_retenciones
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.depreciaciones
  ADD COLUMN IF NOT EXISTS evento_id uuid,
  ADD COLUMN IF NOT EXISTS procesado_outbox boolean DEFAULT false;

ALTER TABLE IF EXISTS public.feriados
  ADD COLUMN IF NOT EXISTS fecha date,
  ADD COLUMN IF NOT EXISTS pais text;

ALTER TABLE IF EXISTS public.activos_fijos
  ADD COLUMN IF NOT EXISTS fecha_adquisicion date;

ALTER TABLE IF EXISTS public.almacen_ubicaciones
  ADD COLUMN IF NOT EXISTS almacen_id uuid;

ALTER TABLE IF EXISTS public.asientos_contables_rrhh
  ADD COLUMN IF NOT EXISTS fecha date;

ALTER TABLE IF EXISTS public.beneficios
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.candidatos
  ADD COLUMN IF NOT EXISTS fecha_postulacion date;

ALTER TABLE IF EXISTS public.centros_costo
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.compras
  ADD COLUMN IF NOT EXISTS fecha date;

ALTER TABLE IF EXISTS public.evaluaciones
  ADD COLUMN IF NOT EXISTS fecha_evaluacion date;

ALTER TABLE IF EXISTS public.gastos
  ADD COLUMN IF NOT EXISTS fecha date;

ALTER TABLE IF EXISTS public.horarios_trabajo
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

ALTER TABLE IF EXISTS public.metodos_pago
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

COMMIT;
