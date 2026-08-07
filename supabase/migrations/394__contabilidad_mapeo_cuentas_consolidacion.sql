-- ============================================================================
-- 394__contabilidad_mapeo_cuentas_consolidacion.sql
-- Homologa cuentas con codigos distintos antes de consolidar.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE TABLE IF NOT EXISTS public.mapeos_cuentas_consolidacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos_consolidacion(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  miembro_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cuenta_codigo_origen text NOT NULL,
  cuenta_codigo_destino text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_mapeo_cuenta_consolidacion_origen_394
    UNIQUE (grupo_id, miembro_tenant_id, cuenta_codigo_origen),
  CONSTRAINT ck_mapeo_cuenta_consolidacion_codigos_394 CHECK (
    btrim(cuenta_codigo_origen) <> ''
    AND btrim(cuenta_codigo_destino) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_mapeo_cuenta_consolidacion_destino_394
ON public.mapeos_cuentas_consolidacion (grupo_id, cuenta_codigo_destino);

ALTER TABLE public.mapeos_cuentas_consolidacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mapeos_cuentas_consolidacion_tenant_394
ON public.mapeos_cuentas_consolidacion;
CREATE POLICY mapeos_cuentas_consolidacion_tenant_394
ON public.mapeos_cuentas_consolidacion
FOR ALL
USING (app.is_superadmin() OR tenant_id = app.current_tenant_id())
WITH CHECK (app.is_superadmin() OR tenant_id = app.current_tenant_id());

COMMIT;
