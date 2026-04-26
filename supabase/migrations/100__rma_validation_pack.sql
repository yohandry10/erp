-- ============================================================================
-- 100__rma_validation_pack.sql
-- Pack de validación runtime para flujo RMA.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rma_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_normalize_rma_solicitudes_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_solicitudes'
        AND t.tgname = 'trg_normalize_rma_solicitudes_row'
        AND NOT t.tgisinternal
    ),
    'normalización de solicitudes RMA';

  RETURN QUERY
  SELECT
    'trigger_normalize_rma_items_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_items'
        AND t.tgname = 'trg_normalize_rma_items_row'
        AND NOT t.tgisinternal
    ),
    'normalización de items RMA';

  RETURN QUERY
  SELECT
    'trigger_normalize_rma_eventos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_eventos'
        AND t.tgname = 'trg_normalize_rma_eventos_row'
        AND NOT t.tgisinternal
    ),
    'normalización de eventos RMA';

  RETURN QUERY
  SELECT
    'trigger_enforce_rma_solicitudes_tenant'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_solicitudes'
        AND t.tgname = 'trg_enforce_rma_solicitudes_tenant'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en cabecera RMA';

  RETURN QUERY
  SELECT
    'trigger_enforce_rma_items_tenant'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_items'
        AND t.tgname = 'trg_enforce_rma_items_tenant'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en items RMA';

  RETURN QUERY
  SELECT
    'trigger_enforce_rma_eventos_tenant'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rma_eventos'
        AND t.tgname = 'trg_enforce_rma_eventos_tenant'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en eventos RMA';

  RETURN QUERY
  SELECT
    'rma_solicitudes_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'rma_solicitudes'
        AND c.column_name IN (
          'numero',
          'pedido_id',
          'cliente_id',
          'nota_credito_documento_id',
          'almacen_retorno_id',
          'aprobado_por',
          'recibido_por',
          'motivo_general'
        )
    ),
    'columnas críticas del flujo RMA';

  RETURN QUERY
  SELECT
    'rma_items_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'rma_items'
        AND c.column_name IN (
          'rma_id',
          'detalle_id',
          'producto_id',
          'cantidad_autorizada',
          'cantidad_devuelta',
          'motivo_item',
          'lote',
          'fecha_expiracion'
        )
    ),
    'columnas críticas de items RMA';

  RETURN QUERY
  SELECT
    'rma_eventos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 4
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'rma_eventos'
        AND c.column_name IN ('rma_id', 'tipo', 'descripcion', 'usuario_id')
    ),
    'columnas críticas de eventos RMA';

  RETURN QUERY
  SELECT
    'fk_rma_items_rma_id_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_items_rma_id'
        AND conrelid = 'public.rma_items'::regclass
    ),
    'embed items:rma_items requiere FK a rma_solicitudes';

  RETURN QUERY
  SELECT
    'fk_rma_eventos_rma_id_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_eventos_rma_id'
        AND conrelid = 'public.rma_eventos'::regclass
    ),
    'embed eventos:rma_eventos requiere FK a rma_solicitudes';

  RETURN QUERY
  SELECT
    'ux_rma_solicitudes_tenant_numero_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'rma_solicitudes'
        AND indexname = 'ux_rma_solicitudes_tenant_numero'
    ),
    'unicidad operativa de número RMA por tenant';

  RETURN QUERY
  SELECT
    'ux_rma_items_rma_detalle_activo_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'rma_items'
        AND indexname = 'ux_rma_items_rma_detalle_activo'
    ),
    'evita duplicidad de detalle activo dentro del mismo RMA';

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_solicitudes r
  WHERE (
      r.numero IS NULL
      OR btrim(r.numero) = ''
      OR r.tipo NOT IN ('DEVOLUCION', 'GARANTIA', 'CAMBIO', 'OTRO')
      OR r.estado NOT IN ('CREADA', 'APROBADA', 'RECHAZADA', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'CANCELADA', 'INACTIVO')
    )
    AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_solicitudes_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  WHERE (
      i.rma_id IS NULL
      OR i.motivo_item IS NULL
      OR btrim(i.motivo_item) = ''
      OR i.cantidad_autorizada < 0
      OR i.cantidad_devuelta < 0
      OR i.cantidad_devuelta > i.cantidad_autorizada
    )
    AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_items_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_eventos e
  WHERE (
      e.rma_id IS NULL
      OR e.tipo IS NULL
      OR btrim(e.tipo) = ''
      OR e.descripcion IS NULL
      OR btrim(e.descripcion) = ''
    )
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_eventos_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  LEFT JOIN public.rma_solicitudes r ON r.id = i.rma_id
  WHERE i.rma_id IS NOT NULL
    AND r.id IS NULL
    AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_items_orphan_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_eventos e
  LEFT JOIN public.rma_solicitudes r ON r.id = e.rma_id
  WHERE e.rma_id IS NOT NULL
    AND r.id IS NULL
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_eventos_orphan_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  JOIN public.rma_solicitudes r ON r.id = i.rma_id
  WHERE i.tenant_id <> r.tenant_id
    AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_items_tenant_mismatch_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_eventos e
  JOIN public.rma_solicitudes r ON r.id = e.rma_id
  WHERE e.tenant_id <> r.tenant_id
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'rma_eventos_tenant_mismatch_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      tenant_id,
      upper(numero) AS numero_norm,
      COUNT(*) AS c
    FROM public.rma_solicitudes
    WHERE numero IS NOT NULL AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(numero)
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_rma_solicitudes_numero_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      i.rma_id,
      i.detalle_id,
      COUNT(*) AS c
    FROM public.rma_items i
    WHERE i.rma_id IS NOT NULL
      AND i.detalle_id IS NOT NULL
      AND upper(COALESCE(i.estado, 'CREADA')) NOT IN ('RECHAZADO', 'INACTIVO')
      AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    GROUP BY i.rma_id, i.detalle_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_rma_items_active_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_rma_runtime_status_actual AS
SELECT *
FROM public.validar_rma_runtime(app.resolve_request_tenant_id());

COMMIT;
