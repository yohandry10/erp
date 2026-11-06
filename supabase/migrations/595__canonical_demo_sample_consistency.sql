BEGIN;
SET LOCAL search_path = pg_catalog, public, app, pg_temp;

-- Corrige las fábricas SQL usadas por el alta oficial, dentro de su misma
-- transacción. No hay backfill, renumeración ni cambio de evidencia fiscal.
-- Las definiciones históricas se preservan salvo los fragmentos comprobados.
DO $patch$
DECLARE
 definition text;
 old_quote text := $$jsonb_build_array(jsonb_build_object('producto_id', v_producto_4, 'cantidad', 4, 'precio_unitario', 89.9))$$;
 new_quote text := $$jsonb_build_array(jsonb_build_object('producto_id', v_producto_4, 'cantidad', 4, 'precio_unitario', 87.5))$$;
 anchor text := E'\n  v_report := app.demo_readiness_report(p_tenant_id);';
 additions text := $sample$
  -- canonical_demo_consistency_595: sólo filas creadas en esta hidratación.
  -- El número 1 ya pertenece a la factura semilla; nunca retroceder una serie.
  INSERT INTO public.documento_series (
    tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
    longitud_correlativo, activo, estado
  ) VALUES (p_tenant_id, 'FACTURA', 'F001', 1, 99999999, 8, true, 'ACTIVO')
  ON CONFLICT (tenant_id, tipo_documento, serie) DO UPDATE
  SET correlativo_actual = greatest(public.documento_series.correlativo_actual, EXCLUDED.correlativo_actual),
      updated_at = now();

  INSERT INTO public.cotizacion_detalles (
    tenant_id, cotizacion_id, producto_id, producto_nombre, descripcion,
    cantidad, precio_unitario, descuento_porcentaje, descuento_monto, subtotal, orden
  )
  SELECT p_tenant_id, q.id, p.id, p.nombre, p.nombre, 4, 87.5, 0, 0, 350, 1
  FROM public.cotizaciones q
  JOIN public.productos p ON p.id=v_producto_4 AND p.tenant_id=q.tenant_id
  WHERE q.tenant_id=p_tenant_id AND q.numero='COT-DEMO-001'
    AND q.metadata->>'source'='demo_business_seed_v1'
    AND NOT EXISTS(SELECT 1 FROM public.cotizacion_detalles d WHERE d.cotizacion_id=q.id);

$sample$;
 bank_columns text := 'saldo, saldo_actual, saldo_contable, permite_sobregiro';
 bank_values text := '''CORRIENTE'', v_currency, 50000, 50000, 50000, false, true, true';
 bank_columns_new text := 'saldo, saldo_inicial, saldo_actual, saldo_contable, permite_sobregiro';
 bank_values_new text := '''CORRIENTE'', v_currency, 50000, 50000, 50000, 50000, false, true, true';
BEGIN
 definition := pg_get_functiondef('app.hydrate_demo_business_sample_tx(uuid,uuid)'::regprocedure);
 IF strpos(definition,'canonical_demo_consistency_595')=0 THEN
  IF (length(definition)-length(replace(definition,old_quote,'')))/length(old_quote)<>1
    OR (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
   RAISE EXCEPTION 'DEMO_595_BUSINESS_DEFINITION_UNEXPECTED';
  END IF;
  EXECUTE replace(replace(definition,old_quote,new_quote),anchor,additions||anchor);
 END IF;

 definition := pg_get_functiondef('app.hydrate_demo_foundation_464_legacy_524(uuid,uuid,text,bytea,text,timestamptz)'::regprocedure);
 IF strpos(definition,bank_columns_new)=0 THEN
  IF (length(definition)-length(replace(definition,bank_columns,'')))/length(bank_columns)<>1
    OR (length(definition)-length(replace(definition,bank_values,'')))/length(bank_values)<>1 THEN
   RAISE EXCEPTION 'DEMO_595_FOUNDATION_DEFINITION_UNEXPECTED';
  END IF;
  EXECUTE replace(replace(definition,bank_columns,bank_columns_new),bank_values,bank_values_new);
 END IF;
END;
$patch$;
COMMIT;
