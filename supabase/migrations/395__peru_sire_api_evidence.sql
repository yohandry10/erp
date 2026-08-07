-- Cierre SIRE Perú: activación explícita, ticket SUNAT y evidencia por intento.
-- La aceptación de una propuesta es asíncrona. Un ticket recibido NO equivale
-- a una presentación terminada; sólo el estado SUNAT 06 permite cerrar el flujo.

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS sire_activo boolean NOT NULL DEFAULT false;

ALTER TABLE public.sire_files
  ADD COLUMN IF NOT EXISTS sunat_ticket text,
  ADD COLUMN IF NOT EXISTS sunat_estado text,
  ADD COLUMN IF NOT EXISTS sunat_codigo_estado text,
  ADD COLUMN IF NOT EXISTS sunat_operacion_id uuid,
  ADD COLUMN IF NOT EXISTS sunat_ultima_consulta timestamptz,
  ADD COLUMN IF NOT EXISTS sunat_aceptado_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sire_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reporte_id uuid NOT NULL REFERENCES public.sire_files(id) ON DELETE CASCADE,
  accion text NOT NULL,
  tipo_libro text NOT NULL,
  periodo text NOT NULL,
  idempotency_key text NOT NULL,
  ticket text,
  estado text NOT NULL DEFAULT 'SOLICITADO',
  codigo_estado_sunat text,
  descripcion_estado_sunat text,
  http_status integer,
  intentos integer NOT NULL DEFAULT 1,
  solicitado_por uuid,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb,
  error_code text,
  error_message text,
  solicitado_at timestamptz NOT NULL DEFAULT now(),
  ultima_consulta_at timestamptz,
  completado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_sire_operaciones_accion
    CHECK (accion IN ('ACEPTAR_PROPUESTA', 'CONSULTAR_TICKET')),
  CONSTRAINT ck_sire_operaciones_tipo_libro
    CHECK (tipo_libro IN ('REG_VEN', 'REG_COM')),
  CONSTRAINT ck_sire_operaciones_periodo
    CHECK (periodo ~ '^[0-9]{6}$'),
  CONSTRAINT ck_sire_operaciones_estado
    CHECK (estado IN ('SOLICITADO', 'PROCESANDO', 'TERMINADO', 'ERROR')),
  CONSTRAINT ck_sire_operaciones_http_status
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT ck_sire_operaciones_intentos
    CHECK (intentos > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sire_operacion_aceptacion_activa
  ON public.sire_operaciones (tenant_id, reporte_id, accion)
  WHERE accion = 'ACEPTAR_PROPUESTA'
    AND estado IN ('SOLICITADO', 'PROCESANDO', 'TERMINADO');

CREATE INDEX IF NOT EXISTS idx_sire_operaciones_idempotency
  ON public.sire_operaciones (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sire_operaciones_reporte_fecha
  ON public.sire_operaciones (tenant_id, reporte_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sire_operaciones_ticket
  ON public.sire_operaciones (tenant_id, ticket)
  WHERE ticket IS NOT NULL;

CREATE OR REPLACE FUNCTION app.enforce_sire_operacion_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporte_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_reporte_tenant
  FROM public.sire_files
  WHERE id = NEW.reporte_id;

  IF v_reporte_tenant IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'Reporte SIRE no existe', ERRCODE = '23503';
  END IF;
  IF v_reporte_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con el reporte SIRE', ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_sire_operacion_tenant ON public.sire_operaciones;
CREATE TRIGGER trg_enforce_sire_operacion_tenant
BEFORE INSERT OR UPDATE ON public.sire_operaciones
FOR EACH ROW EXECUTE FUNCTION app.enforce_sire_operacion_tenant();

REVOKE ALL ON FUNCTION app.enforce_sire_operacion_tenant() FROM PUBLIC;

ALTER TABLE public.sire_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sire_operaciones FORCE ROW LEVEL SECURITY;
SELECT app.apply_tenant_policy('public', 'sire_operaciones');

REVOKE ALL ON TABLE public.sire_operaciones FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sire_operaciones TO service_role;

COMMENT ON COLUMN public.empresa_config.sire_activo IS
  'Opt-in explícito para consumo server-side de SIRE en PROD; la migración no lo activa automáticamente y demos permanecen bloqueadas.';
COMMENT ON TABLE public.sire_operaciones IS
  'Bitácora tenant-scoped de aceptación de propuestas y consultas de tickets SIRE; nunca almacena tokens ni secretos.';
COMMENT ON COLUMN public.sire_files.sunat_aceptado_at IS
  'Fecha en que SUNAT devolvió estado 06 Terminado para el ticket; no representa la generación final del libro en SOL.';
