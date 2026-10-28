-- ============================================================================
-- 578__supply_contract_penalties.sql
-- F06 ALKHOFAR: penalidades contractuales configurables.
--
-- Reglas versionadas por contrato: editar crea una versión nueva y la anterior
-- queda reemplazada. Cada cálculo es una instantánea inmutable: guarda la
-- versión de regla, las fechas, cantidades, montos y la explicación con que se
-- obtuvo. Cambiar una regla, ampliar un plazo (reprogramar) o registrar una
-- excepción sólo afecta los cálculos nuevos. La revisión (aprobar, observar,
-- controversia, descartar) es un historial aparte y la aprueba otra persona; un
-- monto aprobado es una decisión registrada, no un asiento ni un descuento
-- automático sobre la cobranza.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.penalidad_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  estado text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'REEMPLAZADA', 'ANULADA')),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 3 AND 160),
  causal text NOT NULL CHECK (causal IN ('ENTREGA_TARDIA')),
  metodo text NOT NULL CHECK (metodo IN ('MORA_OSCE', 'PORCENTAJE_DIARIO', 'IMPORTE_DIARIO', 'IMPORTE_UNICO')),
  base_calculo text NOT NULL CHECK (base_calculo IN ('VALOR_ENTREGA', 'VALOR_NO_ACEPTADO')),
  tasa numeric(9,6) CHECK (tasa IS NULL OR tasa > 0),
  importe numeric(18,2) CHECK (importe IS NULL OR importe > 0),
  factor_f numeric(5,4) CHECK (factor_f IS NULL OR factor_f > 0),
  plazo_modo text CHECK (plazo_modo IS NULL OR plazo_modo IN ('FIJO', 'OC_A_ENTREGA')),
  plazo_dias integer CHECK (plazo_dias IS NULL OR plazo_dias > 0),
  tolerancia_dias integer NOT NULL DEFAULT 0 CHECK (tolerancia_dias BETWEEN 0 AND 365),
  calendario text NOT NULL DEFAULT 'CALENDARIO' CHECK (calendario IN ('CALENDARIO', 'HABILES')),
  tope_porcentaje numeric(7,4) CHECK (tope_porcentaje IS NULL OR tope_porcentaje BETWEEN 0.0001 AND 100),
  tope_base text CHECK (tope_base IS NULL OR tope_base IN ('CONTRATO', 'ENTREGA')),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 5 AND 1000),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id),
  UNIQUE (grupo_id, version),
  UNIQUE (tenant_id, contrato_id, id),
  CHECK ((metodo = 'MORA_OSCE') = (factor_f IS NOT NULL AND plazo_modo IS NOT NULL)),
  CHECK (metodo <> 'MORA_OSCE' OR plazo_modo <> 'FIJO' OR plazo_dias IS NOT NULL),
  CHECK ((metodo = 'PORCENTAJE_DIARIO') = (tasa IS NOT NULL)),
  CHECK ((metodo IN ('IMPORTE_DIARIO', 'IMPORTE_UNICO')) = (importe IS NOT NULL)),
  CHECK ((tope_porcentaje IS NULL) = (tope_base IS NULL))
);
CREATE UNIQUE INDEX penalidad_regla_vigente_578 ON public.penalidad_reglas (grupo_id) WHERE estado = 'VIGENTE';

CREATE TABLE public.penalidad_excepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  entrega_id uuid NOT NULL REFERENCES public.suministro_entregas_programadas(id),
  grupo_id uuid,
  dias_excluidos integer NOT NULL CHECK (dias_excluidos BETWEEN 1 AND 3650),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 5 AND 1000),
  referencia text CHECK (referencia IS NULL OR length(referencia) BETWEEN 1 AND 80),
  estado text NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'ANULADA')),
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id)
);

CREATE TABLE public.penalidad_calculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  regla_id uuid NOT NULL REFERENCES public.penalidad_reglas(id),
  entrega_id uuid NOT NULL REFERENCES public.suministro_entregas_programadas(id),
  fecha_corte date NOT NULL,
  moneda text NOT NULL,
  entradas jsonb NOT NULL,
  dias_atraso integer NOT NULL CHECK (dias_atraso >= 0),
  monto_calculado numeric(18,2) NOT NULL CHECK (monto_calculado >= 0),
  monto_tope numeric(18,2),
  monto_estimado numeric(18,2) NOT NULL CHECK (monto_estimado >= 0),
  explicacion text NOT NULL,
  estado text NOT NULL DEFAULT 'ESTIMADO'
    CHECK (estado IN ('ESTIMADO', 'EN_REVISION', 'APROBADO', 'OBSERVADO', 'EN_CONTROVERSIA', 'DESCARTADO')),
  monto_aprobado numeric(18,2) CHECK (monto_aprobado IS NULL OR monto_aprobado >= 0),
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, contrato_id) REFERENCES public.suministro_contratos(tenant_id, id),
  UNIQUE (regla_id, entrega_id, fecha_corte),
  CHECK ((estado = 'APROBADO') = (monto_aprobado IS NOT NULL))
);
CREATE INDEX penalidad_calculos_contrato_578 ON public.penalidad_calculos (tenant_id, contrato_id, created_at);

-- Los datos del cálculo no cambian después de registrarse.
CREATE FUNCTION app.penalidad_calculo_inmutable_578() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.regla_id, NEW.entrega_id, NEW.fecha_corte, NEW.entradas, NEW.dias_atraso,
      NEW.monto_calculado, NEW.monto_tope, NEW.monto_estimado, NEW.explicacion, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM (OLD.regla_id, OLD.entrega_id, OLD.fecha_corte, OLD.entradas, OLD.dias_atraso,
      OLD.monto_calculado, OLD.monto_tope, OLD.monto_estimado, OLD.explicacion, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'PENALTY_CALCULATION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER penalidad_calculo_inmutable_578 BEFORE UPDATE OR DELETE ON public.penalidad_calculos
FOR EACH ROW EXECUTE FUNCTION app.penalidad_calculo_inmutable_578();
CREATE FUNCTION app.penalidad_regla_inmutable_578() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- Una versión de regla sólo cambia de estado; sus parámetros son historia.
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'estado') IS DISTINCT FROM (to_jsonb(OLD) - 'estado') THEN
    RAISE EXCEPTION 'PENALTY_RULE_VERSION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER penalidad_regla_inmutable_578 BEFORE UPDATE OR DELETE ON public.penalidad_reglas
FOR EACH ROW EXECUTE FUNCTION app.penalidad_regla_inmutable_578();

CREATE TABLE public.penalidad_revisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  calculo_id uuid NOT NULL REFERENCES public.penalidad_calculos(id),
  accion text NOT NULL CHECK (accion IN ('REVISAR', 'APROBAR', 'OBSERVAR', 'CONTROVERSIA', 'DESCARTAR')),
  estado_anterior text NOT NULL,
  estado_nuevo text NOT NULL,
  monto_aprobado numeric(18,2),
  comentario text NOT NULL CHECK (length(comentario) BETWEEN 5 AND 2000),
  actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX penalidad_revisiones_calculo_578 ON public.penalidad_revisiones (calculo_id, created_at);

DO $secure$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['penalidad_reglas', 'penalidad_excepciones', 'penalidad_calculos', 'penalidad_revisiones'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY penalidades_private_578 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

-- Días entre dos fechas (excluye el inicio): calendario o lunes a viernes.
CREATE FUNCTION app.penalidad_dias_578(p_desde date, p_hasta date, p_calendario text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_hasta <= p_desde THEN 0
    WHEN p_calendario = 'CALENDARIO' THEN p_hasta - p_desde
    ELSE (SELECT count(*)::integer FROM generate_series(p_desde + 1, p_hasta, interval '1 day') d
      WHERE extract(isodow FROM d) < 6) END
$fn$;

CREATE FUNCTION app.penalidad_sumar_dias_578(p_desde date, p_dias integer, p_calendario text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v date := p_desde; n integer := 0;
BEGIN
  IF p_calendario = 'CALENDARIO' OR p_dias = 0 THEN RETURN p_desde + p_dias; END IF;
  WHILE n < p_dias LOOP
    v := v + 1;
    IF extract(isodow FROM v) < 6 THEN n := n + 1; END IF;
  END LOOP;
  RETURN v;
END $fn$;

-- Calcula una regla para una entrega a una fecha de corte. Devuelve las
-- entradas, el monto y la explicación; no escribe.
CREATE FUNCTION app.penalidad_evaluar_578(p_regla public.penalidad_reglas, p_entrega_id uuid, p_corte date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  e record;
  v_precio numeric; v_moneda text; v_valor_contrato numeric;
  v_limite date; v_cumplimiento date; v_aceptado_limite numeric; v_aceptado_total numeric;
  v_dias integer; v_excluidos integer; v_plazo integer; v_base numeric; v_diaria numeric;
  v_calculado numeric; v_tope numeric; v_previo numeric; v_final numeric; v_txt text;
BEGIN
  SELECT pe.*, o.fecha_emision, ol.precio_unitario AS precio_oc, c.moneda, c.numero AS contrato_numero, cl.unidad_medida
  INTO e
  FROM public.suministro_entregas_programadas pe
  JOIN public.suministro_orden_lineas ol ON ol.id = pe.orden_linea_id AND ol.tenant_id = pe.tenant_id
  JOIN public.suministro_ordenes_cliente o ON o.id = ol.orden_cliente_id AND o.tenant_id = ol.tenant_id
  JOIN public.suministro_contrato_lineas cl ON cl.id = ol.contrato_linea_id AND cl.tenant_id = ol.tenant_id
  JOIN public.suministro_contratos c ON c.id = pe.contrato_id AND c.tenant_id = pe.tenant_id
  WHERE pe.id = p_entrega_id AND pe.tenant_id = p_regla.tenant_id AND pe.contrato_id = p_regla.contrato_id;
  IF NOT FOUND OR e.estado <> 'PROGRAMADA' THEN RETURN NULL; END IF;
  v_precio := e.precio_oc; v_moneda := e.moneda;
  v_limite := app.penalidad_sumar_dias_578(e.fecha_programada, p_regla.tolerancia_dias, p_regla.calendario);
  -- Fecha en que lo aceptado alcanzó lo programado (o el corte si no se completó).
  SELECT min(x.fecha_recepcion) INTO v_cumplimiento FROM (
    SELECT r.fecha_recepcion, sum(rl.cantidad_aceptada) OVER (ORDER BY r.fecha_recepcion, r.numero) AS acumulado
    FROM public.suministro_recepcion_lineas rl
    JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
    WHERE rl.tenant_id = p_regla.tenant_id AND rl.entrega_id = p_entrega_id AND r.fecha_recepcion <= p_corte
  ) x WHERE x.acumulado >= e.cantidad;
  v_cumplimiento := coalesce(v_cumplimiento, p_corte);
  SELECT coalesce(sum(rl.cantidad_aceptada) FILTER (WHERE r.fecha_recepcion <= v_limite), 0),
         coalesce(sum(rl.cantidad_aceptada) FILTER (WHERE r.fecha_recepcion <= p_corte), 0)
  INTO v_aceptado_limite, v_aceptado_total
  FROM public.suministro_recepcion_lineas rl
  JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
  WHERE rl.tenant_id = p_regla.tenant_id AND rl.entrega_id = p_entrega_id;
  SELECT coalesce(sum(x.dias_excluidos), 0) INTO v_excluidos FROM public.penalidad_excepciones x
  WHERE x.tenant_id = p_regla.tenant_id AND x.entrega_id = p_entrega_id AND x.estado = 'VIGENTE'
    AND (x.grupo_id IS NULL OR x.grupo_id = p_regla.grupo_id);
  v_dias := greatest(app.penalidad_dias_578(v_limite, v_cumplimiento, p_regla.calendario) - v_excluidos, 0);
  v_base := round(CASE WHEN p_regla.base_calculo = 'VALOR_ENTREGA' THEN e.cantidad
    ELSE greatest(e.cantidad - v_aceptado_limite, 0) END * v_precio, 2);
  v_plazo := CASE WHEN p_regla.plazo_modo = 'FIJO' THEN p_regla.plazo_dias
    WHEN p_regla.plazo_modo = 'OC_A_ENTREGA' THEN greatest(app.penalidad_dias_578(e.fecha_emision, e.fecha_original, p_regla.calendario), 1) END;
  v_diaria := CASE p_regla.metodo
    WHEN 'MORA_OSCE' THEN 0.10 * v_base / (p_regla.factor_f * v_plazo)
    WHEN 'PORCENTAJE_DIARIO' THEN v_base * p_regla.tasa / 100
    WHEN 'IMPORTE_DIARIO' THEN p_regla.importe
    ELSE NULL END;
  v_calculado := round(CASE WHEN p_regla.metodo = 'IMPORTE_UNICO' THEN CASE WHEN v_dias > 0 THEN p_regla.importe ELSE 0 END
    ELSE v_diaria * v_dias END, 2);
  IF p_regla.tope_porcentaje IS NOT NULL THEN
    -- Monto vigente del contrato: sus líneas, con las adendas ya aplicadas.
    SELECT round(sum(cl.cantidad * cl.precio_unitario), 2) INTO v_valor_contrato
    FROM public.suministro_contrato_lineas cl
    WHERE cl.tenant_id = p_regla.tenant_id AND cl.contrato_id = p_regla.contrato_id;
    -- El tope se reparte entre penalidades ya aprobadas del mismo grupo de reglas.
    SELECT coalesce(sum(pc.monto_aprobado), 0) INTO v_previo FROM public.penalidad_calculos pc
    JOIN public.penalidad_reglas pr ON pr.id = pc.regla_id
    WHERE pc.tenant_id = p_regla.tenant_id AND pr.grupo_id = p_regla.grupo_id AND pc.estado = 'APROBADO'
      AND (p_regla.tope_base = 'CONTRATO' OR pc.entrega_id = p_entrega_id);
    v_tope := greatest(round(p_regla.tope_porcentaje / 100 *
      CASE WHEN p_regla.tope_base = 'CONTRATO' THEN coalesce(v_valor_contrato, 0) ELSE round(e.cantidad * v_precio, 2) END, 2) - v_previo, 0);
  END IF;
  v_final := CASE WHEN v_tope IS NULL THEN v_calculado ELSE least(v_calculado, v_tope) END;
  v_txt := format('Entrega programada %s de %s %s a %s %s (base %s %s). ',
      to_char(e.fecha_programada, 'DD/MM/YYYY'), e.cantidad, e.unidad_medida, v_moneda, v_precio, v_moneda, v_base)
    || format('Límite %s con %s días de tolerancia (%s). ', to_char(v_limite, 'DD/MM/YYYY'), p_regla.tolerancia_dias,
      lower(p_regla.calendario))
    || CASE WHEN v_aceptado_total >= e.cantidad
         THEN format('Aceptación completa el %s. ', to_char(v_cumplimiento, 'DD/MM/YYYY'))
         ELSE format('Aceptado %s de %s al corte %s. ', v_aceptado_total, e.cantidad, to_char(p_corte, 'DD/MM/YYYY')) END
    || format('Atraso %s días (excluidos %s). ', v_dias, v_excluidos)
    || CASE p_regla.metodo
         WHEN 'MORA_OSCE' THEN format('Penalidad diaria = 0.10 × %s / (%s × %s días) = %s; × %s días = %s.',
           v_base, p_regla.factor_f, v_plazo, round(v_diaria, 4), v_dias, v_calculado)
         WHEN 'PORCENTAJE_DIARIO' THEN format('Penalidad diaria = %s%% × %s = %s; × %s días = %s.',
           p_regla.tasa, v_base, round(v_diaria, 4), v_dias, v_calculado)
         WHEN 'IMPORTE_DIARIO' THEN format('Penalidad diaria %s × %s días = %s.', p_regla.importe, v_dias, v_calculado)
         ELSE format('Importe único %s por existir atraso.', CASE WHEN v_dias > 0 THEN p_regla.importe ELSE 0 END) END
    || CASE WHEN v_tope IS NULL THEN '' ELSE format(' Tope disponible %s (%s%% de %s, menos aprobadas %s); estimado %s.',
         v_tope, p_regla.tope_porcentaje, lower(p_regla.tope_base), v_previo, v_final) END;
  RETURN jsonb_build_object(
    'moneda', v_moneda, 'dias_atraso', v_dias, 'monto_calculado', v_calculado, 'monto_tope', v_tope, 'monto_estimado', v_final,
    'explicacion', v_txt,
    'entradas', jsonb_build_object('regla_version', p_regla.version, 'metodo', p_regla.metodo, 'base_calculo', p_regla.base_calculo,
      'fecha_programada', e.fecha_programada, 'fecha_original', e.fecha_original, 'fecha_emision_oc', e.fecha_emision,
      'fecha_limite', v_limite, 'fecha_cumplimiento', v_cumplimiento, 'fecha_corte', p_corte, 'cantidad', e.cantidad,
      'aceptado_al_limite', v_aceptado_limite, 'aceptado_al_corte', v_aceptado_total, 'precio_unitario', v_precio, 'base', v_base,
      'plazo_dias', v_plazo, 'factor_f', p_regla.factor_f, 'tasa', p_regla.tasa, 'importe', p_regla.importe,
      'tolerancia_dias', p_regla.tolerancia_dias, 'calendario', p_regla.calendario, 'dias_excluidos', v_excluidos,
      'penalidad_diaria', round(v_diaria, 6), 'valor_contrato', v_valor_contrato, 'aprobadas_previas', v_previo));
END $fn$;

CREATE FUNCTION public.operar_penalidades_578(
  p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text; v_op public.suministro_operaciones; v_c public.suministro_contratos;
  v_regla public.penalidad_reglas; v_prev public.penalidad_reglas; v_calc public.penalidad_calculos;
  v_res jsonb; v_result jsonb; v_id uuid; v_corte date; v_entrega record; v_creados integer := 0;
  v_nuevo text; v_accion_rev text;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id,
    CASE WHEN p_accion = 'REVISAR_CALCULO' THEN 'ventas.penalidades.aprobar' ELSE 'ventas.penalidades.gestionar' END);
  IF length(v_key) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_accion IS NULL OR p_accion NOT IN ('GUARDAR_REGLA', 'ANULAR_REGLA', 'REGISTRAR_EXCEPCION', 'CALCULAR', 'REVISAR_CALCULO') THEN
    RAISE EXCEPTION 'PENALTY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', p_accion, 'contrato', p_contrato_id,
    'payload', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  SELECT * INTO v_c FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF p_accion = 'GUARDAR_REGLA' THEN
    IF nullif(p_payload->>'grupo_id', '') IS NOT NULL THEN
      SELECT * INTO v_prev FROM public.penalidad_reglas WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id
        AND grupo_id = (p_payload->>'grupo_id')::uuid AND estado = 'VIGENTE' FOR UPDATE;
      IF NOT FOUND OR v_prev.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
        RAISE EXCEPTION 'PENALTY_VERSION_CONFLICT' USING ERRCODE = '23505';
      END IF;
      UPDATE public.penalidad_reglas SET estado = 'REEMPLAZADA' WHERE id = v_prev.id;
    END IF;
    BEGIN
      INSERT INTO public.penalidad_reglas (tenant_id, contrato_id, grupo_id, version, nombre, causal, metodo, base_calculo, tasa,
        importe, factor_f, plazo_modo, plazo_dias, tolerancia_dias, calendario, tope_porcentaje, tope_base, motivo, created_by)
      VALUES (p_tenant_id, v_c.id, coalesce(v_prev.grupo_id, gen_random_uuid()), coalesce(v_prev.version, 0) + 1,
        btrim(p_payload->>'nombre'), coalesce(p_payload->>'causal', 'ENTREGA_TARDIA'), p_payload->>'metodo', p_payload->>'base_calculo',
        nullif(p_payload->>'tasa', '')::numeric, nullif(p_payload->>'importe', '')::numeric, nullif(p_payload->>'factor_f', '')::numeric,
        nullif(p_payload->>'plazo_modo', ''), nullif(p_payload->>'plazo_dias', '')::integer,
        coalesce(nullif(p_payload->>'tolerancia_dias', '')::integer, 0), coalesce(p_payload->>'calendario', 'CALENDARIO'),
        nullif(p_payload->>'tope_porcentaje', '')::numeric, nullif(p_payload->>'tope_base', ''), btrim(coalesce(p_payload->>'motivo', '')),
        p_actor_id)
      RETURNING * INTO v_regla;
    EXCEPTION WHEN check_violation OR not_null_violation THEN
      RAISE EXCEPTION 'PENALTY_RULE_INVALID' USING ERRCODE = '23514';
    END;
    v_id := v_regla.id;
    v_res := to_jsonb(v_regla);
  ELSIF p_accion = 'ANULAR_REGLA' THEN
    SELECT * INTO v_regla FROM public.penalidad_reglas WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id
      AND grupo_id = app.to_uuid_or_null(p_payload->>'grupo_id') AND estado = 'VIGENTE' FOR UPDATE;
    IF NOT FOUND OR v_regla.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'PENALTY_VERSION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF length(btrim(coalesce(p_payload->>'motivo', ''))) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
    UPDATE public.penalidad_reglas SET estado = 'ANULADA' WHERE id = v_regla.id;
    v_id := v_regla.id;
    v_res := jsonb_build_object('grupo_id', v_regla.grupo_id, 'version', v_regla.version, 'estado', 'ANULADA');
  ELSIF p_accion = 'REGISTRAR_EXCEPCION' THEN
    IF NOT EXISTS (SELECT 1 FROM public.suministro_entregas_programadas WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id
        AND id = app.to_uuid_or_null(p_payload->>'entrega_id')) THEN
      RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    BEGIN
      INSERT INTO public.penalidad_excepciones (tenant_id, contrato_id, entrega_id, grupo_id, dias_excluidos, motivo, referencia, created_by)
      VALUES (p_tenant_id, v_c.id, (p_payload->>'entrega_id')::uuid, app.to_uuid_or_null(p_payload->>'grupo_id'),
        (p_payload->>'dias_excluidos')::integer, btrim(coalesce(p_payload->>'motivo', '')), nullif(btrim(p_payload->>'referencia'), ''), p_actor_id)
      RETURNING id INTO v_id;
    EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
      RAISE EXCEPTION 'PENALTY_EXCEPTION_INVALID' USING ERRCODE = '23514';
    END;
    v_res := jsonb_build_object('entrega_id', p_payload->>'entrega_id', 'dias_excluidos', p_payload->>'dias_excluidos');
  ELSIF p_accion = 'CALCULAR' THEN
    v_corte := coalesce(nullif(p_payload->>'fecha_corte', '')::date, app.hoy_tenant(p_tenant_id));
    IF v_corte > app.hoy_tenant(p_tenant_id) THEN RAISE EXCEPTION 'PENALTY_CUTOFF_IN_FUTURE' USING ERRCODE = '23514'; END IF;
    -- Una instantánea por versión de regla, entrega y corte; sólo con atraso.
    FOR v_regla IN SELECT * FROM public.penalidad_reglas WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id AND estado = 'VIGENTE'
      ORDER BY created_at, id LOOP
      FOR v_entrega IN SELECT id FROM public.suministro_entregas_programadas WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id
        AND estado = 'PROGRAMADA' ORDER BY fecha_programada, id LOOP
        v_res := app.penalidad_evaluar_578(v_regla, v_entrega.id, v_corte);
        CONTINUE WHEN v_res IS NULL OR (v_res->>'dias_atraso')::integer = 0;
        INSERT INTO public.penalidad_calculos (tenant_id, contrato_id, regla_id, entrega_id, fecha_corte, moneda, entradas, dias_atraso,
          monto_calculado, monto_tope, monto_estimado, explicacion, created_by)
        VALUES (p_tenant_id, v_c.id, v_regla.id, v_entrega.id, v_corte, v_res->>'moneda', v_res->'entradas',
          (v_res->>'dias_atraso')::integer, (v_res->>'monto_calculado')::numeric, nullif(v_res->>'monto_tope', '')::numeric,
          (v_res->>'monto_estimado')::numeric, v_res->>'explicacion', p_actor_id)
        ON CONFLICT (regla_id, entrega_id, fecha_corte) DO NOTHING;
        IF FOUND THEN v_creados := v_creados + 1; END IF;
      END LOOP;
    END LOOP;
    v_id := v_c.id;
    v_res := jsonb_build_object('fecha_corte', v_corte, 'calculos', v_creados);
  ELSE
    SELECT * INTO v_calc FROM public.penalidad_calculos WHERE tenant_id = p_tenant_id AND contrato_id = v_c.id
      AND id = app.to_uuid_or_null(p_payload->>'calculo_id') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_calc.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'PENALTY_VERSION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    v_accion_rev := upper(coalesce(p_payload->>'accion', ''));
    v_nuevo := CASE v_accion_rev WHEN 'REVISAR' THEN 'EN_REVISION' WHEN 'APROBAR' THEN 'APROBADO' WHEN 'OBSERVAR' THEN 'OBSERVADO'
      WHEN 'CONTROVERSIA' THEN 'EN_CONTROVERSIA' WHEN 'DESCARTAR' THEN 'DESCARTADO' END;
    IF v_nuevo IS NULL OR v_calc.estado IN ('APROBADO', 'DESCARTADO')
       OR length(btrim(coalesce(p_payload->>'comentario', ''))) NOT BETWEEN 5 AND 2000 THEN
      RAISE EXCEPTION 'PENALTY_REVIEW_INVALID' USING ERRCODE = '23514';
    END IF;
    -- Quien calcula no aprueba su propio cálculo.
    IF v_accion_rev = 'APROBAR' AND v_calc.created_by = p_actor_id THEN
      RAISE EXCEPTION 'PENALTY_SEGREGATION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF v_accion_rev = 'APROBAR' AND (nullif(p_payload->>'monto_aprobado', '')::numeric IS NULL
       OR (p_payload->>'monto_aprobado')::numeric < 0 OR (p_payload->>'monto_aprobado')::numeric > v_calc.monto_estimado) THEN
      RAISE EXCEPTION 'PENALTY_APPROVED_AMOUNT_INVALID' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.penalidad_revisiones (tenant_id, calculo_id, accion, estado_anterior, estado_nuevo, monto_aprobado, comentario, actor_id)
    VALUES (p_tenant_id, v_calc.id, v_accion_rev, v_calc.estado, v_nuevo,
      CASE WHEN v_accion_rev = 'APROBAR' THEN round((p_payload->>'monto_aprobado')::numeric, 2) END,
      btrim(p_payload->>'comentario'), p_actor_id);
    UPDATE public.penalidad_calculos SET estado = v_nuevo, version = version + 1,
      monto_aprobado = CASE WHEN v_accion_rev = 'APROBAR' THEN round((p_payload->>'monto_aprobado')::numeric, 2) END
    WHERE id = v_calc.id;
    v_id := v_calc.id;
    v_res := jsonb_build_object('calculo_id', v_calc.id, 'estado_anterior', v_calc.estado, 'estado', v_nuevo);
  END IF;

  INSERT INTO public.suministro_historial (tenant_id, contrato_id, recurso_id, accion, actual, motivo, actor_id)
  VALUES (p_tenant_id, v_c.id, v_id, 'PENALIDAD_' || p_accion, v_res,
    nullif(btrim(coalesce(p_payload->>'motivo', p_payload->>'comentario', '')), ''), p_actor_id);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'penalidades', 'INSERT', v_id::text, v_res,
    jsonb_build_object('source', 'operar_penalidades_578', 'accion', p_accion, 'contrato_id', v_c.id, 'idempotency_key', v_key));
  v_result := jsonb_build_object('id', v_id, 'contrato_id', v_c.id, 'accion', p_accion, 'idempotent', false) || v_res;
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

CREATE FUNCTION public.consultar_penalidades_578(p_tenant_id uuid, p_actor_id uuid, p_contrato_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'ventas.penalidades.ver');
  IF NOT EXISTS (SELECT 1 FROM public.suministro_contratos WHERE tenant_id = p_tenant_id AND id = p_contrato_id) THEN
    RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'reglas', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.grupo_id, r.version DESC) FROM public.penalidad_reglas r
      WHERE r.tenant_id = p_tenant_id AND r.contrato_id = p_contrato_id), '[]'::jsonb),
    'excepciones', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at) FROM public.penalidad_excepciones x
      WHERE x.tenant_id = p_tenant_id AND x.contrato_id = p_contrato_id), '[]'::jsonb),
    'calculos', coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'regla_nombre', r.nombre, 'regla_version', r.version, 'fecha_programada', e.fecha_programada,
        'actor_nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u WHERE u.id = c.created_by),
        'revisiones', coalesce((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object('actor_nombre',
            (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u WHERE u.id = v.actor_id)) ORDER BY v.created_at)
          FROM public.penalidad_revisiones v WHERE v.calculo_id = c.id), '[]'::jsonb)) ORDER BY c.created_at DESC, c.id)
      FROM public.penalidad_calculos c
      JOIN public.penalidad_reglas r ON r.id = c.regla_id
      JOIN public.suministro_entregas_programadas e ON e.id = c.entrega_id
      WHERE c.tenant_id = p_tenant_id AND c.contrato_id = p_contrato_id), '[]'::jsonb),
    'resumen', coalesce((SELECT jsonb_agg(jsonb_build_object('moneda', s.moneda, 'estimado', s.estimado, 'aprobado', s.aprobado))
      FROM (SELECT c.moneda,
          round(sum(c.monto_estimado) FILTER (WHERE c.estado NOT IN ('DESCARTADO', 'APROBADO')), 2) AS estimado,
          round(sum(c.monto_aprobado) FILTER (WHERE c.estado = 'APROBADO'), 2) AS aprobado
        FROM public.penalidad_calculos c
        -- Sólo el último corte de cada regla y entrega cuenta como exposición vigente.
        WHERE c.tenant_id = p_tenant_id AND c.contrato_id = p_contrato_id AND NOT EXISTS (
          SELECT 1 FROM public.penalidad_calculos n WHERE n.regla_id = c.regla_id AND n.entrega_id = c.entrega_id
            AND n.fecha_corte > c.fecha_corte AND n.estado <> 'DESCARTADO')
        GROUP BY c.moneda) s), '[]'::jsonb)
  );
END $fn$;

CREATE FUNCTION app.seed_penalidades_permissions_578(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'ventas', 'penalidades', s.accion, 'ventas.penalidades.' || s.accion, s.descripcion, true
  FROM (VALUES ('ver', 'Consultar reglas, cálculos y revisiones de penalidades contractuales'),
    ('gestionar', 'Configurar reglas y excepciones y calcular penalidades estimadas'),
    ('aprobar', 'Revisar, aprobar, observar o llevar a controversia penalidades calculadas')) s(accion, descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = 'ventas.penalidades.' || s.accion);
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo AND p.codigo LIKE 'ventas.penalidades.%'
    AND (upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO')
      OR (upper(r.nombre) = 'GERENCIA' AND p.codigo IN ('ventas.penalidades.ver', 'ventas.penalidades.aprobar'))
      OR (upper(r.nombre) IN ('CONTADOR', 'FINANZAS', 'AUDITOR') AND p.codigo = 'ventas.penalidades.ver'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_penalidades_role_578() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_penalidades_permissions_578(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_penalidades_role_578 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_penalidades_role_578();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_penalidades_permissions_578(t); END LOOP;
END $seed$;

-- El patrón genérico '^ventas\.' no debe conceder penalidades a VENDEDOR.
CREATE OR REPLACE FUNCTION app.seed_operational_rbac_for_tenant(
  p_tenant_id uuid, p_source_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(permisos_seeded integer, roles_seeded integer, role_permissions_seeded integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_base record;
  v_retirados integer;
BEGIN
  SELECT * INTO v_base FROM app.seed_operational_rbac_for_tenant_base_575(p_tenant_id, p_source_tenant_id);
  DELETE FROM public.rol_permisos rp
  USING public.roles r, public.permisos p
  WHERE rp.role_id = r.id AND rp.permiso_id = p.id
    AND r.tenant_id = p_tenant_id AND p.tenant_id = p_tenant_id
    AND upper(r.nombre) = 'VENDEDOR'
    AND (p.codigo IN ('ventas.contratos.gestionar', 'ventas.contratos.conformar') OR p.codigo LIKE 'ventas.penalidades.%')
    AND rp.created_at = now();
  GET DIAGNOSTICS v_retirados = ROW_COUNT;
  permisos_seeded := coalesce(v_base.permisos_seeded, 0);
  roles_seeded := coalesce(v_base.roles_seeded, 0);
  role_permissions_seeded := coalesce(v_base.role_permissions_seeded, 0) - v_retirados;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION app.penalidad_dias_578(date, date, text), app.penalidad_sumar_dias_578(date, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.penalidad_evaluar_578(public.penalidad_reglas, uuid, date), app.penalidad_calculo_inmutable_578(),
  app.penalidad_regla_inmutable_578(), app.seed_penalidades_permissions_578(uuid), app.seed_penalidades_role_578(),
  app.seed_operational_rbac_for_tenant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operar_penalidades_578(uuid, uuid, uuid, text, jsonb, text),
  public.consultar_penalidades_578(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operar_penalidades_578(uuid, uuid, uuid, text, jsonb, text),
  public.consultar_penalidades_578(uuid, uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
