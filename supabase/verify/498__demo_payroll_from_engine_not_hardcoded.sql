-- Verificador 498: la planilla de la demo deja de traer importes escritos a mano.
--
-- El seed anotaba 416 de descuento sobre 3 200 para un trabajador cuyo contrato
-- declara AFP: 416 es el 13 % de la ONP, no el 12,92 % de una afiliación AFP. Es
-- el mismo patrón que la 497 cerró con la venta POS —dato derivado escrito a mano
-- en vez de producido por el motor— y reaparece solo cada vez que cambia una tasa.
-- Aquí se comprueba que la planilla demo nace en borrador, sin líneas, y que el
-- contrato afiliado a AFP sigue siendo coherente consigo mismo.

BEGIN;

DO $verify$
DECLARE
  v_src text;
  v_tenant uuid;
  v_planillas integer;
  v_lineas integer;
  v_estado text;
  v_regimen text;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. El seed ya no escribe líneas de planilla ni importes de planilla
  ---------------------------------------------------------------------------
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app' AND p.proname = 'hydrate_demo_business_sample_tx';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'VERIFY_498: no existe app.hydrate_demo_business_sample_tx';
  END IF;

  IF v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.empleado_planilla' THEN
    RAISE EXCEPTION 'VERIFY_498: el seed volvió a escribir líneas de planilla a mano';
  END IF;

  -- La 497 sigue vigente: esta migración redefine la misma función y no puede
  -- reintroducir la vía paralela de escritura POS que aquélla eliminó.
  IF v_src ~* 'INSERT[[:space:]]+INTO[[:space:]]+public\.ventas_pos'
     OR v_src !~* 'pos_registrar_venta_atomic_tx' THEN
    RAISE EXCEPTION 'VERIFY_498: se perdió el contrato de la 497 sobre la venta POS';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Comportamiento sobre una demo real
  ---------------------------------------------------------------------------
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  v_tenant := (public.create_demo_tenant_ready_tx(
    'VERIFY-498', 14, 'PE', 'verify-498-' || gen_random_uuid()::text
  )->>'tenant_id')::uuid;

  SELECT count(*) INTO v_planillas FROM public.planillas WHERE tenant_id = v_tenant;
  IF v_planillas < 1 THEN
    RAISE EXCEPTION 'VERIFY_498: la demo dejó de crear la planilla; el readiness la exige';
  END IF;

  SELECT lower(coalesce(estado::text, '')) INTO v_estado
  FROM public.planillas WHERE tenant_id = v_tenant LIMIT 1;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'VERIFY_498: la planilla demo no nace en borrador (estado=%)', v_estado;
  END IF;

  SELECT count(*) INTO v_lineas
  FROM public.empleado_planilla ep
  WHERE ep.tenant_id = v_tenant;
  IF v_lineas <> 0 THEN
    RAISE EXCEPTION 'VERIFY_498: la planilla demo trae % líneas precalculadas', v_lineas;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Los contratos demo declaran régimen pensionario
  ---------------------------------------------------------------------------
  -- El motor de planilla dejó de suponer AFP cuando falta el régimen: ahora falla
  -- cerrado. Un contrato demo sin régimen haría que la demo no pudiera calcular su
  -- propia planilla, así que se comprueba aquí.
  IF EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.tenant_id = v_tenant
      AND coalesce(c.activo, true)
      AND upper(coalesce(c.regimen_pensionario, '')) NOT IN ('AFP', 'ONP')
  ) THEN
    RAISE EXCEPTION 'VERIFY_498: hay contratos demo peruanos sin régimen pensionario válido';
  END IF;

  SELECT upper(coalesce(c.regimen_pensionario, '')) INTO v_regimen
  FROM public.contratos c
  WHERE c.tenant_id = v_tenant AND coalesce(c.activo, true)
    AND upper(coalesce(c.regimen_pensionario, '')) = 'AFP'
  LIMIT 1;
  IF v_regimen IS NULL THEN
    RAISE EXCEPTION 'VERIFY_498: la demo perdió el contrato AFP que ilustra el caso';
  END IF;

  RAISE NOTICE 'VERIFY_498 OK';
END;
$verify$;

ROLLBACK;
