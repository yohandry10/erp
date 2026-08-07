-- ============================================================================
-- 429__contabilidad_asiento_atomic.sql
-- Cabecera y detalles de un asiento se validan e insertan en una transaccion.
-- Evita asientos vacios cuando falla la segunda llamada PostgREST.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

CREATE OR REPLACE FUNCTION app.crear_asiento_contable_tx(
  p_tenant_id uuid,
  p_fecha timestamptz,
  p_concepto text,
  p_referencia text,
  p_origen text,
  p_source_event_id uuid,
  p_usuario_id uuid,
  p_created_by text,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_asiento public.asientos_contables%ROWTYPE;
  v_total_debe numeric(14,2);
  v_total_haber numeric(14,2);
  v_cantidad integer;
BEGIN
  IF p_tenant_id IS NULL OR p_fecha IS NULL OR NULLIF(btrim(p_concepto), '') IS NULL THEN
    RAISE EXCEPTION 'tenant_id, fecha y concepto son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_detalles) <> 'array' OR jsonb_array_length(p_detalles) < 2 THEN
    RAISE EXCEPTION 'El asiento requiere al menos dos detalles' USING ERRCODE = '22023';
  END IF;

  IF p_source_event_id IS NOT NULL THEN
    SELECT * INTO v_asiento
    FROM public.asientos_contables
    WHERE tenant_id = p_tenant_id AND source_event_id = p_source_event_id
    LIMIT 1;
    IF FOUND THEN
      RETURN to_jsonb(v_asiento) || jsonb_build_object('idempotent', true);
    END IF;
  END IF;

  SELECT
    count(*),
    round(sum(COALESCE((d->>'debe')::numeric, 0)), 2),
    round(sum(COALESCE((d->>'haber')::numeric, 0)), 2)
  INTO v_cantidad, v_total_debe, v_total_haber
  FROM jsonb_array_elements(p_detalles) d
  WHERE COALESCE((d->>'debe')::numeric, 0) >= 0
    AND COALESCE((d->>'haber')::numeric, 0) >= 0
    AND ((COALESCE((d->>'debe')::numeric, 0) > 0)::int
       + (COALESCE((d->>'haber')::numeric, 0) > 0)::int) = 1
    AND NULLIF(d->>'cuenta_id', '') IS NOT NULL;

  IF v_cantidad <> jsonb_array_length(p_detalles) THEN
    RAISE EXCEPTION 'Cada detalle requiere cuenta y exactamente un importe positivo en debe o haber'
      USING ERRCODE = '22023';
  END IF;
  IF abs(v_total_debe - v_total_haber) > 0.01 THEN
    RAISE EXCEPTION 'El asiento no cuadra: Debe %, Haber %', v_total_debe, v_total_haber
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_detalles) d
    LEFT JOIN public.plan_cuentas pc
      ON pc.id = (d->>'cuenta_id')::uuid AND pc.tenant_id = p_tenant_id
    WHERE pc.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Una o mas cuentas no pertenecen al tenant' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_detalles) d
    LEFT JOIN public.centros_costo cc
      ON cc.id = NULLIF(d->>'centro_costo_id', '')::uuid AND cc.tenant_id = p_tenant_id
    WHERE NULLIF(d->>'centro_costo_id', '') IS NOT NULL AND cc.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Un centro de costo no pertenece al tenant' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    p_tenant_id, p_fecha, btrim(p_concepto), btrim(p_concepto),
    NULLIF(btrim(COALESCE(p_referencia, '')), ''), v_total_debe,
    v_total_haber, 'CONFIRMADO', COALESCE(NULLIF(btrim(p_origen), ''), 'Manual'),
    p_source_event_id, p_usuario_id, NULLIF(btrim(COALESCE(p_created_by, '')), '')
  ) RETURNING * INTO v_asiento;

  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, cuenta_id, debe, haber, concepto, nombre, centro_costo_id
  )
  SELECT
    p_tenant_id,
    v_asiento.id,
    (d->>'cuenta_id')::uuid,
    round(COALESCE((d->>'debe')::numeric, 0), 2),
    round(COALESCE((d->>'haber')::numeric, 0), 2),
    NULLIF(btrim(COALESCE(d->>'concepto', '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(d->>'concepto', '')), ''), 'Detalle contable'),
    NULLIF(d->>'centro_costo_id', '')::uuid
  FROM jsonb_array_elements(p_detalles) d;

  RETURN to_jsonb(v_asiento) || jsonb_build_object('idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crear_asiento_contable_tx(
  p_tenant_id uuid,
  p_fecha timestamptz,
  p_concepto text,
  p_referencia text,
  p_origen text,
  p_source_event_id uuid,
  p_usuario_id uuid,
  p_created_by text,
  p_detalles jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT app.crear_asiento_contable_tx(
    p_tenant_id, p_fecha, p_concepto, p_referencia, p_origen,
    p_source_event_id, p_usuario_id, p_created_by, p_detalles
  );
$function$;

REVOKE ALL ON FUNCTION app.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_asiento_contable_tx(uuid,timestamptz,text,text,text,uuid,uuid,text,jsonb)
TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
