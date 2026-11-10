BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Importes de una nueva devolución: se conserva el importe acumulado de la
-- línea original, sus componentes y lo ya acreditado. No reescribe notas.
CREATE OR REPLACE FUNCTION app.rma_line_credit_allocation_596(
  p_source_quantity numeric, p_source_base numeric, p_source_igv numeric,
  p_source_isc numeric, p_source_total numeric, p_quantity numeric,
  p_prior_quantity numeric, p_prior_base numeric, p_prior_igv numeric,
  p_prior_isc numeric, p_prior_total numeric
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  original numeric[] := ARRAY[p_source_base,p_source_igv,p_source_isc];
  previous numeric[] := ARRAY[p_prior_base,p_prior_igv,p_prior_isc];
  exact_cents numeric[] := ARRAY[0,0,0]::numeric[];
  allocated numeric[] := ARRAY[0,0,0]::numeric[];
  assigned boolean[] := ARRAY[false,false,false];
  quantity numeric;
  target numeric;
  difference numeric;
  selected integer;
  i integer;
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[p_source_quantity,p_source_base,
      p_source_igv,p_source_isc,p_source_total,p_quantity,p_prior_quantity,
      p_prior_base,p_prior_igv,p_prior_isc,p_prior_total]) x
    WHERE x IS NULL OR x::text IN ('NaN','Infinity','-Infinity') OR x < 0)
    OR p_source_quantity <= 0 OR p_quantity <= 0
    OR p_prior_quantity > p_source_quantity
    OR p_prior_quantity + p_quantity > p_source_quantity + 0.000001
    OR EXISTS (SELECT 1 FROM unnest(original || previous || ARRAY[p_source_total,p_prior_total]) x
      WHERE x <> round(x,2))
    OR p_source_total <> p_source_base+p_source_igv+p_source_isc THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_SOURCE_AMOUNTS_INVALID' USING ERRCODE='23514';
  END IF;
  IF p_prior_total <> p_prior_base+p_prior_igv+p_prior_isc
    OR p_prior_total <> round(p_source_total*p_prior_quantity/p_source_quantity,2)
    OR EXISTS (SELECT 1 FROM generate_subscripts(original,1) s(i)
      WHERE previous[s.i] > original[s.i]) THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED' USING ERRCODE='23514';
  END IF;
  quantity := least(p_source_quantity,p_prior_quantity+p_quantity);
  target := round(p_source_total*quantity/p_source_quantity,2)*100;
  FOR i IN 1..3 LOOP
    exact_cents[i] := original[i]*100*quantity/p_source_quantity;
    allocated[i] := greatest(previous[i]*100,
      least(original[i]*100,floor(exact_cents[i])));
  END LOOP;
  difference := target-(allocated[1]+allocated[2]+allocated[3]);
  IF abs(difference)>3 THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED' USING ERRCODE='23514';
  END IF;
  FOR n IN 1..abs(difference)::integer LOOP
    selected := NULL;
    IF difference>0 THEN
      SELECT s.i INTO selected FROM generate_subscripts(original,1) s(i)
      WHERE NOT assigned[s.i] AND allocated[s.i]<original[s.i]*100
      ORDER BY exact_cents[s.i]-floor(exact_cents[s.i]) DESC,s.i LIMIT 1;
    ELSE
      SELECT s.i INTO selected FROM generate_subscripts(original,1) s(i)
      WHERE NOT assigned[s.i] AND allocated[s.i]>previous[s.i]*100
      ORDER BY exact_cents[s.i]-floor(exact_cents[s.i]),s.i DESC LIMIT 1;
    END IF;
    IF selected IS NULL THEN
      RAISE EXCEPTION 'RMA_CREDIT_NOTE_PRIOR_ROUNDING_REVIEW_REQUIRED' USING ERRCODE='23514';
    END IF;
    allocated[selected] := allocated[selected]+sign(difference);
    assigned[selected] := true;
  END LOOP;
  IF allocated[1]+allocated[2]+allocated[3]<>target THEN
    RAISE EXCEPTION 'RMA_CREDIT_NOTE_ALLOCATION_INCONSISTENT' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object(
    'base',allocated[1]/100-p_prior_base,
    'igv',allocated[2]/100-p_prior_igv,
    'isc',allocated[3]/100-p_prior_isc,
    'total',target/100-p_prior_total);
END;
$fn$;
REVOKE ALL ON FUNCTION app.rma_line_credit_allocation_596(
  numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE
  definition text;
  declaration text := E'  v_result jsonb;';
  source_anchor text := '  v_expected_series := CASE WHEN upper(v_original_cpe.tipo_documento) = ''01''';
  old_calculation text := $old$    v_order := v_order + 1;
    v_line_value := round(coalesce(v_line.source_value, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_igv := round(coalesce(v_line.source_igv, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_isc := round(coalesce(v_line.source_isc, 0)
      * v_line.cantidad_devuelta / v_line.source_quantity, 2);
    v_line_total := round(v_line_value + v_line_igv + v_line_isc, 2);$old$;
  new_calculation text := $new$    -- cumulative_credit_rounding_596: el documento origen ya está FOR UPDATE.
    -- Ese lock serializa las notas de distintas RMA de la misma venta.
    SELECT coalesce(sum(nd.cantidad),0),coalesce(sum(nd.valor_venta),0),
      coalesce(sum(nd.impuesto_igv),0),coalesce(sum(nd.impuesto_isc),0),
      coalesce(sum(nd.total_item),0)
    INTO v_prior_quantity,v_prior_base,v_prior_igv,v_prior_isc,v_prior_total
    FROM public.rma_solicitudes prior
    JOIN public.documento_detalles nd
      ON nd.documento_id=prior.nota_credito_documento_id
      AND nd.tenant_id=prior.tenant_id
    WHERE prior.tenant_id=p_tenant_id
      AND prior.documento_origen_id=v_documento.id
      AND prior.nota_credito_documento_id IS NOT NULL
      AND nd.metadata->>'source_document_line_id'=v_line.documento_detalle_id::text;
    v_allocation := app.rma_line_credit_allocation_596(
      v_line.source_quantity,v_line.source_value,coalesce(v_line.source_igv,0),
      coalesce(v_line.source_isc,0),v_line.source_total,v_line.cantidad_devuelta,
      v_prior_quantity,v_prior_base,v_prior_igv,v_prior_isc,v_prior_total);
    v_order := v_order + 1;
    v_line_value := (v_allocation->>'base')::numeric;
    v_line_igv := (v_allocation->>'igv')::numeric;
    v_line_isc := (v_allocation->>'isc')::numeric;
    v_line_total := (v_allocation->>'total')::numeric;$new$;
  source_guard text := $guard$
  -- Un origen histórico inconsistente exige revisión, nunca una NC inventada.
  IF EXISTS (
    SELECT 1 FROM (SELECT count(*) AS lines,sum(dd.valor_venta) AS base,
      sum(dd.impuesto_igv) AS igv,sum(dd.impuesto_isc) AS isc,
      sum(dd.total_item) AS total FROM public.documento_detalles dd
      WHERE dd.tenant_id=p_tenant_id AND dd.documento_id=v_documento.id) s
    WHERE s.lines=0 OR s.base IS DISTINCT FROM v_documento.subtotal
      OR coalesce(s.igv,0) IS DISTINCT FROM coalesce(v_documento.impuesto_igv,0)
      OR coalesce(s.isc,0) IS DISTINCT FROM coalesce(v_documento.impuesto_isc,0)
      OR s.total IS DISTINCT FROM v_documento.total
  ) THEN
    RAISE EXCEPTION 'RMA_SOURCE_LINE_TOTALS_INCONSISTENT' USING ERRCODE='23514';
  END IF;
$guard$;
BEGIN
  definition := pg_get_functiondef('public.emitir_nota_credito_rma_legacy_532(uuid,uuid,uuid,jsonb,text)'::regprocedure);
  IF strpos(definition,'cumulative_credit_rounding_596')=0 THEN
    IF (length(definition)-length(replace(definition,declaration,'')))/length(declaration)<>1
      OR (length(definition)-length(replace(definition,source_anchor,'')))/length(source_anchor)<>1
      OR (length(definition)-length(replace(definition,old_calculation,'')))/length(old_calculation)<>1 THEN
      RAISE EXCEPTION 'RMA_596_LEGACY_DEFINITION_UNEXPECTED';
    END IF;
    definition := replace(definition,declaration,declaration||E'\n  v_allocation jsonb;\n  v_prior_quantity numeric;\n  v_prior_base numeric;\n  v_prior_igv numeric;\n  v_prior_isc numeric;\n  v_prior_total numeric;');
    definition := replace(definition,source_anchor,source_guard||source_anchor);
    EXECUTE replace(definition,old_calculation,new_calculation);
  END IF;
END;
$patch$;
COMMIT;
