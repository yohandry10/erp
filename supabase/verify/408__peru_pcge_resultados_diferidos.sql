DO $$
DECLARE
  v_missing integer;
BEGIN
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
    RAISE EXCEPTION 'Faltan % cuentas PCGE operativas de diferidos', v_missing;
  END IF;
END
$$;
