-- ============================================================================
-- 137__logistica_pedidos_runtime_alignment.sql
-- Alineación runtime para logística de pedidos.
-- Tablas: logistica_eventos, pedido_backorders, pedido_despachos, pedido_gres.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas runtime: logistica_eventos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.logistica_eventos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS registrado_por uuid,
  ADD COLUMN IF NOT EXISTS registrado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.logistica_eventos
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN tipo TYPE text USING NULLIF(upper(btrim(COALESCE(tipo, ''))), ''),
  ALTER COLUMN datos TYPE jsonb USING COALESCE(
    CASE
      WHEN datos IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(datos) IN ('object', 'array') THEN datos
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  ),
  ALTER COLUMN registrado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(registrado_por::text, '')),
  ALTER COLUMN registrado_en TYPE timestamptz USING CASE
    WHEN registrado_en IS NULL OR btrim(registrado_en::text) = '' THEN NULL
    ELSE registrado_en::timestamptz
  END,
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN datos SET DEFAULT '{}'::jsonb,
  ALTER COLUMN registrado_en SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- ----------------------------------------------------------------------------
-- Columnas runtime: pedido_backorders.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_backorders
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS detalle_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad_comprometida numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_despachada numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_pendiente numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS proxima_fecha_compromiso date,
  ADD COLUMN IF NOT EXISTS ultimo_compromiso_en timestamptz,
  ADD COLUMN IF NOT EXISTS prioridad integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.pedido_backorders
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN detalle_id TYPE uuid USING app.to_uuid_or_null(COALESCE(detalle_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN cantidad_comprometida TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_comprometida::text),
  ALTER COLUMN cantidad_despachada TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_despachada::text),
  ALTER COLUMN cantidad_pendiente TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad_pendiente::text),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN observaciones TYPE text USING NULLIF(btrim(COALESCE(observaciones, '')), ''),
  ALTER COLUMN proxima_fecha_compromiso TYPE date USING CASE
    WHEN proxima_fecha_compromiso IS NULL OR btrim(proxima_fecha_compromiso::text) = '' THEN NULL
    WHEN btrim(proxima_fecha_compromiso::text) ~ '^\d{4}-\d{2}-\d{2}$' THEN btrim(proxima_fecha_compromiso::text)::date
    WHEN btrim(proxima_fecha_compromiso::text) ~ '^\d{4}/\d{2}/\d{2}$' THEN replace(btrim(proxima_fecha_compromiso::text), '/', '-')::date
    ELSE NULL
  END,
  ALTER COLUMN ultimo_compromiso_en TYPE timestamptz USING CASE
    WHEN ultimo_compromiso_en IS NULL OR btrim(ultimo_compromiso_en::text) = '' THEN NULL
    ELSE ultimo_compromiso_en::timestamptz
  END,
  ALTER COLUMN prioridad TYPE integer USING COALESCE(
    CASE
      WHEN prioridad IS NULL OR btrim(prioridad::text) = '' THEN NULL
      WHEN lower(btrim(prioridad::text)) IN ('urgente', 'alta', 'high', 'critical') THEN 1
      WHEN lower(btrim(prioridad::text)) IN ('media', 'medio', 'normal') THEN 3
      WHEN lower(btrim(prioridad::text)) IN ('baja', 'low') THEN 5
      ELSE NULL
    END,
    CASE
      WHEN app.to_int_or_zero(prioridad::text) BETWEEN 1 AND 5 THEN app.to_int_or_zero(prioridad::text)
      ELSE 3
    END
  ),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN cantidad_comprometida SET DEFAULT 0,
  ALTER COLUMN cantidad_despachada SET DEFAULT 0,
  ALTER COLUMN cantidad_pendiente SET DEFAULT 0,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE',
  ALTER COLUMN prioridad SET DEFAULT 3,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.pedido_backorders
SET notas = COALESCE(NULLIF(btrim(COALESCE(notas, '')), ''), NULLIF(btrim(COALESCE(observaciones, '')), ''))
WHERE notas IS NULL OR btrim(notas) = '';

UPDATE public.pedido_backorders
SET observaciones = COALESCE(NULLIF(btrim(COALESCE(observaciones, '')), ''), notas)
WHERE observaciones IS NULL OR btrim(observaciones) = '';

-- ----------------------------------------------------------------------------
-- Columnas runtime: pedido_despachos.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_despachos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS detalle_id uuid,
  ADD COLUMN IF NOT EXISTS producto_id uuid,
  ADD COLUMN IF NOT EXISTS cantidad numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registrado_por uuid,
  ADD COLUMN IF NOT EXISTS registrado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS almacen_id uuid,
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.pedido_despachos
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN detalle_id TYPE uuid USING app.to_uuid_or_null(COALESCE(detalle_id::text, '')),
  ALTER COLUMN producto_id TYPE uuid USING app.to_uuid_or_null(COALESCE(producto_id::text, '')),
  ALTER COLUMN cantidad TYPE numeric(14,2) USING app.to_numeric_or_zero(cantidad::text),
  ALTER COLUMN registrado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(registrado_por::text, '')),
  ALTER COLUMN registrado_en TYPE timestamptz USING CASE
    WHEN registrado_en IS NULL OR btrim(registrado_en::text) = '' THEN NULL
    ELSE registrado_en::timestamptz
  END,
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN almacen_id TYPE uuid USING app.to_uuid_or_null(COALESCE(almacen_id::text, '')),
  ALTER COLUMN ubicacion_id TYPE uuid USING app.to_uuid_or_null(COALESCE(ubicacion_id::text, '')),
  ALTER COLUMN lote TYPE text USING NULLIF(btrim(COALESCE(lote, '')), ''),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN cantidad SET DEFAULT 0,
  ALTER COLUMN registrado_en SET DEFAULT now(),
  ALTER COLUMN estado SET DEFAULT 'REGISTRADO',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- ----------------------------------------------------------------------------
-- Columnas runtime: pedido_gres.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.pedido_gres
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS gre_id uuid,
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS creado_por uuid,
  ADD COLUMN IF NOT EXISTS creado_en timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.pedido_gres
  ALTER COLUMN pedido_id TYPE uuid USING app.to_uuid_or_null(COALESCE(pedido_id::text, '')),
  ALTER COLUMN gre_id TYPE uuid USING app.to_uuid_or_null(COALESCE(gre_id::text, '')),
  ALTER COLUMN estado TYPE text USING NULLIF(upper(btrim(COALESCE(estado, ''))), ''),
  ALTER COLUMN notas TYPE text USING NULLIF(btrim(COALESCE(notas, '')), ''),
  ALTER COLUMN creado_por TYPE uuid USING app.to_uuid_or_null(COALESCE(creado_por::text, '')),
  ALTER COLUMN creado_en TYPE timestamptz USING CASE
    WHEN creado_en IS NULL OR btrim(creado_en::text) = '' THEN NULL
    ELSE creado_en::timestamptz
  END,
  ALTER COLUMN created_at TYPE timestamptz USING CASE
    WHEN created_at IS NULL OR btrim(created_at::text) = '' THEN now()
    ELSE created_at::timestamptz
  END,
  ALTER COLUMN updated_at TYPE timestamptz USING CASE
    WHEN updated_at IS NULL OR btrim(updated_at::text) = '' THEN now()
    ELSE updated_at::timestamptz
  END,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN creado_en SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.pedido_gres
SET
  creado_en = COALESCE(creado_en, created_at, now()),
  created_at = COALESCE(created_at, creado_en, now()),
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Normalización runtime.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_logistica_eventos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.registrado_por := app.to_uuid_or_null(COALESCE(NEW.registrado_por::text, ''));
  v_tipo := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo, '')), ''), 'TRANSITO'));

  IF v_tipo = 'INCIDENCIA' THEN v_tipo := 'TRANSITO'; END IF;
  IF v_tipo NOT IN ('PICKING', 'PACKING', 'DESPACHO', 'TRANSITO', 'ENTREGA', 'BACKORDER') THEN
    v_tipo := 'TRANSITO';
  END IF;
  NEW.tipo := v_tipo;

  NEW.datos := COALESCE(NEW.datos, '{}'::jsonb);
  IF jsonb_typeof(NEW.datos) <> 'object' THEN
    NEW.datos := '{}'::jsonb;
  END IF;

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  NEW.registrado_en := COALESCE(NEW.registrado_en, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.registrado_en, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_logistica_eventos_row ON public.logistica_eventos;
CREATE TRIGGER trg_normalize_logistica_eventos_row
BEFORE INSERT OR UPDATE ON public.logistica_eventos
FOR EACH ROW EXECUTE FUNCTION app.normalize_logistica_eventos_row();

CREATE OR REPLACE FUNCTION app.normalize_pedido_backorders_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(COALESCE(NEW.detalle_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));

  NEW.notas := COALESCE(NULLIF(btrim(COALESCE(NEW.notas, '')), ''), NULLIF(btrim(COALESCE(NEW.observaciones, '')), ''));
  NEW.observaciones := COALESCE(NULLIF(btrim(COALESCE(NEW.observaciones, '')), ''), NEW.notas);

  NEW.cantidad_comprometida := round(GREATEST(COALESCE(NEW.cantidad_comprometida, 0), 0)::numeric, 2);
  NEW.cantidad_despachada := round(GREATEST(COALESCE(NEW.cantidad_despachada, 0), 0)::numeric, 2);
  NEW.cantidad_pendiente := round(GREATEST(COALESCE(NEW.cantidad_pendiente, 0), 0)::numeric, 2);
  NEW.prioridad := LEAST(GREATEST(COALESCE(NEW.prioridad, 3), 1), 5);

  IF NEW.cantidad_comprometida <= 0 THEN
    NEW.cantidad_comprometida := round((NEW.cantidad_despachada + NEW.cantidad_pendiente)::numeric, 2);
  END IF;
  NEW.cantidad_despachada := LEAST(NEW.cantidad_despachada, NEW.cantidad_comprometida);
  NEW.cantidad_pendiente := round(GREATEST(NEW.cantidad_comprometida - NEW.cantidad_despachada, 0)::numeric, 2);

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'PENDIENTE'));
  IF v_estado = 'ACTIVO' OR v_estado = 'ABIERTO' THEN v_estado := 'PENDIENTE'; END IF;
  IF v_estado = 'DESPACHADO' THEN v_estado := 'CERRADO'; END IF;
  IF v_estado = 'COMPLETADO' THEN v_estado := 'CERRADO'; END IF;
  IF v_estado = 'PENDIENTE_PARCIAL' THEN v_estado := 'PARCIAL'; END IF;
  IF v_estado NOT IN ('PENDIENTE', 'PARCIAL', 'CERRADO') THEN
    v_estado := CASE
      WHEN NEW.cantidad_pendiente = 0 AND NEW.cantidad_comprometida > 0 THEN 'CERRADO'
      WHEN NEW.cantidad_despachada > 0 THEN 'PARCIAL'
      ELSE 'PENDIENTE'
    END;
  END IF;
  IF NEW.cantidad_pendiente = 0 AND NEW.cantidad_comprometida > 0 THEN
    v_estado := 'CERRADO';
  ELSIF NEW.cantidad_despachada > 0 THEN
    v_estado := 'PARCIAL';
  END IF;
  NEW.estado := v_estado;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pedido_backorders_row ON public.pedido_backorders;
CREATE TRIGGER trg_normalize_pedido_backorders_row
BEFORE INSERT OR UPDATE ON public.pedido_backorders
FOR EACH ROW EXECUTE FUNCTION app.normalize_pedido_backorders_row();

CREATE OR REPLACE FUNCTION app.normalize_pedido_despachos_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.detalle_id := app.to_uuid_or_null(COALESCE(NEW.detalle_id::text, ''));
  NEW.producto_id := app.to_uuid_or_null(COALESCE(NEW.producto_id::text, ''));
  NEW.registrado_por := app.to_uuid_or_null(COALESCE(NEW.registrado_por::text, ''));
  NEW.almacen_id := app.to_uuid_or_null(COALESCE(NEW.almacen_id::text, ''));
  NEW.ubicacion_id := app.to_uuid_or_null(COALESCE(NEW.ubicacion_id::text, ''));

  NEW.cantidad := round(GREATEST(COALESCE(NEW.cantidad, 0), 0)::numeric, 2);
  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.lote := NULLIF(btrim(COALESCE(NEW.lote, '')), '');

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'REGISTRADO'));
  IF v_estado = 'ACTIVO' THEN v_estado := 'REGISTRADO'; END IF;
  IF v_estado NOT IN ('REGISTRADO', 'ANULADO') THEN v_estado := 'REGISTRADO'; END IF;
  NEW.estado := v_estado;

  NEW.registrado_en := COALESCE(NEW.registrado_en, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.registrado_en, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pedido_despachos_row ON public.pedido_despachos;
CREATE TRIGGER trg_normalize_pedido_despachos_row
BEFORE INSERT OR UPDATE ON public.pedido_despachos
FOR EACH ROW EXECUTE FUNCTION app.normalize_pedido_despachos_row();

CREATE OR REPLACE FUNCTION app.normalize_pedido_gres_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.pedido_id := app.to_uuid_or_null(COALESCE(NEW.pedido_id::text, ''));
  NEW.gre_id := app.to_uuid_or_null(COALESCE(NEW.gre_id::text, ''));
  NEW.creado_por := app.to_uuid_or_null(COALESCE(NEW.creado_por::text, ''));

  v_estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'BORRADOR'));
  IF v_estado = 'ACTIVO' OR v_estado = 'RELACIONADO' OR v_estado = 'PENDIENTE' THEN v_estado := 'BORRADOR'; END IF;
  IF v_estado = 'ERROR' THEN v_estado := 'RECHAZADO'; END IF;
  IF v_estado = 'CANCELADO' THEN v_estado := 'ANULADO'; END IF;
  IF v_estado = 'EMITIDO' THEN v_estado := 'ENVIADO'; END IF;
  IF v_estado NOT IN ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO') THEN
    v_estado := 'BORRADOR';
  END IF;
  NEW.estado := v_estado;

  NEW.notas := NULLIF(btrim(COALESCE(NEW.notas, '')), '');
  NEW.creado_en := COALESCE(NEW.creado_en, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.creado_en, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pedido_gres_row ON public.pedido_gres;
CREATE TRIGGER trg_normalize_pedido_gres_row
BEFORE INSERT OR UPDATE ON public.pedido_gres
FOR EACH ROW EXECUTE FUNCTION app.normalize_pedido_gres_row();

-- ----------------------------------------------------------------------------
-- Backfill defensivo + índices runtime.
-- ----------------------------------------------------------------------------
UPDATE public.logistica_eventos SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.pedido_backorders SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.pedido_despachos SET updated_at = COALESCE(updated_at, now()) WHERE true;
UPDATE public.pedido_gres SET updated_at = COALESCE(updated_at, now()) WHERE true;

CREATE INDEX IF NOT EXISTS idx_logistica_eventos_tenant_pedido_registrado_runtime
ON public.logistica_eventos (tenant_id, pedido_id, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_logistica_eventos_tenant_tipo_registrado_runtime
ON public.logistica_eventos (tenant_id, tipo, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_pedido_prioridad_runtime
ON public.pedido_backorders (tenant_id, pedido_id, prioridad, proxima_fecha_compromiso, created_at);

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_tenant_estado_runtime
ON public.pedido_backorders (tenant_id, estado, prioridad, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_despachos_tenant_pedido_registrado_runtime
ON public.pedido_despachos (tenant_id, pedido_id, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_despachos_tenant_detalle_runtime
ON public.pedido_despachos (tenant_id, detalle_id, registrado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_gres_tenant_pedido_creado_runtime
ON public.pedido_gres (tenant_id, pedido_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedido_gres_tenant_gre_runtime
ON public.pedido_gres (tenant_id, gre_id, creado_en DESC);

COMMIT;
