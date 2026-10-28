-- ============================================================================
-- 582__fox_full_migration.sql
-- Migración integral desde FOX: archivo íntegro y migración operativa completa.
--
-- 1. Archivo íntegro: cada tabla del extracto se guarda tal cual, fila por
--    fila, con su huella, en lotes inmutables por empresa. Nada se pierde
--    aunque no tenga equivalente operativo; es consulta, sin efectos.
-- 2. Maestros y saldos abiertos que faltaban: productos, almacenes, cuentas
--    contables, cuentas bancarias con saldo de apertura, listas de precios,
--    OC de compra y pedidos de venta abiertos. Entran por los writers
--    vigentes, idempotentes por registro de origen (correspondencias 580).
-- 3. Ensayo y conciliación de toda la migración, incluidos clientes,
--    proveedores, CxC, CxP y balance de apertura (473).
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $runtype$ DECLARE v_name text; BEGIN
  SELECT conname INTO v_name FROM pg_constraint
  WHERE conrelid = 'public.migration_runs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%run_type%';
  EXECUTE format('ALTER TABLE public.migration_runs DROP CONSTRAINT %I', v_name);
END $runtype$;
ALTER TABLE public.migration_runs ADD CONSTRAINT migration_runs_run_type_check CHECK (run_type IN (
  'clientes', 'proveedores', 'productos', 'plan_cuentas', 'cuentas_bancarias', 'cxc_abiertas', 'cxp_abiertas',
  'balance_apertura', 'stock_inicial', 'comprobantes_historico', 'contratos_suministro', 'oc_suministro',
  'cronograma_suministro', 'almacenes', 'listas_precios', 'oc_compra', 'pedidos_venta'));

ALTER TABLE public.migracion_correspondencias DROP CONSTRAINT migracion_correspondencias_entidad_check;
ALTER TABLE public.migracion_correspondencias ADD CONSTRAINT migracion_correspondencias_entidad_check CHECK (entidad IN (
  'CONTRATO', 'CONTRATO_LINEA', 'OC', 'OC_LINEA', 'ENTREGA', 'PRODUCTO', 'ALMACEN', 'CUENTA_CONTABLE',
  'CUENTA_BANCARIA', 'LISTA_PRECIOS', 'OC_COMPRA', 'PEDIDO_VENTA'));

-- ---------------------------------------------------------------------------
-- Archivo íntegro
-- ---------------------------------------------------------------------------
CREATE TABLE public.migracion_archivo_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  origen text NOT NULL DEFAULT 'FOX' CHECK (origen IN ('FOX')),
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 3 AND 200),
  fecha_corte date,
  estado text NOT NULL DEFAULT 'CARGANDO' CHECK (estado IN ('CARGANDO', 'COMPLETO', 'DESCARTADO')),
  tablas jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo_descarte text,
  created_by uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz,
  CHECK ((estado = 'DESCARTADO') = (motivo_descarte IS NOT NULL))
);
CREATE INDEX migracion_archivo_lotes_tenant_582 ON public.migracion_archivo_lotes (tenant_id, created_at DESC);

CREATE TABLE public.migracion_archivo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  lote_id uuid NOT NULL REFERENCES public.migracion_archivo_lotes(id),
  tabla text NOT NULL CHECK (tabla ~ '^[A-Za-z0-9_.$-]{1,80}$'),
  clave text NOT NULL CHECK (length(clave) BETWEEN 1 AND 250),
  fila jsonb NOT NULL CHECK (jsonb_typeof(fila) = 'object'),
  huella text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  busqueda tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, fila::text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lote_id, tabla, clave)
);
CREATE INDEX migracion_archivo_busqueda_582 ON public.migracion_archivo USING gin (busqueda);
CREATE INDEX migracion_archivo_tabla_582 ON public.migracion_archivo (tenant_id, lote_id, tabla, id);

CREATE FUNCTION app.archivo_inmutable_582() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'migracion_archivo_lotes' AND TG_OP = 'UPDATE' THEN
    -- Sólo cambia el estado: cerrar con sus conteos o descartar con motivo.
    IF (to_jsonb(NEW) - ARRAY['estado', 'tablas', 'cerrado_en', 'motivo_descarte'])
         = (to_jsonb(OLD) - ARRAY['estado', 'tablas', 'cerrado_en', 'motivo_descarte'])
       AND ((OLD.estado = 'CARGANDO' AND NEW.estado IN ('COMPLETO', 'DESCARTADO'))
         OR (OLD.estado = 'COMPLETO' AND NEW.estado = 'DESCARTADO' AND NEW.tablas = OLD.tablas)) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'MIGRATION_ARCHIVE_IMMUTABLE' USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER migracion_archivo_lotes_inmutable_582 BEFORE UPDATE OR DELETE ON public.migracion_archivo_lotes
FOR EACH ROW EXECUTE FUNCTION app.archivo_inmutable_582();
CREATE TRIGGER migracion_archivo_inmutable_582 BEFORE UPDATE OR DELETE ON public.migracion_archivo
FOR EACH ROW EXECUTE FUNCTION app.archivo_inmutable_582();

DO $secure$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['migracion_archivo_lotes', 'migracion_archivo'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY migracion_archivo_private_582 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

CREATE FUNCTION public.operar_archivo_fox_582(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := 'archivo:' || btrim(coalesce(p_idempotency_key, '')); v_op public.suministro_operaciones; v_hash text;
  v_lote public.migracion_archivo_lotes; v_real jsonb; v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.archivo.import');
  IF length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 160 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_accion IS NULL OR p_accion NOT IN ('CREAR_LOTE', 'CERRAR_LOTE', 'DESCARTAR_LOTE') THEN
    RAISE EXCEPTION 'MIGRATION_ARCHIVE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('a', p_accion, 'p', p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  IF p_accion = 'CREAR_LOTE' THEN
    BEGIN
      INSERT INTO public.migracion_archivo_lotes (tenant_id, descripcion, fecha_corte, created_by)
      VALUES (p_tenant_id, btrim(coalesce(p_payload->>'descripcion', '')), nullif(p_payload->>'fecha_corte', '')::date, p_actor_id)
      RETURNING * INTO v_lote;
    EXCEPTION WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'MIGRATION_ARCHIVE_INPUT_INVALID' USING ERRCODE = '22023';
    END;
  ELSE
    SELECT * INTO v_lote FROM public.migracion_archivo_lotes
    WHERE tenant_id = p_tenant_id AND id = app.to_uuid_or_null(p_payload->>'lote_id') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF p_accion = 'CERRAR_LOTE' THEN
      IF v_lote.estado <> 'CARGANDO' THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_STATE' USING ERRCODE = '23514'; END IF;
      -- Se cierra sólo si lo cargado coincide con lo declarado por tabla.
      SELECT coalesce(jsonb_object_agg(tabla, n), '{}'::jsonb) INTO v_real
      FROM (SELECT tabla, count(*) AS n FROM public.migracion_archivo WHERE lote_id = v_lote.id GROUP BY tabla) x;
      IF jsonb_typeof(p_payload->'tablas') IS DISTINCT FROM 'object' OR (SELECT coalesce(jsonb_object_agg(key, (value#>>'{}')::bigint), '{}'::jsonb)
           FROM jsonb_each(p_payload->'tablas')) IS DISTINCT FROM v_real THEN
        RAISE EXCEPTION 'MIGRATION_ARCHIVE_COUNT_MISMATCH: declarado=% cargado=%', p_payload->'tablas', v_real USING ERRCODE = '23514';
      END IF;
      UPDATE public.migracion_archivo_lotes SET estado = 'COMPLETO', tablas = v_real, cerrado_en = now()
      WHERE id = v_lote.id RETURNING * INTO v_lote;
    ELSE
      IF v_lote.estado = 'DESCARTADO' THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_STATE' USING ERRCODE = '23514'; END IF;
      IF length(btrim(coalesce(p_payload->>'motivo', ''))) NOT BETWEEN 5 AND 1000 THEN
        RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE = '22023';
      END IF;
      UPDATE public.migracion_archivo_lotes SET estado = 'DESCARTADO', motivo_descarte = btrim(p_payload->>'motivo')
      WHERE id = v_lote.id RETURNING * INTO v_lote;
    END IF;
  END IF;
  v_result := jsonb_build_object('id', v_lote.id, 'estado', v_lote.estado, 'tablas', v_lote.tablas, 'idempotent', false);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'migracion_archivo_lotes', CASE WHEN p_accion = 'CREAR_LOTE' THEN 'INSERT' ELSE 'UPDATE' END,
    v_lote.id::text, v_result, jsonb_build_object('source', 'operar_archivo_fox_582', 'accion', p_accion));
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

-- Credenciales y medios de pago no se archivan, llegue la tanda por la CLI o
-- directo al API: el archivo lo leen auditoría y gerencia. El patrón no se
-- ancla (USR_CLAVE, PASSWD2); PIN y KEY sólo como palabra, para no tocar
-- columnas como SPINNER o KEYWORD. La misma regla usan la CLI y el perfil.
CREATE FUNCTION app.campo_sensible_582(p_campo text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p_campo ~* '(pass|pwd|clave|contras|secret|token|cvv|tarj|ccnum)' OR p_campo ~* '(^|_)(pin|key|apikey)(_|$)'
$fn$;
CREATE FUNCTION app.redactar_fila_582(p_fila jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(jsonb_object_agg(e.k, CASE WHEN app.campo_sensible_582(e.k) AND e.v NOT IN ('null'::jsonb, '""'::jsonb)
      THEN '"[REDACTADO]"'::jsonb ELSE e.v END), '{}'::jsonb)
  FROM jsonb_each(p_fila) e(k, v)
$fn$;

-- Carga por tandas: idempotente por fila; una fila que cambió en el mismo lote se rechaza.
CREATE FUNCTION public.archivar_filas_fox_582(p_tenant_id uuid, p_actor_id uuid, p_lote_id uuid, p_tabla text, p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE v_lote public.migracion_archivo_lotes; v_n integer; v_nuevas integer; v_cambiadas integer; v_redactados jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.archivo.import');
  SELECT * INTO v_lote FROM public.migracion_archivo_lotes WHERE tenant_id = p_tenant_id AND id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_lote.estado <> 'CARGANDO' THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_STATE' USING ERRCODE = '23514'; END IF;
  IF p_tabla IS NULL OR p_tabla !~ '^[A-Za-z0-9_.$-]{1,80}$' OR jsonb_typeof(p_filas) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_filas) NOT BETWEEN 1 AND 2000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filas) x
       WHERE jsonb_typeof(x->'fila') IS DISTINCT FROM 'object' OR length(coalesce(x->>'clave', '')) NOT BETWEEN 1 AND 250) THEN
    RAISE EXCEPTION 'MIGRATION_ARCHIVE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('pg_temp.archivo_tanda_582') IS NULL THEN
    CREATE TEMP TABLE archivo_tanda_582 (orden bigint, clave text, fila jsonb, huella text) ON COMMIT DROP;
  ELSE
    TRUNCATE pg_temp.archivo_tanda_582;
  END IF;
  INSERT INTO pg_temp.archivo_tanda_582
  SELECT x.n, x.e->>'clave', app.redactar_fila_582(x.e->'fila'),
    encode(extensions.digest(convert_to(app.redactar_fila_582(x.e->'fila')::text, 'UTF8'), 'sha256'), 'hex')
  FROM jsonb_array_elements(p_filas) WITH ORDINALITY x(e, n);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF (SELECT count(DISTINCT clave) FROM pg_temp.archivo_tanda_582) <> v_n THEN
    RAISE EXCEPTION 'MIGRATION_ARCHIVE_DUPLICATE_KEY' USING ERRCODE = '23505';
  END IF;
  SELECT count(*) INTO v_cambiadas FROM pg_temp.archivo_tanda_582 n
  JOIN public.migracion_archivo a ON a.lote_id = p_lote_id AND a.tabla = p_tabla AND a.clave = n.clave AND a.huella <> n.huella;
  IF v_cambiadas > 0 THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_ROW_CHANGED: %', v_cambiadas USING ERRCODE = '23505'; END IF;
  -- En el orden de la tanda: el archivo se consulta en el orden de registro de FOX.
  INSERT INTO public.migracion_archivo (tenant_id, lote_id, tabla, clave, fila, huella)
  SELECT p_tenant_id, p_lote_id, p_tabla, clave, fila, huella FROM pg_temp.archivo_tanda_582 ORDER BY orden
  ON CONFLICT (lote_id, tabla, clave) DO NOTHING;
  GET DIAGNOSTICS v_nuevas = ROW_COUNT;
  SELECT coalesce(jsonb_agg(DISTINCT k ORDER BY k), '[]'::jsonb) INTO v_redactados
  FROM pg_temp.archivo_tanda_582 t, jsonb_object_keys(t.fila) k WHERE app.campo_sensible_582(k);
  RETURN jsonb_build_object('lote_id', p_lote_id, 'tabla', p_tabla, 'recibidas', v_n, 'nuevas', v_nuevas, 'existentes', v_n - v_nuevas,
    'campos_redactados', v_redactados);
END $fn$;

CREATE FUNCTION public.consultar_archivo_fox_582(p_tenant_id uuid, p_actor_id uuid, p_filtros jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  f jsonb := coalesce(p_filtros, '{}'::jsonb); v_lote uuid; v_tabla text; v_texto text; v_pagina integer; v_limite integer;
  v_q tsquery; v_total bigint; v_filas jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.archivo.read');
  BEGIN
    v_lote := nullif(f->>'lote_id', '')::uuid;
    v_pagina := greatest(coalesce(nullif(f->>'pagina', '')::integer, 1), 1);
    v_limite := least(greatest(coalesce(nullif(f->>'limite', '')::integer, 50), 1), 200);
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_FILTER_INVALID' USING ERRCODE = '22023';
  END;
  v_tabla := nullif(btrim(f->>'tabla'), '');
  v_texto := nullif(btrim(f->>'texto'), '');
  IF length(v_texto) > 200 THEN RAISE EXCEPTION 'MIGRATION_ARCHIVE_FILTER_INVALID' USING ERRCODE = '22023'; END IF;
  IF v_texto IS NOT NULL THEN v_q := websearch_to_tsquery('simple', v_texto); END IF;
  -- Sin lote se consulta el último completo.
  IF v_lote IS NULL THEN
    SELECT id INTO v_lote FROM public.migracion_archivo_lotes WHERE tenant_id = p_tenant_id AND estado = 'COMPLETO'
    ORDER BY cerrado_en DESC, id LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM public.migracion_archivo_lotes WHERE tenant_id = p_tenant_id AND id = v_lote) THEN
    RAISE EXCEPTION 'MIGRATION_ARCHIVE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT count(*) INTO v_total FROM public.migracion_archivo a
  WHERE a.tenant_id = p_tenant_id AND a.lote_id = v_lote AND (v_tabla IS NULL OR a.tabla = v_tabla)
    AND (v_q IS NULL OR a.busqueda @@ v_q);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'tabla', x.tabla, 'clave', x.clave, 'fila', x.fila, 'huella', x.huella)
      ORDER BY x.tabla, x.id), '[]'::jsonb) INTO v_filas
  FROM (SELECT a.* FROM public.migracion_archivo a
    WHERE a.tenant_id = p_tenant_id AND a.lote_id = v_lote AND (v_tabla IS NULL OR a.tabla = v_tabla)
      AND (v_q IS NULL OR a.busqueda @@ v_q)
    ORDER BY a.tabla, a.id OFFSET (v_pagina - 1) * v_limite LIMIT v_limite) x;
  RETURN jsonb_build_object(
    'lotes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'descripcion', l.descripcion, 'fecha_corte', l.fecha_corte,
        'estado', l.estado, 'tablas', l.tablas, 'created_at', l.created_at, 'cerrado_en', l.cerrado_en,
        'motivo_descarte', l.motivo_descarte) ORDER BY l.created_at DESC)
      FROM public.migracion_archivo_lotes l WHERE l.tenant_id = p_tenant_id), '[]'::jsonb),
    'lote_id', v_lote,
    'tablas', coalesce((SELECT jsonb_agg(jsonb_build_object('tabla', t.tabla, 'filas', t.n) ORDER BY t.tabla)
      FROM (SELECT tabla, count(*) AS n FROM public.migracion_archivo WHERE tenant_id = p_tenant_id AND lote_id = v_lote GROUP BY tabla) t), '[]'::jsonb),
    'total', v_total, 'pagina', v_pagina, 'limite', v_limite, 'filas', v_filas);
END $fn$;

-- ---------------------------------------------------------------------------
-- Maestros y saldos abiertos que faltaban
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.fox_unico_582(p_tenant_id uuid, p_tabla text, p_codigo text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE v_id uuid; v_n integer; v_codigo text := btrim(coalesce(p_codigo, ''));
BEGIN
  IF v_codigo = '' THEN RETURN NULL; END IF;
  IF p_tabla = 'productos' THEN
    SELECT min(id::text)::uuid, count(*) INTO v_id, v_n FROM public.productos
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND (upper(codigo) = upper(v_codigo) OR external_id = v_codigo);
  ELSIF p_tabla = 'clientes' THEN
    SELECT min(id::text)::uuid, count(*) INTO v_id, v_n FROM public.clientes
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND v_codigo IN (external_id, ruc, documento_identidad);
  ELSIF p_tabla = 'proveedores' THEN
    SELECT min(id::text)::uuid, count(*) INTO v_id, v_n FROM public.proveedores
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND v_codigo IN (external_id, ruc, documento_identidad);
  ELSIF p_tabla = 'almacenes' THEN
    SELECT min(id::text)::uuid, count(*) INTO v_id, v_n FROM public.almacenes
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND upper(codigo) = upper(v_codigo);
  ELSIF p_tabla = 'plan_cuentas' THEN
    SELECT min(id::text)::uuid, count(*) INTO v_id, v_n FROM public.plan_cuentas
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND codigo = v_codigo;
  END IF;
  -- Un código que coincide con dos registros no se adivina.
  IF v_n > 1 THEN RAISE EXCEPTION 'MIGRATION_FOX_AMBIGUOUS_CODE: % %', p_tabla, v_codigo USING ERRCODE = '23505'; END IF;
  RETURN CASE WHEN v_n = 1 THEN v_id END;
END $fn$;

-- Referencia opcional: vacía es NULL; informada e inexistente es error.
CREATE FUNCTION app.fox_ref_582(p_tenant_id uuid, p_tabla text, p_codigo text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_id uuid := app.fox_unico_582(p_tenant_id, p_tabla, p_codigo);
BEGIN
  IF v_id IS NULL AND btrim(coalesce(p_codigo, '')) <> '' THEN
    RAISE EXCEPTION 'MIGRATION_FOX_REFERENCE_NOT_FOUND: % %', p_tabla, btrim(p_codigo) USING ERRCODE = '23503';
  END IF;
  RETURN v_id;
END $fn$;

CREATE FUNCTION public.importar_maestro_fox_582(
  p_tenant_id uuid, p_actor_id uuid, p_run_id uuid, p_entidad text, p_id_origen text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_id text := btrim(coalesce(p_id_origen, '')); v_huella text; v_corr public.migracion_correspondencias;
  v_erp uuid; v_accion text := 'CREATED'; v_res jsonb; v_linea jsonb; v_lineas jsonb := '[]'::jsonb; v_par uuid; v_saldo numeric;
  v_padre public.plan_cuentas; v_almacen uuid; v_producto uuid; v_cuenta public.cuentas_bancarias; v_monto numeric; v_key text;
  v_tc numeric;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, p_run_id);
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.fox.import');
  IF p_entidad IS NULL OR p_entidad NOT IN ('PRODUCTO', 'ALMACEN', 'CUENTA_CONTABLE', 'CUENTA_BANCARIA', 'LISTA_PRECIOS', 'OC_COMPRA', 'PEDIDO_VENTA')
     OR length(v_id) NOT BETWEEN 1 AND 120 OR v_id ~ '#' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_huella := app.migration_fingerprint_473(p_payload);
  v_key := 'fox:' || lower(p_entidad) || ':' || v_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':fox:' || p_entidad || ':' || v_id, 580));
  SELECT * INTO v_corr FROM public.migracion_correspondencias
  WHERE tenant_id = p_tenant_id AND origen = 'FOX' AND entidad = p_entidad AND id_origen = v_id;
  IF FOUND THEN
    IF v_corr.huella <> v_huella THEN
      RAISE EXCEPTION 'MIGRATION_FOX_SOURCE_CHANGED: % %', p_entidad, v_id USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_corr.erp_id, 'action', 'IDEMPOTENT', 'idempotent', true);
  END IF;

  IF p_entidad = 'PRODUCTO' THEN
    v_erp := app.fox_unico_582(p_tenant_id, 'productos', p_payload->>'codigo');
    IF v_erp IS NOT NULL THEN
      v_accion := 'ADOPTED';
    ELSE
      SELECT id INTO v_almacen FROM public.almacenes WHERE tenant_id = p_tenant_id AND coalesce(activo, true)
      ORDER BY es_principal DESC NULLS LAST, created_at, id LIMIT 1;
      v_res := public.crear_producto_inventario_tx(p_tenant_id, jsonb_strip_nulls(jsonb_build_object(
        'codigo', upper(btrim(p_payload->>'codigo')), 'nombre', btrim(p_payload->>'nombre'),
        'categoria', coalesce(nullif(btrim(p_payload->>'categoria'), ''), 'GENERAL'),
        'unidad_medida', coalesce(nullif(upper(btrim(p_payload->>'unidad_medida')), ''), 'NIU'),
        'precio_venta', coalesce(nullif(p_payload->>'precio_venta', '')::numeric, 0),
        'precio_compra', coalesce(nullif(p_payload->>'precio_compra', '')::numeric, 0),
        'afectacion_igv', coalesce(nullif(p_payload->>'afectacion_igv', ''), '10'),
        'external_id', v_id)), v_almacen, 0, 0, '[]'::jsonb);
      v_erp := (v_res->>'id')::uuid;
      UPDATE public.productos SET external_id = coalesce(external_id, v_id),
        unidad_medida = coalesce(nullif(upper(btrim(p_payload->>'unidad_medida')), ''), unidad_medida)
      WHERE tenant_id = p_tenant_id AND id = v_erp;
    END IF;
    IF coalesce((p_payload->>'controla_lote')::boolean, false) THEN
      PERFORM public.operar_lotes_inventario_574(p_tenant_id, p_actor_id, 'CONFIGURAR_POLITICA', jsonb_build_object(
        'producto_id', v_erp, 'controla_lote', true,
        'requiere_vencimiento', coalesce((p_payload->>'requiere_vencimiento')::boolean, true),
        'dias_minimos_vida_util', coalesce(nullif(p_payload->>'dias_minimos_vida_util', '')::integer, 0),
        'version', coalesce((SELECT version FROM public.inventario_lote_politicas WHERE tenant_id = p_tenant_id AND producto_id = v_erp), 0)),
        v_key || ':lote');
    END IF;
  ELSIF p_entidad = 'ALMACEN' THEN
    v_erp := app.fox_unico_582(p_tenant_id, 'almacenes', p_payload->>'codigo');
    IF v_erp IS NOT NULL THEN
      v_accion := 'ADOPTED';
    ELSE
      v_res := public.crear_almacen_maestro_tx(p_tenant_id, p_actor_id, v_key, jsonb_strip_nulls(jsonb_build_object(
        'codigo', p_payload->>'codigo', 'nombre', p_payload->>'nombre', 'direccion', p_payload->>'direccion',
        'telefono', p_payload->>'telefono', 'descripcion', 'Migrado de FOX ' || v_id,
        'es_principal', coalesce((p_payload->>'es_principal')::boolean, false))));
      v_erp := coalesce((v_res->>'id')::uuid, (v_res#>>'{almacen,id}')::uuid);
    END IF;
  ELSIF p_entidad = 'CUENTA_CONTABLE' THEN
    v_erp := app.fox_unico_582(p_tenant_id, 'plan_cuentas', p_payload->>'codigo');
    IF v_erp IS NOT NULL THEN
      -- El plan base ya trae la cuenta: se enlaza sin modificarla.
      v_accion := 'ADOPTED';
    ELSE
      IF coalesce(p_payload->>'codigo', '') !~ '^[0-9]{2,20}$' OR length(btrim(coalesce(p_payload->>'nombre', ''))) NOT BETWEEN 2 AND 200 THEN
        RAISE EXCEPTION 'MIGRATION_FOX_ACCOUNT_INVALID: %', p_payload->>'codigo' USING ERRCODE = '22023';
      END IF;
      -- La subcuenta cuelga de la cuenta existente con el prefijo más largo.
      SELECT * INTO v_padre FROM public.plan_cuentas
      WHERE tenant_id = p_tenant_id AND coalesce(activo, true) AND codigo ~ '^[0-9]+$'
        AND p_payload->>'codigo' LIKE codigo || '%' AND codigo <> p_payload->>'codigo'
      ORDER BY length(codigo) DESC LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'MIGRATION_FOX_ACCOUNT_PARENT_NOT_FOUND: %', p_payload->>'codigo' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.plan_cuentas (tenant_id, codigo, nombre, estado, metadata, acepta_movimiento, activo, nivel, tipo,
        tipo_cuenta, cuenta_padre_id, external_id, conciliable)
      VALUES (p_tenant_id, p_payload->>'codigo', btrim(p_payload->>'nombre'), v_padre.estado,
        jsonb_build_object('origen', 'migracion_fox', 'id_origen', v_id, 'run_id', p_run_id),
        coalesce((p_payload->>'acepta_movimiento')::boolean, true), true, coalesce(v_padre.nivel, 0) + 1, v_padre.tipo,
        v_padre.tipo_cuenta, v_padre.id, v_id, coalesce(v_padre.conciliable, false))
      RETURNING id INTO v_erp;
    END IF;
  ELSIF p_entidad = 'CUENTA_BANCARIA' THEN
    v_monto := coalesce(nullif(p_payload->>'saldo_apertura', '')::numeric, 0);
    -- La cuenta ya creada en el ERP se adopta por número; si ya opera, su
    -- saldo de apertura se duplicaría y se rechaza.
    SELECT * INTO v_cuenta FROM public.cuentas_bancarias
    WHERE tenant_id = p_tenant_id AND coalesce(activo, true)
      AND regexp_replace(numero_cuenta, '[^0-9A-Za-z]', '', 'g') = regexp_replace(coalesce(p_payload->>'numero_cuenta', ''), '[^0-9A-Za-z]', '', 'g')
    FOR UPDATE;
    IF FOUND AND regexp_replace(coalesce(p_payload->>'numero_cuenta', ''), '[^0-9A-Za-z]', '', 'g') <> '' THEN
      IF v_monto <> 0 AND EXISTS (SELECT 1 FROM public.movimientos_bancarios m
          WHERE m.tenant_id = p_tenant_id AND m.cuenta_bancaria_id = v_cuenta.id AND coalesce(m.activo, true)) THEN
        RAISE EXCEPTION 'MIGRATION_FOX_BANK_ACCOUNT_IN_USE: %', p_payload->>'numero_cuenta' USING ERRCODE = '55000';
      END IF;
      v_erp := v_cuenta.id; v_accion := 'ADOPTED';
    ELSE
      v_res := public.gestionar_cuenta_bancaria_tx(p_tenant_id, p_actor_id, NULL, jsonb_strip_nulls(jsonb_build_object(
        'nombre', p_payload->>'nombre', 'banco', p_payload->>'banco', 'numero_cuenta', p_payload->>'numero_cuenta',
        'moneda', upper(coalesce(p_payload->>'moneda', 'PEN')), 'tipo_cuenta', coalesce(p_payload->>'tipo_cuenta', 'CORRIENTE'),
        'cuenta_contable_id', app.fox_ref_582(p_tenant_id, 'plan_cuentas', p_payload->>'cuenta_contable_codigo'),
        -- Un saldo de apertura negativo es un sobregiro vigente en el banco.
        'permite_sobregiro', v_monto < 0, 'activa', true)), v_key);
      v_erp := coalesce((v_res->>'id')::uuid, (v_res#>>'{cuenta,id}')::uuid);
    END IF;
    IF v_monto <> 0 THEN
      IF nullif(p_payload->>'fecha_apertura', '') IS NULL THEN
        RAISE EXCEPTION 'MIGRATION_FOX_BANK_OPENING_DATE_REQUIRED' USING ERRCODE = '22023';
      END IF;
      -- Saldo de apertura sin asiento: el asiento de apertura contable ya trae
      -- el saldo de bancos. Un solo movimiento, marcado como migrado, con su
      -- valor en moneda local para cruzarlo con la contabilidad.
      SELECT * INTO v_cuenta FROM public.cuentas_bancarias WHERE tenant_id = p_tenant_id AND id = v_erp FOR UPDATE;
      v_tc := CASE WHEN upper(v_cuenta.moneda) = coalesce((SELECT upper(ec.moneda_defecto) FROM public.empresa_config ec
          WHERE ec.tenant_id = p_tenant_id LIMIT 1), 'PEN') THEN 1 ELSE nullif(p_payload->>'tipo_cambio', '')::numeric END;
      IF v_tc IS NULL OR v_tc <= 0 THEN
        RAISE EXCEPTION 'MIGRATION_FOX_BANK_EXCHANGE_RATE_REQUIRED: %', v_cuenta.moneda USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.movimientos_bancarios (tenant_id, cuenta_bancaria_id, tipo, monto, fecha, descripcion, referencia,
        conciliado, es_extracto, saldo_anterior, saldo_nuevo, created_by, idempotency_key, moneda, categoria,
        monto_moneda_local, tipo_cambio, activo, estado)
      VALUES (p_tenant_id, v_erp, CASE WHEN v_monto > 0 THEN 'ABONO' ELSE 'CARGO' END, abs(round(v_monto, 2)),
        (p_payload->>'fecha_apertura')::date, 'Saldo de apertura migrado de FOX', 'FOX:' || v_id, false, false,
        coalesce(v_cuenta.saldo, 0), coalesce(v_cuenta.saldo, 0) + round(v_monto, 2), p_actor_id, v_key || ':apertura',
        v_cuenta.moneda, 'APERTURA_MIGRACION', abs(round(v_monto * v_tc, 2)), v_tc, true, 'ACTIVO');
      UPDATE public.cuentas_bancarias SET saldo = coalesce(saldo, 0) + round(v_monto, 2),
        saldo_actual = coalesce(saldo_actual, 0) + round(v_monto, 2), saldo_contable = coalesce(saldo_contable, 0) + round(v_monto, 2),
        saldo_inicial = round(v_monto, 2), updated_by = p_actor_id, updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id AND id = v_erp;
    END IF;
  ELSIF p_entidad = 'LISTA_PRECIOS' THEN
    IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lineas') = 0 THEN
      RAISE EXCEPTION 'MIGRATION_FOX_LINES_REQUIRED' USING ERRCODE = '22023';
    END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
      v_par := app.fox_unico_582(p_tenant_id, 'productos', v_linea->>'producto_codigo');
      IF v_par IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', v_linea->>'producto_codigo' USING ERRCODE = '23503'; END IF;
      v_lineas := v_lineas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('producto_id', v_par,
        'precio_unitario', v_linea->'precio_unitario', 'cantidad_minima', coalesce(v_linea->'cantidad_minima', '1'::jsonb))));
    END LOOP;
    v_res := public.registrar_lista_precios_venta_tx(p_tenant_id, p_actor_id, v_key, jsonb_strip_nulls(jsonb_build_object(
      'codigo', p_payload->>'codigo', 'nombre', p_payload->>'nombre', 'moneda', upper(coalesce(p_payload->>'moneda', 'PEN')),
      'vigencia_desde', p_payload->>'vigencia_desde', 'vigencia_hasta', nullif(p_payload->>'vigencia_hasta', ''),
      'prioridad', coalesce(nullif(p_payload->>'prioridad', '')::integer, 100),
      'cliente_id', app.fox_ref_582(p_tenant_id, 'clientes', p_payload->>'cliente_codigo'))), v_lineas);
    v_erp := coalesce((v_res->>'id')::uuid, (v_res#>>'{lista,id}')::uuid);
  ELSIF p_entidad = 'OC_COMPRA' THEN
    v_par := app.fox_unico_582(p_tenant_id, 'proveedores', p_payload->>'proveedor_codigo');
    IF v_par IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_SUPPLIER_NOT_FOUND: %', p_payload->>'proveedor_codigo' USING ERRCODE = '23503'; END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'lineas', '[]'::jsonb)) LOOP
      v_saldo := app.fox_saldo_580(v_linea, 'cantidad_original', 'cantidad_recibida');
      CONTINUE WHEN v_saldo = 0;
      v_producto := app.fox_unico_582(p_tenant_id, 'productos', v_linea->>'producto_codigo');
      IF v_producto IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', v_linea->>'producto_codigo' USING ERRCODE = '23503'; END IF;
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('producto_id', v_producto, 'cantidad', v_saldo,
        'precio_unitario', v_linea->'precio_unitario', 'descripcion', coalesce(nullif(btrim(v_linea->>'descripcion'), ''),
          (SELECT nombre FROM public.productos WHERE tenant_id = p_tenant_id AND id = v_producto))));
    END LOOP;
    IF jsonb_array_length(v_lineas) = 0 THEN RAISE EXCEPTION 'MIGRATION_FOX_NOTHING_OPEN: OC compra %', v_id USING ERRCODE = '22023'; END IF;
    -- Llega en borrador: la aprueba en el ERP alguien distinto de quien migra.
    v_res := app.insert_purchase_order_453(p_tenant_id, p_actor_id, v_key, jsonb_strip_nulls(jsonb_build_object(
      'proveedor_id', v_par, 'numero', p_payload->>'numero', 'fecha_orden', p_payload->>'fecha_orden',
      'fecha_entrega_esperada', nullif(p_payload->>'fecha_entrega_esperada', ''), 'moneda', upper(coalesce(p_payload->>'moneda', 'PEN')),
      'almacen_destino_id', app.fox_ref_582(p_tenant_id, 'almacenes', p_payload->>'almacen_codigo'),
      'observaciones', 'Migrada de FOX ' || v_id, 'detalles', v_lineas)), NULL);
    v_erp := coalesce((v_res->>'id')::uuid, (v_res#>>'{orden,id}')::uuid, (v_res->>'orden_id')::uuid);
  ELSE
    v_par := app.fox_unico_582(p_tenant_id, 'clientes', p_payload->>'cliente_codigo');
    IF v_par IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_CLIENT_NOT_FOUND: codigo=%', p_payload->>'cliente_codigo' USING ERRCODE = '23503'; END IF;
    FOR v_linea IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'lineas', '[]'::jsonb)) LOOP
      v_saldo := app.fox_saldo_580(v_linea, 'cantidad_original', 'cantidad_despachada');
      CONTINUE WHEN v_saldo = 0;
      v_producto := app.fox_unico_582(p_tenant_id, 'productos', v_linea->>'producto_codigo');
      IF v_producto IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', v_linea->>'producto_codigo' USING ERRCODE = '23503'; END IF;
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('producto_id', v_producto, 'cantidad', v_saldo,
        'precio_unitario', v_linea->'precio_unitario'));
    END LOOP;
    IF jsonb_array_length(v_lineas) = 0 THEN RAISE EXCEPTION 'MIGRATION_FOX_NOTHING_OPEN: pedido %', v_id USING ERRCODE = '22023'; END IF;
    -- Writer base y no el comercial: el pedido abierto conserva el precio
    -- pactado en FOX en vez de re-tarifarse con las listas vigentes.
    v_res := public.crear_pedido_completo(jsonb_build_object('tenant_id', p_tenant_id, 'created_by', p_actor_id,
      'cliente_id', v_par, 'moneda', upper(coalesce(p_payload->>'moneda', 'PEN')),
      'observaciones', concat_ws(' ', 'Migrado de FOX', v_id, nullif(btrim(p_payload->>'numero'), ''))), v_lineas);
    v_erp := (v_res->>'pedido_id')::uuid;
    UPDATE public.pedidos_venta SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('origen', 'migracion_fox',
      'id_origen', v_id, 'numero_origen', nullif(btrim(p_payload->>'numero'), ''), 'run_id', p_run_id)
    WHERE tenant_id = p_tenant_id AND id = v_erp;
  END IF;
  IF v_erp IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_WRITER_RESULT_MISSING: %', p_entidad USING ERRCODE = '55000'; END IF;
  -- Dos registros FOX no se funden en uno del ERP sin que nadie lo decida.
  IF EXISTS (SELECT 1 FROM public.migracion_correspondencias WHERE tenant_id = p_tenant_id AND origen = 'FOX'
      AND entidad = p_entidad AND erp_id = v_erp AND id_origen <> v_id) THEN
    RAISE EXCEPTION 'MIGRATION_FOX_TARGET_ALREADY_LINKED: % %', p_entidad, v_id USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.migracion_correspondencias (tenant_id, origen, entidad, id_origen, erp_id, huella, datos_origen, run_id, created_by)
  VALUES (p_tenant_id, 'FOX', p_entidad, v_id, v_erp, v_huella, p_payload || jsonb_build_object('_accion', v_accion), p_run_id, p_actor_id);
  RETURN jsonb_build_object('id', v_erp, 'action', v_accion, 'idempotent', false);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID: %', SQLERRM USING ERRCODE = '22023';
END $fn$;

-- ---------------------------------------------------------------------------
-- Conciliación y ensayo de toda la migración
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.conciliar_migracion_fox_582(p_tenant_id uuid, p_actor_id uuid, p_control jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_erp jsonb; v_res jsonb := '[]'::jsonb; k text; o jsonb; e jsonb; v_ok boolean := true; v_fila jsonb; v_cruces jsonb;
  v_suministro jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.validar.read');
  IF jsonb_typeof(p_control) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_control) x WHERE x NOT IN (
       'clientes', 'proveedores', 'productos', 'almacenes', 'cuentas_contables', 'cuentas_bancarias', 'listas_precios',
       'cxc', 'cxp', 'balance', 'stock', 'contratos', 'oc', 'entregas', 'oc_compra', 'pedidos_venta')) THEN
    RAISE EXCEPTION 'MIGRATION_FOX_CONTROL_INVALID' USING ERRCODE = '22023';
  END IF;
  v_suministro := (public.conciliar_migracion_fox_580(p_tenant_id, p_actor_id, '{}'::jsonb))->'erp';
  v_erp := v_suministro || jsonb_build_object(
    'clientes', (SELECT jsonb_build_object('registros', count(*)) FROM public.migration_row_operations
      WHERE tenant_id = p_tenant_id AND operation_type = 'CLIENTE'),
    'proveedores', (SELECT jsonb_build_object('registros', count(*)) FROM public.migration_row_operations
      WHERE tenant_id = p_tenant_id AND operation_type = 'PROVEEDOR'),
    'productos', (SELECT jsonb_build_object('registros', count(*),
        'con_lote', count(*) FILTER (WHERE coalesce(pol.controla_lote, false)))
      FROM public.migracion_correspondencias c
      LEFT JOIN public.inventario_lote_politicas pol ON pol.tenant_id = c.tenant_id AND pol.producto_id = c.erp_id
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'PRODUCTO'),
    'almacenes', (SELECT jsonb_build_object('registros', count(*)) FROM public.migracion_correspondencias
      WHERE tenant_id = p_tenant_id AND origen = 'FOX' AND entidad = 'ALMACEN'),
    'cuentas_contables', (SELECT jsonb_build_object('registros', count(*),
        'creadas', count(*) FILTER (WHERE datos_origen->>'_accion' = 'CREATED')) FROM public.migracion_correspondencias
      WHERE tenant_id = p_tenant_id AND origen = 'FOX' AND entidad = 'CUENTA_CONTABLE'),
    'cuentas_bancarias', (SELECT jsonb_build_object('registros', count(*), 'saldo_local', round(coalesce(sum((
        SELECT sum(CASE m.tipo WHEN 'ABONO' THEN m.monto_moneda_local ELSE -m.monto_moneda_local END) FROM public.movimientos_bancarios m
        WHERE m.tenant_id = c.tenant_id AND m.cuenta_bancaria_id = c.erp_id AND m.categoria = 'APERTURA_MIGRACION')), 0), 2))
      FROM public.migracion_correspondencias c
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'CUENTA_BANCARIA'),
    'listas_precios', (SELECT jsonb_build_object('registros', count(*),
        'lineas', coalesce(sum(jsonb_array_length(c.datos_origen->'lineas')), 0)) FROM public.migracion_correspondencias c
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'LISTA_PRECIOS'),
    'cxc', (SELECT jsonb_build_object('registros', count(*), 'saldo', round(coalesce(sum(x.saldo_pendiente), 0), 2))
      FROM public.migration_row_operations o JOIN public.cuentas_por_cobrar x ON x.tenant_id = o.tenant_id AND x.id = o.target_id
      WHERE o.tenant_id = p_tenant_id AND o.operation_type = 'CXC_APERTURA'),
    'cxp', (SELECT jsonb_build_object('registros', count(*), 'saldo', round(coalesce(sum(x.saldo_pendiente), 0), 2))
      FROM public.migration_row_operations o JOIN public.cuentas_por_pagar x ON x.tenant_id = o.tenant_id AND x.id = o.target_id
      WHERE o.tenant_id = p_tenant_id AND o.operation_type = 'CXP_APERTURA'),
    'balance', (SELECT jsonb_build_object('lineas', count(d.id), 'debe', round(coalesce(sum(d.debe), 0), 2),
        'haber', round(coalesce(sum(d.haber), 0), 2))
      FROM public.migration_row_operations o JOIN public.detalle_asientos d ON d.tenant_id = o.tenant_id AND d.asiento_id = o.target_id
      WHERE o.tenant_id = p_tenant_id AND o.operation_type = 'BALANCE_APERTURA'),
    'oc_compra', (SELECT jsonb_build_object('registros', count(DISTINCT c.erp_id), 'lineas', count(d.id),
        'cantidad', coalesce(sum(d.cantidad), 0), 'valor', round(coalesce(sum(d.cantidad * d.precio_unitario), 0), 2))
      FROM public.migracion_correspondencias c
      LEFT JOIN public.orden_compra_detalles d ON d.tenant_id = c.tenant_id AND d.orden_id = c.erp_id
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'OC_COMPRA'),
    'pedidos_venta', (SELECT jsonb_build_object('registros', count(DISTINCT c.erp_id), 'lineas', count(d.id),
        'cantidad', coalesce(sum(d.cantidad), 0), 'valor', round(coalesce(sum(d.cantidad * d.precio_unitario), 0), 2))
      FROM public.migracion_correspondencias c
      LEFT JOIN public.pedidos_venta_detalle d ON d.tenant_id = c.tenant_id AND d.pedido_id = c.erp_id
      WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'PEDIDO_VENTA'));
  -- Cruce interno: por cada cuenta contable de bancos, el saldo de apertura
  -- migrado (en moneda local) frente a la línea del asiento de apertura.
  WITH bancos AS (
    SELECT b.cuenta_contable_id AS cuenta_id, count(*) AS cuentas_bancarias,
      round(coalesce(sum((SELECT sum(CASE m.tipo WHEN 'ABONO' THEN m.monto_moneda_local ELSE -m.monto_moneda_local END)
        FROM public.movimientos_bancarios m WHERE m.tenant_id = b.tenant_id AND m.cuenta_bancaria_id = b.id
          AND m.categoria = 'APERTURA_MIGRACION')), 0), 2) AS bancos
    FROM public.migracion_correspondencias c JOIN public.cuentas_bancarias b ON b.tenant_id = c.tenant_id AND b.id = c.erp_id
    WHERE c.tenant_id = p_tenant_id AND c.origen = 'FOX' AND c.entidad = 'CUENTA_BANCARIA'
    GROUP BY b.cuenta_contable_id
  ), por_cuenta AS (
    SELECT pc.codigo, x.cuentas_bancarias, x.bancos, (SELECT round(coalesce(sum(d.debe - d.haber), 0), 2)
        FROM public.migration_row_operations o JOIN public.detalle_asientos d ON d.tenant_id = o.tenant_id AND d.asiento_id = o.target_id
        WHERE o.tenant_id = p_tenant_id AND o.operation_type = 'BALANCE_APERTURA' AND d.cuenta_id = x.cuenta_id) AS apertura
    FROM bancos x LEFT JOIN public.plan_cuentas pc ON pc.id = x.cuenta_id
  )
  SELECT jsonb_build_object('bancos_vs_apertura', jsonb_build_object(
    'bancos', coalesce(sum(bancos), 0), 'apertura', coalesce(sum(apertura), 0),
    'cuadra', coalesce(bool_and(bancos = apertura), true),
    'cuentas', coalesce(jsonb_agg(jsonb_build_object('cuenta_contable', codigo, 'cuentas_bancarias', cuentas_bancarias,
      'bancos', bancos, 'apertura', apertura, 'cuadra', bancos = apertura) ORDER BY codigo), '[]'::jsonb)))
  INTO v_cruces FROM por_cuenta;
  FOR k IN SELECT key FROM jsonb_each(p_control) ORDER BY key LOOP
    o := p_control->k; e := v_erp->k;
    v_fila := jsonb_build_object('entidad', k, 'origen', o, 'erp', e, 'diferencias', coalesce((
      SELECT jsonb_object_agg(m.key, coalesce((e->>m.key)::numeric, 0) - (m.value#>>'{}')::numeric)
      FROM jsonb_each(o) m WHERE jsonb_typeof(m.value) = 'number'
        AND coalesce((e->>m.key)::numeric, 0) <> (m.value#>>'{}')::numeric), '{}'::jsonb));
    v_fila := v_fila || jsonb_build_object('cuadra', v_fila->'diferencias' = '{}'::jsonb);
    v_ok := v_ok AND (v_fila->>'cuadra')::boolean;
    v_res := v_res || jsonb_build_array(v_fila);
  END LOOP;
  RETURN jsonb_build_object('cuadra', v_ok, 'entidades', v_res, 'erp', v_erp, 'cruces', v_cruces);
END $fn$;

-- Ensayo integral: todo el lote en el orden real dentro de un bloque que se
-- revierte; cada registro en su subbloque para informar su error.
CREATE FUNCTION public.ensayar_migracion_fox_582(p_tenant_id uuid, p_actor_id uuid, p_lote jsonb, p_control jsonb, p_fecha_corte date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  -- jsonb[] crece en sitio; concatenar un jsonb copiaría todo el arreglo por registro.
  v_registros jsonb[] := '{}'; v_conc jsonb; v_detalle text; r jsonb; v jsonb; e record; v_ref uuid; v_det jsonb;
BEGIN
  PERFORM app.assert_migration_actor_473(p_tenant_id, p_actor_id, NULL);
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.fox.import');
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'migration.validar.read');
  IF jsonb_typeof(p_lote) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_each(p_lote) x
       WHERE x.key NOT IN ('clientes', 'proveedores', 'almacenes', 'cuentas_contables', 'productos', 'cuentas_bancarias',
         'listas_precios', 'cxc', 'cxp', 'balance', 'contratos', 'oc', 'entregas', 'oc_compra', 'pedidos_venta', 'stock')
         OR jsonb_typeof(x.value) <> 'array') THEN
    RAISE EXCEPTION 'MIGRATION_FOX_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  BEGIN
    FOR e IN SELECT * FROM (VALUES
        (1, 'clientes', 'CLIENTE'), (2, 'proveedores', 'PROVEEDOR'), (3, 'almacenes', 'ALMACEN'),
        (4, 'cuentas_contables', 'CUENTA_CONTABLE'), (5, 'productos', 'PRODUCTO'), (6, 'cuentas_bancarias', 'CUENTA_BANCARIA'),
        (7, 'listas_precios', 'LISTA_PRECIOS'), (8, 'cxc', 'CXC'), (9, 'cxp', 'CXP'), (10, 'contratos', 'CONTRATO'),
        (11, 'oc', 'OC'), (12, 'entregas', 'ENTREGA'), (13, 'oc_compra', 'OC_COMPRA'), (14, 'pedidos_venta', 'PEDIDO_VENTA'))
      x(orden, clave, entidad) ORDER BY orden LOOP
      FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_lote->e.clave, '[]'::jsonb)) LOOP
        BEGIN
          IF e.entidad = 'CLIENTE' THEN
            v := public.importar_cliente_historico_tx(p_tenant_id, p_actor_id, NULL, r->>'id_origen', r->'payload');
          ELSIF e.entidad = 'PROVEEDOR' THEN
            v := public.importar_proveedor_historico_tx(p_tenant_id, p_actor_id, NULL, r->>'id_origen', r->'payload');
          ELSIF e.entidad IN ('CXC', 'CXP') THEN
            v_ref := app.fox_unico_582(p_tenant_id, CASE e.entidad WHEN 'CXC' THEN 'clientes' ELSE 'proveedores' END,
              r#>>'{payload,codigo_tercero}');
            IF v_ref IS NULL THEN
              RAISE EXCEPTION 'MIGRATION_FOX_PARTY_NOT_FOUND: %', r#>>'{payload,codigo_tercero}' USING ERRCODE = '23503';
            END IF;
            v_det := (r->'payload') - 'codigo_tercero' || jsonb_build_object('fecha_corte', p_fecha_corte,
              CASE e.entidad WHEN 'CXC' THEN 'cliente_id' ELSE 'proveedor_id' END, v_ref);
            v := CASE e.entidad WHEN 'CXC'
              THEN public.importar_cxc_apertura_tx(p_tenant_id, p_actor_id, NULL, r->>'id_origen', v_det)
              ELSE public.importar_cxp_apertura_tx(p_tenant_id, p_actor_id, NULL, r->>'id_origen', v_det) END;
          ELSIF e.entidad IN ('CONTRATO', 'OC', 'ENTREGA') THEN
            v := public.importar_suministro_fox_580(p_tenant_id, p_actor_id, NULL, e.entidad, r->>'id_origen', r->'payload');
          ELSE
            v := public.importar_maestro_fox_582(p_tenant_id, p_actor_id, NULL, e.entidad, r->>'id_origen', r->'payload');
          END IF;
          v_registros := v_registros || jsonb_build_object('entidad', e.entidad, 'id_origen', r->>'id_origen',
            'fila', r->'fila', 'ok', true, 'accion', v->>'action');
        EXCEPTION WHEN OTHERS THEN
          v_registros := v_registros || jsonb_build_object('entidad', e.entidad, 'id_origen', r->>'id_origen',
            'fila', r->'fila', 'ok', false, 'error', SQLERRM);
        END;
      END LOOP;
    END LOOP;
    -- El balance se ensaya como un solo asiento, igual que su importación,
    -- con las cuentas resueltas por código después de crear las subcuentas.
    IF jsonb_array_length(coalesce(p_lote->'balance', '[]'::jsonb)) > 0 THEN
      BEGIN
        IF p_fecha_corte IS NULL THEN RAISE EXCEPTION 'MIGRATION_FOX_CUTOFF_REQUIRED' USING ERRCODE = '22023'; END IF;
        v_det := '[]'::jsonb;
        FOR r IN SELECT value FROM jsonb_array_elements(p_lote->'balance') LOOP
          v_ref := app.fox_unico_582(p_tenant_id, 'plan_cuentas', r#>>'{payload,cuenta_contable_codigo}');
          IF v_ref IS NULL THEN
            RAISE EXCEPTION 'MIGRATION_FOX_ACCOUNT_NOT_FOUND: %', r#>>'{payload,cuenta_contable_codigo}' USING ERRCODE = '23503';
          END IF;
          v_det := v_det || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('cuenta_id', v_ref,
            'centro_costo_id', (SELECT cc.id FROM public.centros_costo cc WHERE cc.tenant_id = p_tenant_id
              AND cc.codigo = nullif(r#>>'{payload,centro_costo_codigo}', '') LIMIT 1),
            'debe', coalesce(nullif(r#>>'{payload,debe}', '')::numeric, 0), 'haber', coalesce(nullif(r#>>'{payload,haber}', '')::numeric, 0),
            'concepto', coalesce(r#>>'{payload,descripcion}', ''))));
        END LOOP;
        v := public.importar_balance_apertura_tx(p_tenant_id, p_actor_id, NULL, p_fecha_corte, v_det);
        v_registros := v_registros || jsonb_build_object('entidad', 'BALANCE', 'id_origen', 'apertura',
          'fila', NULL, 'ok', true, 'accion', coalesce(v->>'action', 'CREATED'));
      EXCEPTION WHEN OTHERS THEN
        v_registros := v_registros || jsonb_build_object('entidad', 'BALANCE', 'id_origen', 'apertura',
          'fila', NULL, 'ok', false, 'error', SQLERRM);
      END;
    END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_lote->'stock', '[]'::jsonb)) LOOP
      BEGIN
        v_ref := app.fox_unico_582(p_tenant_id, 'productos', r#>>'{stock,producto_codigo}');
        IF v_ref IS NULL THEN
          RAISE EXCEPTION 'MIGRATION_FOX_PRODUCT_NOT_FOUND: %', r#>>'{stock,producto_codigo}' USING ERRCODE = '23503';
        END IF;
        v_det := (r->'stock') - 'producto_codigo' - 'almacen_codigo' || jsonb_build_object('producto_id', v_ref);
        IF nullif(r#>>'{stock,almacen_codigo}', '') IS NOT NULL THEN
          v_ref := app.fox_unico_582(p_tenant_id, 'almacenes', r#>>'{stock,almacen_codigo}');
          IF v_ref IS NULL THEN
            RAISE EXCEPTION 'MIGRATION_STOCK_WAREHOUSE_NOT_FOUND: %', r#>>'{stock,almacen_codigo}' USING ERRCODE = '23503';
          END IF;
          -- Sin sucursal explícita, la del almacén o la principal, como el importador.
          v_det := v_det || jsonb_build_object('almacen_id', v_ref, 'sucursal_id', coalesce(nullif(r#>>'{stock,sucursal_id}', ''),
            (SELECT a.sucursal_id::text FROM public.almacenes a WHERE a.id = v_ref),
            (SELECT s.id::text FROM public.sucursales s WHERE s.tenant_id = p_tenant_id ORDER BY s.es_principal DESC NULLS LAST, s.id LIMIT 1)));
        END IF;
        v := public.importar_stock_inicial_tx(p_tenant_id, p_actor_id, NULL, r->>'external_id', v_det);
        v_registros := v_registros || jsonb_build_object('entidad', 'STOCK', 'id_origen', r->>'external_id',
          'fila', r->'fila', 'ok', true, 'accion', v->>'action');
      EXCEPTION WHEN OTHERS THEN
        v_registros := v_registros || jsonb_build_object('entidad', 'STOCK', 'id_origen', r->>'external_id',
          'fila', r->'fila', 'ok', false, 'error', SQLERRM);
      END;
    END LOOP;
    v_conc := CASE WHEN p_control IS NULL THEN NULL ELSE public.conciliar_migracion_fox_582(p_tenant_id, p_actor_id, p_control) END;
    RAISE EXCEPTION USING ERRCODE = 'P0582', MESSAGE = 'MIGRATION_FOX_REHEARSAL_ROLLBACK',
      DETAIL = jsonb_build_object('registros', to_jsonb(v_registros), 'conciliacion', v_conc)::text;
  EXCEPTION WHEN SQLSTATE 'P0582' THEN
    GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
  END;
  RETURN v_detalle::jsonb || jsonb_build_object('ensayo', true,
    'errores', (SELECT count(*) FROM jsonb_array_elements(v_detalle::jsonb->'registros') x WHERE NOT (x->>'ok')::boolean));
END $fn$;

-- ---------------------------------------------------------------------------
-- Permisos: importar es de ADMIN; leer el archivo, de quien audita o dirige.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.seed_migracion_fox_582(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, 'migration', s.recurso, s.accion, s.codigo, s.descripcion, true
  FROM (VALUES
    ('fox', 'import', 'migration.fox.import', 'Importar maestros y saldos abiertos desde FOX'),
    ('archivo', 'import', 'migration.archivo.import', 'Cargar el archivo íntegro del extracto FOX'),
    ('archivo', 'read', 'migration.archivo.read', 'Consultar el archivo histórico de FOX')
  ) s(recurso, accion, codigo, descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = s.codigo);
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND coalesce(r.activo, true) AND coalesce(p.activo, true)
    AND ((upper(btrim(r.nombre)) = 'ADMIN' AND p.codigo IN ('migration.fox.import', 'migration.archivo.import', 'migration.archivo.read'))
      OR (upper(btrim(r.nombre)) IN ('GERENCIA', 'CONTADOR', 'AUDITOR') AND p.codigo = 'migration.archivo.read'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_migracion_fox_role_582() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_migracion_fox_582(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_migracion_fox_role_582 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_migracion_fox_role_582();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_migracion_fox_582(t); END LOOP;
END $seed$;

REVOKE ALL ON FUNCTION app.archivo_inmutable_582(), app.campo_sensible_582(text), app.redactar_fila_582(jsonb),
  app.fox_unico_582(uuid, text, text), app.fox_ref_582(uuid, text, text), app.seed_migracion_fox_582(uuid),
  app.seed_migracion_fox_role_582() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operar_archivo_fox_582(uuid, uuid, text, jsonb, text), public.archivar_filas_fox_582(uuid, uuid, uuid, text, jsonb),
  public.consultar_archivo_fox_582(uuid, uuid, jsonb), public.importar_maestro_fox_582(uuid, uuid, uuid, text, text, jsonb),
  public.conciliar_migracion_fox_582(uuid, uuid, jsonb), public.ensayar_migracion_fox_582(uuid, uuid, jsonb, jsonb, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operar_archivo_fox_582(uuid, uuid, text, jsonb, text), public.archivar_filas_fox_582(uuid, uuid, uuid, text, jsonb),
  public.consultar_archivo_fox_582(uuid, uuid, jsonb), public.importar_maestro_fox_582(uuid, uuid, uuid, text, text, jsonb),
  public.conciliar_migracion_fox_582(uuid, uuid, jsonb), public.ensayar_migracion_fox_582(uuid, uuid, jsonb, jsonb, date)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
