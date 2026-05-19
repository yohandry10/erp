-- Serializacion fuerte de numeracion contable.
-- El trigger reserva siempre desde la funcion transaccional para impedir que rutas
-- concurrentes con numeracion preasignada persistan el mismo numero.

BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_asiento(
  p_tenant_id uuid,
  p_fecha timestamptz
)
RETURNS TABLE(numero integer, codigo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_periodo text;
  v_max_actual integer;
  v_numero integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id requerido para numeracion contable';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha requerida para numeracion contable';
  END IF;

  v_periodo := to_char(p_fecha AT TIME ZONE 'UTC', 'YYYYMM');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_periodo, 315));

  SELECT COALESCE(MAX(ac.numero_asiento), 0)
    INTO v_max_actual
  FROM public.asientos_contables ac
  WHERE ac.tenant_id = p_tenant_id
    AND ac.fecha >= date_trunc('month', p_fecha)
    AND ac.fecha < (date_trunc('month', p_fecha) + interval '1 month')
    AND ac.numero_asiento IS NOT NULL;

  INSERT INTO public.contabilidad_asientos_numeracion (
    tenant_id,
    periodo,
    ultimo_numero,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_periodo,
    v_max_actual,
    now(),
    now()
  )
  ON CONFLICT (tenant_id, periodo) DO UPDATE
    SET ultimo_numero = GREATEST(
          public.contabilidad_asientos_numeracion.ultimo_numero,
          EXCLUDED.ultimo_numero
        ),
        updated_at = now();

  UPDATE public.contabilidad_asientos_numeracion
    SET ultimo_numero = ultimo_numero + 1,
        updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND periodo = v_periodo
  RETURNING ultimo_numero INTO v_numero;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'no se pudo reservar numero de asiento';
  END IF;

  RETURN QUERY SELECT
    v_numero,
    format('A-%s-%s', v_periodo, lpad(v_numero::text, 6, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_asiento_numbering_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_reserved record;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.fecha := COALESCE(NEW.fecha, NEW.created_at, now());

  SELECT numero, codigo
    INTO v_reserved
  FROM public.obtener_siguiente_numero_asiento(NEW.tenant_id, NEW.fecha);

  NEW.numero_asiento := v_reserved.numero;
  NEW.codigo := v_reserved.codigo;

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
