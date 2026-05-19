-- Refuerzo persistente de numeracion contable.
-- Cualquier ruta que inserte asientos con numeracion manual obsoleta queda
-- alineada con la secuencia transaccional por tenant y periodo.

BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_asiento_numbering_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_periodo text;
  v_ultimo integer;
  v_reserved record;
  v_has_duplicate boolean;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.fecha := COALESCE(NEW.fecha, NEW.created_at, now());
  v_periodo := to_char(NEW.fecha AT TIME ZONE 'UTC', 'YYYYMM');

  SELECT ultimo_numero
    INTO v_ultimo
  FROM public.contabilidad_asientos_numeracion
  WHERE tenant_id = NEW.tenant_id
    AND periodo = v_periodo;

  SELECT EXISTS (
    SELECT 1
    FROM public.asientos_contables ac
    WHERE ac.tenant_id = NEW.tenant_id
      AND ac.fecha >= date_trunc('month', NEW.fecha)
      AND ac.fecha < (date_trunc('month', NEW.fecha) + interval '1 month')
      AND ac.numero_asiento = NEW.numero_asiento
  )
  INTO v_has_duplicate;

  IF NEW.numero_asiento IS NULL
     OR NEW.codigo IS NULL
     OR btrim(NEW.codigo) = ''
     OR v_has_duplicate
     OR (v_ultimo IS NOT NULL AND NEW.numero_asiento < v_ultimo) THEN
    SELECT numero, codigo
      INTO v_reserved
    FROM public.obtener_siguiente_numero_asiento(NEW.tenant_id, NEW.fecha);

    NEW.numero_asiento := v_reserved.numero;
    NEW.codigo := v_reserved.codigo;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_asiento_numbering_sequence
ON public.asientos_contables;

CREATE TRIGGER trg_enforce_asiento_numbering_sequence
BEFORE INSERT ON public.asientos_contables
FOR EACH ROW
EXECUTE FUNCTION app.enforce_asiento_numbering_sequence();

COMMIT;
