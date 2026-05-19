-- Numeracion transaccional de asientos por tenant y periodo.
-- Evita colisiones entre workers y rutas legacy: la app no calcula max(numero)+1.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contabilidad_asientos_numeracion (
  tenant_id uuid NOT NULL,
  periodo text NOT NULL,
  ultimo_numero integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contabilidad_asientos_numeracion_pk PRIMARY KEY (tenant_id, periodo),
  CONSTRAINT contabilidad_asientos_numeracion_periodo_chk CHECK (periodo ~ '^[0-9]{6}$'),
  CONSTRAINT contabilidad_asientos_numeracion_ultimo_chk CHECK (ultimo_numero >= 0)
);

ALTER TABLE public.contabilidad_asientos_numeracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_contabilidad_asientos_numeracion
ON public.contabilidad_asientos_numeracion;

CREATE POLICY tenant_isolation_contabilidad_asientos_numeracion
ON public.contabilidad_asientos_numeracion
FOR ALL
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

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

REVOKE ALL ON FUNCTION public.obtener_siguiente_numero_asiento(uuid, timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_siguiente_numero_asiento(uuid, timestamptz)
TO service_role;

COMMIT;
