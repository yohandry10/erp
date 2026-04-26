-- ============================================================================
-- 002__domain_tables_skeleton.sql
-- Reconstruccion fase 2: tablas de dominio (esqueleto inicial).
-- NOTA: se refinan columnas/restricciones por modulo en siguientes iteraciones.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.activos_fijos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activos_fijos_tenant_id ON public.activos_fijos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_activos_fijos_estado ON public.activos_fijos (estado);

CREATE TABLE IF NOT EXISTS public.almacen_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_almacen_ubicaciones_tenant_id ON public.almacen_ubicaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_almacen_ubicaciones_estado ON public.almacen_ubicaciones (estado);

CREATE TABLE IF NOT EXISTS public.almacenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_almacenes_tenant_id ON public.almacenes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_almacenes_estado ON public.almacenes (estado);

CREATE TABLE IF NOT EXISTS public.asientos_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asientos_contables_tenant_id ON public.asientos_contables (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asientos_contables_estado ON public.asientos_contables (estado);

CREATE TABLE IF NOT EXISTS public.asientos_contables_rrhh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asientos_contables_rrhh_tenant_id ON public.asientos_contables_rrhh (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asientos_contables_rrhh_estado ON public.asientos_contables_rrhh (estado);

CREATE TABLE IF NOT EXISTS public.asignacion_costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asignacion_costos_tenant_id ON public.asignacion_costos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asignacion_costos_estado ON public.asignacion_costos (estado);

CREATE TABLE IF NOT EXISTS public.asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_id ON public.asistencia (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_estado ON public.asistencia (estado);

CREATE TABLE IF NOT EXISTS public.asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asistencias_tenant_id ON public.asistencias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_estado ON public.asistencias (estado);

CREATE TABLE IF NOT EXISTS public.audit_log_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_tenant_id ON public.audit_log_archive (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_archive_estado ON public.audit_log_archive (estado);

CREATE TABLE IF NOT EXISTS public.auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tenant_id ON public.auditoria (tenant_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_estado ON public.auditoria (estado);

CREATE TABLE IF NOT EXISTS public.auditoria_cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_tenant_id ON public.auditoria_cotizaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_cotizaciones_estado ON public.auditoria_cotizaciones (estado);

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_tenant_id ON public.auth_login_attempts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_estado ON public.auth_login_attempts (estado);

CREATE TABLE IF NOT EXISTS public.autorizaciones_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_tenant_id ON public.autorizaciones_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_autorizaciones_caja_estado ON public.autorizaciones_caja (estado);

CREATE TABLE IF NOT EXISTS public.beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beneficios_tenant_id ON public.beneficios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_estado ON public.beneficios (estado);

CREATE TABLE IF NOT EXISTS public.caja_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant_id ON public.caja_audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_estado ON public.caja_audit_log (estado);

CREATE TABLE IF NOT EXISTS public.cajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cajas_tenant_id ON public.cajas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cajas_estado ON public.cajas (estado);

CREATE TABLE IF NOT EXISTS public.calendario_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendario_empresa_tenant_id ON public.calendario_empresa (tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendario_empresa_estado ON public.calendario_empresa (estado);

CREATE TABLE IF NOT EXISTS public.cambios_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cambios_turno_tenant_id ON public.cambios_turno (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cambios_turno_estado ON public.cambios_turno (estado);

CREATE TABLE IF NOT EXISTS public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidatos_tenant_id ON public.candidatos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_estado ON public.candidatos (estado);

CREATE TABLE IF NOT EXISTS public.capacitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capacitaciones_tenant_id ON public.capacitaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_capacitaciones_estado ON public.capacitaciones (estado);

CREATE TABLE IF NOT EXISTS public.centros_costo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centros_costo_tenant_id ON public.centros_costo (tenant_id);
CREATE INDEX IF NOT EXISTS idx_centros_costo_estado ON public.centros_costo (estado);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant_id ON public.clientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON public.clientes (estado);

CREATE TABLE IF NOT EXISTS public.cobranzas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranzas_tenant_id ON public.cobranzas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cobranzas_estado ON public.cobranzas (estado);

CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_tenant_id ON public.compras (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON public.compras (estado);

CREATE TABLE IF NOT EXISTS public.comprobantes_electronicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_electronicos_tenant_id ON public.comprobantes_electronicos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_electronicos_estado ON public.comprobantes_electronicos (estado);

CREATE TABLE IF NOT EXISTS public.comunicaciones_baja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_tenant_id ON public.comunicaciones_baja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_baja_estado ON public.comunicaciones_baja (estado);

CREATE TABLE IF NOT EXISTS public.conceptos_planilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conceptos_planilla_tenant_id ON public.conceptos_planilla (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conceptos_planilla_estado ON public.conceptos_planilla (estado);

CREATE TABLE IF NOT EXISTS public.conciliaciones_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_tenant_id ON public.conciliaciones_bancarias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_bancarias_estado ON public.conciliaciones_bancarias (estado);

CREATE TABLE IF NOT EXISTS public.config_alertas_vencimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_config_alertas_vencimiento_tenant_id ON public.config_alertas_vencimiento (tenant_id);
CREATE INDEX IF NOT EXISTS idx_config_alertas_vencimiento_estado ON public.config_alertas_vencimiento (estado);

CREATE TABLE IF NOT EXISTS public.configuracion_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant_id ON public.configuracion_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_configuracion_caja_estado ON public.configuracion_caja (estado);

CREATE TABLE IF NOT EXISTS public.configuracion_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_tenant_id ON public.configuracion_fiscal (tenant_id);
CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_estado ON public.configuracion_fiscal (estado);

CREATE TABLE IF NOT EXISTS public.configuracion_retenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_configuracion_retenciones_tenant_id ON public.configuracion_retenciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_configuracion_retenciones_estado ON public.configuracion_retenciones (estado);

CREATE TABLE IF NOT EXISTS public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_tenant_id ON public.contratos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON public.contratos (estado);

CREATE TABLE IF NOT EXISTS public.cortes_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cortes_caja_tenant_id ON public.cortes_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cortes_caja_estado ON public.cortes_caja (estado);

CREATE TABLE IF NOT EXISTS public.cotizacion_compra_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_tenant_id ON public.cotizacion_compra_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_estado ON public.cotizacion_compra_detalles (estado);

CREATE TABLE IF NOT EXISTS public.cotizacion_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_tenant_id ON public.cotizacion_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_estado ON public.cotizacion_detalles (estado);

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_id ON public.cotizaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON public.cotizaciones (estado);

CREATE TABLE IF NOT EXISTS public.cotizaciones_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_tenant_id ON public.cotizaciones_compra (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_estado ON public.cotizaciones_compra (estado);

CREATE TABLE IF NOT EXISTS public.cpe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpe_tenant_id ON public.cpe (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cpe_estado ON public.cpe (estado);

CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_tenant_id ON public.cuentas_bancarias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_estado ON public.cuentas_bancarias (estado);

CREATE TABLE IF NOT EXISTS public.cuentas_por_cobrar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_tenant_id ON public.cuentas_por_cobrar (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_estado ON public.cuentas_por_cobrar (estado);

CREATE TABLE IF NOT EXISTS public.cuentas_por_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_tenant_id ON public.cuentas_por_pagar (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_estado ON public.cuentas_por_pagar (estado);

CREATE TABLE IF NOT EXISTS public.cxc_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_tenant_id ON public.cxc_pagos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cxc_pagos_estado ON public.cxc_pagos (estado);

CREATE TABLE IF NOT EXISTS public.demo_conversiones_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_conversiones_pendientes_tenant_id ON public.demo_conversiones_pendientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_demo_conversiones_pendientes_estado ON public.demo_conversiones_pendientes (estado);

CREATE TABLE IF NOT EXISTS public.departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departamentos_tenant_id ON public.departamentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_departamentos_estado ON public.departamentos (estado);

CREATE TABLE IF NOT EXISTS public.depreciaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depreciaciones_tenant_id ON public.depreciaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_depreciaciones_estado ON public.depreciaciones (estado);

CREATE TABLE IF NOT EXISTS public.detalle_asientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detalle_asientos_tenant_id ON public.detalle_asientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_asientos_estado ON public.detalle_asientos (estado);

CREATE TABLE IF NOT EXISTS public.detalle_comunicacion_baja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detalle_comunicacion_baja_tenant_id ON public.detalle_comunicacion_baja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_comunicacion_baja_estado ON public.detalle_comunicacion_baja (estado);

CREATE TABLE IF NOT EXISTS public.detalle_resumen_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detalle_resumen_diario_tenant_id ON public.detalle_resumen_diario (tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_resumen_diario_estado ON public.detalle_resumen_diario (estado);

CREATE TABLE IF NOT EXISTS public.detalle_retenciones_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detalle_retenciones_categoria_tenant_id ON public.detalle_retenciones_categoria (tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_retenciones_categoria_estado ON public.detalle_retenciones_categoria (estado);

CREATE TABLE IF NOT EXISTS public.detalle_ventas_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_tenant_id ON public.detalle_ventas_pos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_pos_estado ON public.detalle_ventas_pos (estado);

CREATE TABLE IF NOT EXISTS public.devolucion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devolucion_items_tenant_id ON public.devolucion_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_items_estado ON public.devolucion_items (estado);

CREATE TABLE IF NOT EXISTS public.devoluciones_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_tenant_id ON public.devoluciones_proveedor (tenant_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_estado ON public.devoluciones_proveedor (estado);

CREATE TABLE IF NOT EXISTS public.documento_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documento_archivos_tenant_id ON public.documento_archivos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documento_archivos_estado ON public.documento_archivos (estado);

CREATE TABLE IF NOT EXISTS public.documento_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documento_auditoria_tenant_id ON public.documento_auditoria (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documento_auditoria_estado ON public.documento_auditoria (estado);

CREATE TABLE IF NOT EXISTS public.documento_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documento_detalles_tenant_id ON public.documento_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documento_detalles_estado ON public.documento_detalles (estado);

CREATE TABLE IF NOT EXISTS public.documento_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documento_series_tenant_id ON public.documento_series (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documento_series_estado ON public.documento_series (estado);

CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_tenant_id ON public.documentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documentos_estado ON public.documentos (estado);

CREATE TABLE IF NOT EXISTS public.egresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_egresos_tenant_id ON public.egresos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_egresos_estado ON public.egresos (estado);

CREATE TABLE IF NOT EXISTS public.empleado_beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleado_beneficios_tenant_id ON public.empleado_beneficios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleado_beneficios_estado ON public.empleado_beneficios (estado);

CREATE TABLE IF NOT EXISTS public.empleado_capacitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleado_capacitaciones_tenant_id ON public.empleado_capacitaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleado_capacitaciones_estado ON public.empleado_capacitaciones (estado);

CREATE TABLE IF NOT EXISTS public.empleado_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleado_horarios_tenant_id ON public.empleado_horarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleado_horarios_estado ON public.empleado_horarios (estado);

CREATE TABLE IF NOT EXISTS public.empleado_planilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleado_planilla_tenant_id ON public.empleado_planilla (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleado_planilla_estado ON public.empleado_planilla (estado);

CREATE TABLE IF NOT EXISTS public.empleado_planilla_conceptos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleado_planilla_conceptos_tenant_id ON public.empleado_planilla_conceptos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleado_planilla_conceptos_estado ON public.empleado_planilla_conceptos (estado);

CREATE TABLE IF NOT EXISTS public.empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleados_tenant_id ON public.empleados (tenant_id);
CREATE INDEX IF NOT EXISTS idx_empleados_estado ON public.empleados (estado);

CREATE TABLE IF NOT EXISTS public.evaluaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_tenant_id ON public.evaluaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_estado ON public.evaluaciones (estado);

CREATE TABLE IF NOT EXISTS public.event_processing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_processing_log_tenant_id ON public.event_processing_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_processing_log_estado ON public.event_processing_log (estado);

CREATE TABLE IF NOT EXISTS public.eventos_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_pos_tenant_id ON public.eventos_pos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pos_estado ON public.eventos_pos (estado);

CREATE TABLE IF NOT EXISTS public.expediente_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expediente_documentos_tenant_id ON public.expediente_documentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_expediente_documentos_estado ON public.expediente_documentos (estado);

CREATE TABLE IF NOT EXISTS public.fe_configuracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fe_configuracion_tenant_id ON public.fe_configuracion (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fe_configuracion_estado ON public.fe_configuracion (estado);

CREATE TABLE IF NOT EXISTS public.feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feriados_tenant_id ON public.feriados (tenant_id);
CREATE INDEX IF NOT EXISTS idx_feriados_estado ON public.feriados (estado);

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_tenant_id ON public.gastos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON public.gastos (estado);

CREATE TABLE IF NOT EXISTS public.gestiones_cobranza (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_tenant_id ON public.gestiones_cobranza (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_estado ON public.gestiones_cobranza (estado);

CREATE TABLE IF NOT EXISTS public.gre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gre_tenant_id ON public.gre (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gre_estado ON public.gre (estado);

CREATE TABLE IF NOT EXISTS public.gre_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gre_detalles_tenant_id ON public.gre_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gre_detalles_estado ON public.gre_detalles (estado);

CREATE TABLE IF NOT EXISTS public.gre_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gre_guias_tenant_id ON public.gre_guias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gre_guias_estado ON public.gre_guias (estado);

CREATE TABLE IF NOT EXISTS public.historial_pagos_planilla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_tenant_id ON public.historial_pagos_planilla (tenant_id);
CREATE INDEX IF NOT EXISTS idx_historial_pagos_planilla_estado ON public.historial_pagos_planilla (estado);

CREATE TABLE IF NOT EXISTS public.horarios_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_horarios_trabajo_tenant_id ON public.horarios_trabajo (tenant_id);
CREATE INDEX IF NOT EXISTS idx_horarios_trabajo_estado ON public.horarios_trabajo (estado);

CREATE TABLE IF NOT EXISTS public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_id ON public.integration_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_estado ON public.integration_logs (estado);

CREATE TABLE IF NOT EXISTS public.inventarios_permanentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventarios_permanentes_tenant_id ON public.inventarios_permanentes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventarios_permanentes_estado ON public.inventarios_permanentes (estado);

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant_id ON public.knowledge_base (tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_estado ON public.knowledge_base (estado);

CREATE TABLE IF NOT EXISTS public.libro_retenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_libro_retenciones_tenant_id ON public.libro_retenciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_libro_retenciones_estado ON public.libro_retenciones (estado);

CREATE TABLE IF NOT EXISTS public.libros_electronicos_sunat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_libros_electronicos_sunat_tenant_id ON public.libros_electronicos_sunat (tenant_id);
CREATE INDEX IF NOT EXISTS idx_libros_electronicos_sunat_estado ON public.libros_electronicos_sunat (estado);

CREATE TABLE IF NOT EXISTS public.liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tenant_id ON public.liquidaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_estado ON public.liquidaciones (estado);

CREATE TABLE IF NOT EXISTS public.logistica_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_eventos_tenant_id ON public.logistica_eventos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_logistica_eventos_estado ON public.logistica_eventos (estado);

CREATE TABLE IF NOT EXISTS public.lotes_productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotes_productos_tenant_id ON public.lotes_productos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lotes_productos_estado ON public.lotes_productos (estado);

CREATE TABLE IF NOT EXISTS public.metodos_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metodos_pago_tenant_id ON public.metodos_pago (tenant_id);
CREATE INDEX IF NOT EXISTS idx_metodos_pago_estado ON public.metodos_pago (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_tenant_id ON public.movimientos_bancarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_estado ON public.movimientos_bancarios (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tenant_id ON public.movimientos_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_estado ON public.movimientos_caja (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_consignacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_consignacion_tenant_id ON public.movimientos_consignacion (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_consignacion_estado ON public.movimientos_consignacion (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_tenant_id ON public.movimientos_inventario (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_estado ON public.movimientos_inventario (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_lotes_tenant_id ON public.movimientos_lotes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_lotes_estado ON public.movimientos_lotes (estado);

CREATE TABLE IF NOT EXISTS public.movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_stock_tenant_id ON public.movimientos_stock (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_estado ON public.movimientos_stock (estado);

CREATE TABLE IF NOT EXISTS public.notificacion_tipo_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacion_tipo_roles_tenant_id ON public.notificacion_tipo_roles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notificacion_tipo_roles_estado ON public.notificacion_tipo_roles (estado);

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_id ON public.notificaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_estado ON public.notificaciones (estado);

CREATE TABLE IF NOT EXISTS public.oc_aprobaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_tenant_id ON public.oc_aprobaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_estado ON public.oc_aprobaciones (estado);

CREATE TABLE IF NOT EXISTS public.orden_compra_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_tenant_id ON public.orden_compra_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_estado ON public.orden_compra_detalles (estado);

CREATE TABLE IF NOT EXISTS public.ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_tenant_id ON public.ordenes_compra (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON public.ordenes_compra (estado);

CREATE TABLE IF NOT EXISTS public.pagos_empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_empleados_tenant_id ON public.pagos_empleados (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_empleados_estado ON public.pagos_empleados (estado);

CREATE TABLE IF NOT EXISTS public.pagos_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_facturas_tenant_id ON public.pagos_facturas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_facturas_estado ON public.pagos_facturas (estado);

CREATE TABLE IF NOT EXISTS public.pagos_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_lote_tenant_id ON public.pagos_lote (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_lote_estado ON public.pagos_lote (estado);

CREATE TABLE IF NOT EXISTS public.pagos_ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_ventas_tenant_id ON public.pagos_ventas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_ventas_estado ON public.pagos_ventas (estado);

CREATE TABLE IF NOT EXISTS public.paises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paises_tenant_id ON public.paises (tenant_id);
CREATE INDEX IF NOT EXISTS idx_paises_estado ON public.paises (estado);

CREATE TABLE IF NOT EXISTS public.pedido_aprobaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_aprobaciones_tenant_id ON public.pedido_aprobaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedido_aprobaciones_estado ON public.pedido_aprobaciones (estado);

CREATE TABLE IF NOT EXISTS public.pedido_backorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_id ON public.pedido_backorders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedido_backorders_estado ON public.pedido_backorders (estado);

CREATE TABLE IF NOT EXISTS public.pedido_despachos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_despachos_tenant_id ON public.pedido_despachos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedido_despachos_estado ON public.pedido_despachos (estado);

CREATE TABLE IF NOT EXISTS public.pedido_gres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_gres_tenant_id ON public.pedido_gres (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedido_gres_estado ON public.pedido_gres (estado);

CREATE TABLE IF NOT EXISTS public.pedidos_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_tenant_id ON public.pedidos_venta (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_estado ON public.pedidos_venta (estado);

CREATE TABLE IF NOT EXISTS public.pedidos_venta_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_tenant_id ON public.pedidos_venta_detalle (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_venta_detalle_estado ON public.pedidos_venta_detalle (estado);

CREATE TABLE IF NOT EXISTS public.periodos_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_periodos_contables_tenant_id ON public.periodos_contables (tenant_id);
CREATE INDEX IF NOT EXISTS idx_periodos_contables_estado ON public.periodos_contables (estado);

CREATE TABLE IF NOT EXISTS public.pii_encryption_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_encryption_log_tenant_id ON public.pii_encryption_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pii_encryption_log_estado ON public.pii_encryption_log (estado);

CREATE TABLE IF NOT EXISTS public.plan_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tenant_id ON public.plan_cuentas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_estado ON public.plan_cuentas (estado);

CREATE TABLE IF NOT EXISTS public.planillas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planillas_tenant_id ON public.planillas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_planillas_estado ON public.planillas (estado);

CREATE TABLE IF NOT EXISTS public.plantillas_asientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_tenant_id ON public.plantillas_asientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_estado ON public.plantillas_asientos (estado);

CREATE TABLE IF NOT EXISTS public.plantillas_asientos_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_detalle_tenant_id ON public.plantillas_asientos_detalle (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_detalle_estado ON public.plantillas_asientos_detalle (estado);

CREATE TABLE IF NOT EXISTS public.plantillas_asientos_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_historial_tenant_id ON public.plantillas_asientos_historial (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_historial_estado ON public.plantillas_asientos_historial (estado);

CREATE TABLE IF NOT EXISTS public.plantillas_asientos_ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_tenant_id ON public.plantillas_asientos_ventas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_estado ON public.plantillas_asientos_ventas (estado);

CREATE TABLE IF NOT EXISTS public.pos_numeracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_numeracion_tenant_id ON public.pos_numeracion (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_numeracion_estado ON public.pos_numeracion (estado);

CREATE TABLE IF NOT EXISTS public.presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tenant_id ON public.presupuestos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON public.presupuestos (estado);

CREATE TABLE IF NOT EXISTS public.producto_existencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producto_existencias_tenant_id ON public.producto_existencias (tenant_id);
CREATE INDEX IF NOT EXISTS idx_producto_existencias_estado ON public.producto_existencias (estado);

CREATE TABLE IF NOT EXISTS public.producto_precios_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producto_precios_sucursal_tenant_id ON public.producto_precios_sucursal (tenant_id);
CREATE INDEX IF NOT EXISTS idx_producto_precios_sucursal_estado ON public.producto_precios_sucursal (estado);

CREATE TABLE IF NOT EXISTS public.producto_stock_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producto_stock_sucursal_tenant_id ON public.producto_stock_sucursal (tenant_id);
CREATE INDEX IF NOT EXISTS idx_producto_stock_sucursal_estado ON public.producto_stock_sucursal (estado);

CREATE TABLE IF NOT EXISTS public.productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_tenant_id ON public.productos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_productos_estado ON public.productos (estado);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_estado ON public.profiles (estado);

CREATE TABLE IF NOT EXISTS public.proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant_id ON public.proveedores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_estado ON public.proveedores (estado);

CREATE TABLE IF NOT EXISTS public.proveedores_cuarta_categoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_cuarta_categoria_tenant_id ON public.proveedores_cuarta_categoria (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_cuarta_categoria_estado ON public.proveedores_cuarta_categoria (estado);

CREATE TABLE IF NOT EXISTS public.rate_limit_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_tenant_id ON public.rate_limit_anomalies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_anomalies_estado ON public.rate_limit_anomalies (estado);

CREATE TABLE IF NOT EXISTS public.rate_limit_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_tenant_id ON public.rate_limit_baselines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_baselines_estado ON public.rate_limit_baselines (estado);

CREATE TABLE IF NOT EXISTS public.rate_limit_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_tenant_id ON public.rate_limit_blocks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_blocks_estado ON public.rate_limit_blocks (estado);

CREATE TABLE IF NOT EXISTS public.rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_tenant_id ON public.rate_limit_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_configs_estado ON public.rate_limit_configs (estado);

CREATE TABLE IF NOT EXISTS public.recepcion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recepcion_items_tenant_id ON public.recepcion_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_items_estado ON public.recepcion_items (estado);

CREATE TABLE IF NOT EXISTS public.recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recepciones_tenant_id ON public.recepciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_estado ON public.recepciones (estado);

CREATE TABLE IF NOT EXISTS public.registro_consignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registro_consignaciones_tenant_id ON public.registro_consignaciones (tenant_id);
CREATE INDEX IF NOT EXISTS idx_registro_consignaciones_estado ON public.registro_consignaciones (estado);

CREATE TABLE IF NOT EXISTS public.request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_tenant_id ON public.request_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_estado ON public.request_logs (estado);

CREATE TABLE IF NOT EXISTS public.resumenes_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_tenant_id ON public.resumenes_diarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_estado ON public.resumenes_diarios (estado);

CREATE TABLE IF NOT EXISTS public.retiros_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant_id ON public.retiros_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_retiros_caja_estado ON public.retiros_caja (estado);

CREATE TABLE IF NOT EXISTS public.rls_alert_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rls_alert_config_tenant_id ON public.rls_alert_config (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rls_alert_config_estado ON public.rls_alert_config (estado);

CREATE TABLE IF NOT EXISTS public.rls_alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rls_alert_history_tenant_id ON public.rls_alert_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rls_alert_history_estado ON public.rls_alert_history (estado);

CREATE TABLE IF NOT EXISTS public.rls_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_tenant_id ON public.rls_audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_estado ON public.rls_audit_log (estado);

CREATE TABLE IF NOT EXISTS public.rma_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_eventos_tenant_id ON public.rma_eventos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rma_eventos_estado ON public.rma_eventos (estado);

CREATE TABLE IF NOT EXISTS public.rma_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_items_tenant_id ON public.rma_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rma_items_estado ON public.rma_items (estado);

CREATE TABLE IF NOT EXISTS public.rma_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_tenant_id ON public.rma_solicitudes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rma_solicitudes_estado ON public.rma_solicitudes (estado);

CREATE TABLE IF NOT EXISTS public.rrhh_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_tenant_id ON public.rrhh_pagos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rrhh_pagos_estado ON public.rrhh_pagos (estado);

CREATE TABLE IF NOT EXISTS public.saldos_iniciales_cuentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saldos_iniciales_cuentas_tenant_id ON public.saldos_iniciales_cuentas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saldos_iniciales_cuentas_estado ON public.saldos_iniciales_cuentas (estado);

CREATE TABLE IF NOT EXISTS public.secret_rotation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secret_rotation_state_tenant_id ON public.secret_rotation_state (tenant_id);
CREATE INDEX IF NOT EXISTS idx_secret_rotation_state_estado ON public.secret_rotation_state (estado);

CREATE TABLE IF NOT EXISTS public.sesiones_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant_id ON public.sesiones_caja (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_estado ON public.sesiones_caja (estado);

CREATE TABLE IF NOT EXISTS public.sire_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sire_files_tenant_id ON public.sire_files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sire_files_estado ON public.sire_files (estado);

CREATE TABLE IF NOT EXISTS public.sire_registros_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_tenant_id ON public.sire_registros_detalle (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sire_registros_detalle_estado ON public.sire_registros_detalle (estado);

CREATE TABLE IF NOT EXISTS public.solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant_id ON public.solicitudes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON public.solicitudes (estado);

CREATE TABLE IF NOT EXISTS public.stock_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movimientos_tenant_id ON public.stock_movimientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movimientos_estado ON public.stock_movimientos (estado);

CREATE TABLE IF NOT EXISTS public.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sucursales_tenant_id ON public.sucursales (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sucursales_estado ON public.sucursales (estado);

CREATE TABLE IF NOT EXISTS public.supervisor_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_pins_tenant_id ON public.supervisor_pins (tenant_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_pins_estado ON public.supervisor_pins (estado);

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_id ON public.system_alerts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_estado ON public.system_alerts (estado);

CREATE TABLE IF NOT EXISTS public.tipos_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_cambio_tenant_id ON public.tipos_cambio (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tipos_cambio_estado ON public.tipos_cambio (estado);

CREATE TABLE IF NOT EXISTS public.tipos_documentos_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_tenant_id ON public.tipos_documentos_fiscales (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_estado ON public.tipos_documentos_fiscales (estado);

CREATE TABLE IF NOT EXISTS public.tipos_impuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_tenant_id ON public.tipos_impuestos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_estado ON public.tipos_impuestos (estado);

CREATE TABLE IF NOT EXISTS public.trusted_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trusted_ips_tenant_id ON public.trusted_ips (tenant_id);
CREATE INDEX IF NOT EXISTS idx_trusted_ips_estado ON public.trusted_ips (estado);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON public.user_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_estado ON public.user_sessions (estado);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_estado ON public.users (estado);

CREATE TABLE IF NOT EXISTS public.usuario_configuracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_tenant_id ON public.usuario_configuracion (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_estado ON public.usuario_configuracion (estado);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_id ON public.usuarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON public.usuarios (estado);

CREATE TABLE IF NOT EXISTS public.usuarios_sistemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_sistemas_tenant_id ON public.usuarios_sistemas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_sistemas_estado ON public.usuarios_sistemas (estado);

CREATE TABLE IF NOT EXISTS public.vacantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vacantes_tenant_id ON public.vacantes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vacantes_estado ON public.vacantes (estado);

CREATE TABLE IF NOT EXISTS public.validaciones_sunat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_tenant_id ON public.validaciones_sunat (tenant_id);
CREATE INDEX IF NOT EXISTS idx_validaciones_sunat_estado ON public.validaciones_sunat (estado);

CREATE TABLE IF NOT EXISTS public.venta_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venta_detalles_tenant_id ON public.venta_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_venta_detalles_estado ON public.venta_detalles (estado);

CREATE TABLE IF NOT EXISTS public.ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_tenant_id ON public.ventas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON public.ventas (estado);

CREATE TABLE IF NOT EXISTS public.ventas_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_tenant_id ON public.ventas_pos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pos_estado ON public.ventas_pos (estado);

CREATE TABLE IF NOT EXISTS public.ventas_pos_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text,
  codigo text,
  estado text NOT NULL DEFAULT 'ACTIVO',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_pagos_tenant_id ON public.ventas_pos_pagos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pos_pagos_estado ON public.ventas_pos_pagos (estado);

COMMIT;
