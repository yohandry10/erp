-- 508__retencion_de_cuarta_categoria.sql
--
-- El recibo por honorarios se podia registrar --`cxp.service.ts` acepta el tipo
-- 02 desde siempre-- pero no pasaba nada mas con el. La retencion del 8% de
-- renta de cuarta categoria no se calculaba en ningun sitio, y `RECIBO_HONORARIOS`
-- no aparecia aguas abajo mas que en el mapa que lo normaliza.
--
-- La consecuencia estaba dos modulos mas alla y no se veia desde aqui: la
-- planilla electronica lee la cuarta categoria del T-Registro de
-- `public.libro_retenciones` --`planilla-electronica-peru.service.ts`, filtrando
-- por `categoria_retencion = 'CUARTA'`-- y **nadie escribia nunca en esa tabla**.
-- Cero filas en produccion. Es decir: esa seccion del T-Registro salia siempre
-- vacia, y el contribuyente declaraba que no retuvo nada a ningun independiente.
--
-- La retencion se anota en un trigger y no en el servicio porque el alta de una
-- cuenta por pagar no es un writer SQL: es un `insert` desde TypeScript. Hacerlo
-- despues, desde el servicio, serian dos operaciones sin transaccion, y un fallo
-- entre ambas dejaria el gasto registrado y la retencion no.
--
-- Reglas aplicadas, y de donde salen:
--
--   * Tasa del 8 % sobre el importe del recibo (art. 74 de la Ley del Impuesto
--     a la Renta).
--   * Solo si el recibo supera el importe minimo. El limite lo fija SUNAT cada
--     ano; el vigente se guarda en `app.parametros_retencion_cuarta` en vez de
--     quedar enterrado en el cuerpo de una funcion, porque cambia y quien lo
--     actualiza no tiene por que leer plpgsql.
--   * Ningun importe si el proveedor tiene suspension de retenciones vigente.
--     Es un tramite real ante SUNAT y sin representarlo el sistema retendria a
--     quien no debe.
--
-- No se retiene sobre notas de credito ni sobre documentos anulados.

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Los parametros, en una tabla y no dentro de una funcion
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.parametros_retencion_cuarta (
  anio integer PRIMARY KEY,
  tasa numeric(5,4) NOT NULL,
  importe_minimo numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8 % y el minimo vigente. Al cambiar de ano se anade una fila, no se edita
-- codigo: los recibos ya emitidos conservan el parametro con el que se
-- calcularon porque la busqueda es por el ano de la fecha de emision.
INSERT INTO app.parametros_retencion_cuarta (anio, tasa, importe_minimo)
VALUES (2025, 0.08, 1500.00), (2026, 0.08, 1500.00)
ON CONFLICT (anio) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. La suspension de retenciones del proveedor
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.proveedores
  ADD COLUMN IF NOT EXISTS suspension_retencion_cuarta_hasta date;

COMMENT ON COLUMN public.proveedores.suspension_retencion_cuarta_hasta IS
  'Fecha hasta la que rige la constancia de suspension de retenciones de cuarta categoria emitida por SUNAT. NULL = sin suspension.';

-- ----------------------------------------------------------------------------
-- 3. La anotacion en el libro de retenciones
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.anotar_retencion_cuarta_508()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tasa numeric;
  v_minimo numeric;
  v_suspension date;
  v_retencion numeric;
  v_fecha date;
BEGIN
  IF NEW.tenant_id IS NULL
     OR upper(COALESCE(NEW.tipo_documento, '')) <> 'RECIBO_HONORARIOS' THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(NEW.estado, '')) IN ('ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA') THEN
    RETURN NEW;
  END IF;

  v_fecha := COALESCE(NEW.fecha_emision, current_date);

  SELECT tasa, importe_minimo INTO v_tasa, v_minimo
  FROM app.parametros_retencion_cuarta
  WHERE anio = EXTRACT(YEAR FROM v_fecha)::integer;

  -- Sin parametros para el ano no se inventa una tasa: se deja constancia y se
  -- sigue. Retener con un numero adivinado seria peor que no retener.
  IF v_tasa IS NULL THEN
    RAISE WARNING
      'RETENCION_CUARTA: sin parametros para el ano %; el recibo % queda sin retencion anotada',
      EXTRACT(YEAR FROM v_fecha)::integer, NEW.numero_documento;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.total, 0) <= v_minimo THEN
    RETURN NEW;
  END IF;

  SELECT p.suspension_retencion_cuarta_hasta INTO v_suspension
  FROM public.proveedores p
  WHERE p.id = NEW.proveedor_id AND p.tenant_id = NEW.tenant_id;

  IF v_suspension IS NOT NULL AND v_suspension >= v_fecha THEN
    RETURN NEW;
  END IF;

  v_retencion := round(COALESCE(NEW.total, 0) * v_tasa, 2);

  INSERT INTO public.libro_retenciones (
    tenant_id, proveedor_id, categoria_retencion, numero_comprobante,
    fecha_emision, fecha_pago, monto_pago, tasa_retencion, monto_retencion,
    monto_neto, estado, metadata
  )
  VALUES (
    NEW.tenant_id, NEW.proveedor_id, 'CUARTA', NEW.numero_documento,
    v_fecha, v_fecha, round(COALESCE(NEW.total, 0), 2), v_tasa, v_retencion,
    round(COALESCE(NEW.total, 0) - v_retencion, 2), 'ACTIVO',
    jsonb_build_object('source', 'trg_anotar_retencion_cuarta_508', 'cuenta_por_pagar_id', NEW.id)
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anotar_retencion_cuarta_508 ON public.cuentas_por_pagar;
CREATE TRIGGER trg_anotar_retencion_cuarta_508
AFTER INSERT ON public.cuentas_por_pagar
FOR EACH ROW
EXECUTE FUNCTION app.anotar_retencion_cuarta_508();

-- Una anotacion por comprobante y contribuyente: si el alta se reintenta, no se
-- retiene dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS ux_libro_retenciones_cuarta_comprobante
ON public.libro_retenciones (tenant_id, categoria_retencion, numero_comprobante)
WHERE categoria_retencion = 'CUARTA';

COMMIT;
