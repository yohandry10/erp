-- 504__operacion_hereda_su_sucursal.sql
--
-- La 503 puso la sucursal donde vive la estructura --series, almacenes, cajas--
-- pero las tablas donde ocurre la operacion se quedaron fuera: `ventas_pos`,
-- `sesiones_caja`, `movimientos_inventario`, `cpe_documentos` y `documentos` no
-- saben en que establecimiento pasaron las cosas. Sin eso no hay stock por
-- sucursal, ni caja por sucursal, ni un informe de ventas por local: solo una
-- estructura bien modelada sobre la que no se puede preguntar nada.
--
-- La decision de fondo es **derivar, no duplicar**. Cada una de estas filas ya
-- dice donde ocurrio, solo que indirectamente:
--
--     ventas_pos            -> sesion_caja -> caja      -> sucursal
--     sesiones_caja         -> caja                     -> sucursal
--     movimientos_inventario-> almacen                  -> sucursal
--     cpe                   -> serie                    -> sucursal
--     documentos            -> serie                    -> sucursal
--
-- `cpe_documentos` no aparece en esa lista porque no es una tabla sino una vista
-- sobre `cpe`; se le anade la columna al final para que los informes que ya
-- leen por ahi no tengan que cambiar de fuente.
--
-- Se podria consultar por join y no guardar nada, pero entonces cada informe
-- paga dos saltos y el filtro por sucursal se vuelve caro justo en el POS, que
-- es donde mas se consulta. Y se podria guardar el valor y ya esta, pero
-- entonces puede mentir: una venta sellada en la sucursal 0002 hecha en una caja
-- de la 0003 es un dato corrupto que nadie detecta hasta que los informes no
-- cuadran.
--
-- Asi que se hacen las dos cosas: se guarda **y** se deriva en un trigger que
-- **rechaza** cualquier valor que no coincida con su ancla. Es el mismo patron
-- con el que este esquema ya protege el stock --`trg_enforce_product_stock_is_derived_350`
-- rechaza cualquier `productos.stock_actual` que no sea la suma de sus
-- existencias-- y por el mismo motivo: un valor derivado que se puede escribir a
-- mano deja de ser derivado el dia que alguien lo escribe.
--
-- `producto_existencias` se queda fuera a proposito y sin columna: el stock ya
-- esta por almacen y el almacen ya sabe su sucursal, y siempre se consulta por
-- almacen. Anadir la columna seria duplicar sin ganar una sola consulta.
--
-- Ninguna derivacion bloquea una emision. Si la serie de un comprobante no esta
-- registrada en `documento_series` --posible en datos historicos-- la fila cae
-- en la casa matriz en vez de fallar: una factura no se queda sin emitir porque
-- falte enganchar una serie a su local.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Las columnas
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ventas_pos ADD COLUMN IF NOT EXISTS sucursal_id uuid;
ALTER TABLE IF EXISTS public.sesiones_caja ADD COLUMN IF NOT EXISTS sucursal_id uuid;
ALTER TABLE IF EXISTS public.movimientos_inventario ADD COLUMN IF NOT EXISTS sucursal_id uuid;
ALTER TABLE IF EXISTS public.cpe ADD COLUMN IF NOT EXISTS sucursal_id uuid;
ALTER TABLE IF EXISTS public.documentos ADD COLUMN IF NOT EXISTS sucursal_id uuid;

-- ----------------------------------------------------------------------------
-- 2. Resolver la sucursal desde el ancla
--
--    Devuelve NULL si el ancla no resuelve nada; quien llama decide si eso es un
--    error o una caida a la casa matriz.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sucursal_de_caja(p_tenant_id uuid, p_caja_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT c.sucursal_id FROM public.cajas c
  WHERE c.id = p_caja_id AND c.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION app.sucursal_de_sesion_caja(p_tenant_id uuid, p_sesion_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT COALESCE(s.sucursal_id, app.sucursal_de_caja(p_tenant_id, s.caja_id))
  FROM public.sesiones_caja s
  WHERE s.id = p_sesion_id AND s.tenant_id = p_tenant_id;
$$;

CREATE OR REPLACE FUNCTION app.sucursal_de_almacen(p_tenant_id uuid, p_almacen_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT a.sucursal_id FROM public.almacenes a
  WHERE a.id = p_almacen_id AND a.tenant_id = p_tenant_id;
$$;

-- El comprobante lo decide su serie, que es como lo decide SUNAT. Se busca con
-- el tipo cuando viene, porque `documento_series` es unica por
-- (tenant, tipo_documento, serie); sin tipo se cae a la serie sola.
CREATE OR REPLACE FUNCTION app.sucursal_de_serie(
  p_tenant_id uuid,
  p_serie text,
  p_tipo_documento text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT ds.sucursal_id
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id
    AND upper(btrim(COALESCE(ds.serie, ''))) = upper(btrim(COALESCE(p_serie, '')))
    AND (
      p_tipo_documento IS NULL
      OR upper(btrim(COALESCE(ds.tipo_documento, ''))) = upper(btrim(p_tipo_documento))
    )
  ORDER BY (upper(btrim(COALESCE(ds.tipo_documento, ''))) = upper(btrim(COALESCE(p_tipo_documento, '')))) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.casa_matriz_de(p_tenant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT s.id FROM public.sucursales s
  WHERE s.tenant_id = p_tenant_id AND s.es_principal;
$$;

-- ----------------------------------------------------------------------------
-- 3. Derivar y rechazar la mentira
--
--    Un solo cuerpo para las cinco tablas: el ancla se resuelve segun TG_TABLE_NAME.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_sucursal_derivada_504()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_derivada uuid;
  v_ancla text;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'ventas_pos' THEN
    v_ancla := 'la caja de su sesion';
    v_derivada := app.sucursal_de_sesion_caja(NEW.tenant_id, NEW.sesion_caja_id);
  ELSIF TG_TABLE_NAME = 'sesiones_caja' THEN
    v_ancla := 'su caja';
    v_derivada := app.sucursal_de_caja(NEW.tenant_id, NEW.caja_id);
  ELSIF TG_TABLE_NAME = 'movimientos_inventario' THEN
    v_ancla := 'su almacen';
    v_derivada := app.sucursal_de_almacen(NEW.tenant_id, NEW.almacen_id);
  ELSE
    v_ancla := 'su serie';
    v_derivada := app.sucursal_de_serie(NEW.tenant_id, NEW.serie, NEW.tipo_documento);
  END IF;

  -- Sin ancla resoluble, la casa matriz. Nunca se bloquea la operacion por esto.
  IF v_derivada IS NULL THEN
    v_derivada := app.casa_matriz_de(NEW.tenant_id);
  END IF;

  IF v_derivada IS NULL THEN
    RAISE EXCEPTION
      'SUCURSALES: el contribuyente % no tiene casa matriz; falta el trigger trg_seed_casa_matriz_for_tenant',
      NEW.tenant_id;
  END IF;

  -- Aqui esta el motivo de todo el trigger: el valor guardado no puede
  -- contradecir a su ancla. Si alguien intenta sellar la fila en otra sucursal,
  -- se rechaza en vez de aceptarse y descuadrar los informes en silencio.
  IF NEW.sucursal_id IS NOT NULL AND NEW.sucursal_id IS DISTINCT FROM v_derivada THEN
    RAISE EXCEPTION
      'SUCURSAL_DERIVADA: %.sucursal_id dice % pero % dice %; la sucursal de una operacion no se escribe, se hereda',
      TG_TABLE_NAME, NEW.sucursal_id, v_ancla, v_derivada;
  END IF;

  NEW.sucursal_id := v_derivada;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Relleno historico desde el ancla
-- ----------------------------------------------------------------------------
UPDATE public.sesiones_caja s
SET sucursal_id = COALESCE(app.sucursal_de_caja(s.tenant_id, s.caja_id), app.casa_matriz_de(s.tenant_id))
WHERE s.tenant_id IS NOT NULL AND s.sucursal_id IS NULL;

UPDATE public.ventas_pos v
SET sucursal_id = COALESCE(app.sucursal_de_sesion_caja(v.tenant_id, v.sesion_caja_id), app.casa_matriz_de(v.tenant_id))
WHERE v.tenant_id IS NOT NULL AND v.sucursal_id IS NULL;

UPDATE public.movimientos_inventario m
SET sucursal_id = COALESCE(app.sucursal_de_almacen(m.tenant_id, m.almacen_id), app.casa_matriz_de(m.tenant_id))
WHERE m.tenant_id IS NOT NULL AND m.sucursal_id IS NULL;

UPDATE public.cpe d
SET sucursal_id = COALESCE(app.sucursal_de_serie(d.tenant_id, d.serie, d.tipo_documento), app.casa_matriz_de(d.tenant_id))
WHERE d.tenant_id IS NOT NULL AND d.sucursal_id IS NULL;

UPDATE public.documentos d
SET sucursal_id = COALESCE(app.sucursal_de_serie(d.tenant_id, d.serie, d.tipo_documento), app.casa_matriz_de(d.tenant_id))
WHERE d.tenant_id IS NOT NULL AND d.sucursal_id IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Triggers, claves foraneas compuestas e indices
--
--    El nombre empieza por `trg_sucursal_` para que corra despues de los
--    `trg_normalize_*` de cada tabla, igual que en la 503.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'ventas_pos', 'sesiones_caja', 'movimientos_inventario',
      'cpe', 'documentos'
    ]) AS tabla
  LOOP
    IF to_regclass('public.' || r.tabla) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_sucursal_derivada_%I ON public.%I', r.tabla, r.tabla);
    EXECUTE format(
      'CREATE TRIGGER trg_sucursal_derivada_%I
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION app.enforce_sucursal_derivada_504()',
      r.tabla, r.tabla
    );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || r.tabla || '_sucursal_tenant'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I
           FOREIGN KEY (tenant_id, sucursal_id)
           REFERENCES public.sucursales (tenant_id, id)
           ON DELETE RESTRICT NOT VALID',
        r.tabla, 'fk_' || r.tabla || '_sucursal_tenant'
      );
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
                     r.tabla, 'fk_' || r.tabla || '_sucursal_tenant');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ck_' || r.tabla || '_sucursal_presente'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I
           CHECK (sucursal_id IS NOT NULL OR tenant_id IS NULL) NOT VALID',
        r.tabla, 'ck_' || r.tabla || '_sucursal_presente'
      );
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
                     r.tabla, 'ck_' || r.tabla || '_sucursal_presente');
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, sucursal_id)',
      'idx_' || r.tabla || '_sucursal', r.tabla
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 6. El stock por sucursal, que es lo que el cliente pide ver
--
--    Sale de los almacenes y no de una columna nueva. Se expone como vista para
--    que ningun informe tenga que recordar la cadena de saltos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.stock_por_sucursal AS
SELECT
  a.tenant_id,
  a.sucursal_id,
  s.codigo_establecimiento,
  s.nombre AS sucursal_nombre,
  pe.producto_id,
  sum(COALESCE(pe.stock_actual, 0)) AS stock_actual
FROM public.producto_existencias pe
JOIN public.almacenes a ON a.id = pe.almacen_id AND a.tenant_id = pe.tenant_id
JOIN public.sucursales s ON s.id = a.sucursal_id AND s.tenant_id = a.tenant_id
GROUP BY a.tenant_id, a.sucursal_id, s.codigo_establecimiento, s.nombre, pe.producto_id;

-- La vista hereda el RLS de las tablas base porque no es SECURITY DEFINER; se
-- deja explicito para que no se convierta en una en el futuro sin advertirlo.
ALTER VIEW public.stock_por_sucursal SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 7. `cpe_documentos` expone la columna nueva
--
--    Es la vista por la que leen los informes de comprobantes. Se recrea con
--    `sucursal_id` al final para que no tengan que cambiar de fuente para
--    filtrar por establecimiento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cpe_documentos AS
SELECT
  id,
  tenant_id,
  tipo_documento,
  serie,
  numero,
  estado::text AS estado,
  fecha_emision,
  COALESCE(total_venta, 0::numeric)::numeric(14,2) AS total,
  created_at,
  updated_at,
  sucursal_id
FROM public.cpe;

ALTER VIEW public.cpe_documentos SET (security_invoker = true);

COMMIT;
