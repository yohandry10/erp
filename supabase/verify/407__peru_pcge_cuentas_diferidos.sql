DO $$
DECLARE
  v_missing integer;
BEGIN
  IF to_regprocedure('app.seed_peru_cuentas_diferidos(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta el seed PCGE de diferidos Perú';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.empresa_config ec
  CROSS JOIN (VALUES ('18'::text), ('49'::text), ('65'::text), ('75'::text)) c(codigo)
  WHERE upper(COALESCE(ec.pais, '')) = 'PE'
    AND NOT EXISTS (
      SELECT 1 FROM public.plan_cuentas pc
      WHERE pc.tenant_id = ec.tenant_id
        AND pc.codigo = c.codigo
        AND COALESCE(pc.activo, true) = true
        AND COALESCE(pc.acepta_movimiento, false) = true
    );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'Faltan % cuentas PCGE 18/49/65/75 para empresas Perú', v_missing;
  END IF;

  IF has_function_privilege('authenticated', 'app.seed_peru_cuentas_diferidos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'El seed PCGE no puede ser ejecutable por authenticated';
  END IF;
END
$$;
