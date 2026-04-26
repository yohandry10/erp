-- ============================================================================
-- 099__rma_integrity_constraints.sql
-- Integridad, consistencia tenant y hardening RLS para flujo RMA.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para normalizar estados/valores antes de constraints.
-- ----------------------------------------------------------------------------
UPDATE public.rma_solicitudes
SET
  estado = CASE upper(COALESCE(estado, 'CREADA'))
    WHEN 'ACTIVO' THEN 'CREADA'
    WHEN 'INACTIVO' THEN 'CANCELADA'
    ELSE upper(COALESCE(estado, 'CREADA'))
  END,
  tipo = upper(COALESCE(NULLIF(btrim(COALESCE(tipo, '')), ''), 'DEVOLUCION')),
  numero = COALESCE(NULLIF(btrim(COALESCE(numero, '')), ''), NULLIF(btrim(COALESCE(codigo, '')), ''), 'RMA-SIN-NUMERO'),
  codigo = COALESCE(NULLIF(btrim(COALESCE(codigo, '')), ''), numero),
  updated_at = now()
WHERE
  estado IS NULL
  OR tipo IS NULL
  OR numero IS NULL
  OR btrim(COALESCE(numero, '')) = ''
  OR codigo IS NULL
  OR btrim(COALESCE(codigo, '')) = '';

UPDATE public.rma_items
SET
  estado = CASE upper(COALESCE(estado, 'CREADA'))
    WHEN 'ACTIVO' THEN 'CREADA'
    ELSE upper(COALESCE(estado, 'CREADA'))
  END,
  motivo_item = COALESCE(NULLIF(btrim(COALESCE(motivo_item, '')), ''), 'DEVOLUCION'),
  cantidad_autorizada = GREATEST(COALESCE(cantidad_autorizada, 0), 0),
  cantidad_devuelta = GREATEST(COALESCE(cantidad_devuelta, 0), 0),
  updated_at = now()
WHERE
  estado IS NULL
  OR motivo_item IS NULL
  OR btrim(COALESCE(motivo_item, '')) = ''
  OR cantidad_autorizada IS NULL
  OR cantidad_autorizada < 0
  OR cantidad_devuelta IS NULL
  OR cantidad_devuelta < 0;

UPDATE public.rma_items
SET
  cantidad_devuelta = LEAST(cantidad_devuelta, cantidad_autorizada),
  estado = CASE
    WHEN cantidad_autorizada > 0 AND LEAST(cantidad_devuelta, cantidad_autorizada) >= cantidad_autorizada THEN 'CERRADO'
    WHEN LEAST(cantidad_devuelta, cantidad_autorizada) > 0 THEN 'PARCIAL'
    ELSE estado
  END,
  updated_at = now()
WHERE cantidad_autorizada >= 0 AND cantidad_devuelta > cantidad_autorizada;

UPDATE public.rma_eventos
SET
  tipo = upper(COALESCE(NULLIF(btrim(COALESCE(tipo, '')), ''), 'EVENTO')),
  descripcion = COALESCE(NULLIF(btrim(COALESCE(descripcion, '')), ''), 'Evento RMA'),
  updated_at = now()
WHERE
  tipo IS NULL
  OR btrim(COALESCE(tipo, '')) = ''
  OR descripcion IS NULL
  OR btrim(COALESCE(descripcion, '')) = '';

-- ----------------------------------------------------------------------------
-- Dedupe de número por tenant para habilitar índice único operativo.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tenant_id, upper(numero)
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.rma_solicitudes
  WHERE numero IS NOT NULL AND btrim(numero) <> ''
)
UPDATE public.rma_solicitudes r
SET
  numero = format('%s-DUP-%s', r.numero, ranked.rn),
  codigo = format('%s-DUP-%s', COALESCE(NULLIF(btrim(COALESCE(r.codigo, '')), ''), r.numero), ranked.rn),
  updated_at = now()
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- ----------------------------------------------------------------------------
-- Dedupe de items activos por (rma_id, detalle_id) para índice único parcial.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY rma_id, detalle_id
      ORDER BY COALESCE(updated_at, created_at, now()) DESC, id::text DESC
    ) AS rn
  FROM public.rma_items
  WHERE rma_id IS NOT NULL
    AND detalle_id IS NOT NULL
    AND upper(COALESCE(estado, 'CREADA')) NOT IN ('RECHAZADO', 'INACTIVO')
)
UPDATE public.rma_items i
SET
  estado = 'INACTIVO',
  updated_at = now(),
  metadata = COALESCE(i.metadata, '{}'::jsonb) || jsonb_build_object('dedupe_migration', '099__rma_integrity_constraints')
FROM ranked
WHERE i.id = ranked.id
  AND ranked.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints y relaciones.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.rma_solicitudes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_solicitudes_numero_nonempty'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT ck_rma_solicitudes_numero_nonempty
      CHECK (numero IS NOT NULL AND btrim(numero) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_solicitudes_tipo_valid'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT ck_rma_solicitudes_tipo_valid
      CHECK (tipo IN ('DEVOLUCION', 'GARANTIA', 'CAMBIO', 'OTRO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_solicitudes_estado_valid'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT ck_rma_solicitudes_estado_valid
      CHECK (estado IN ('CREADA', 'APROBADA', 'RECHAZADA', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'CANCELADA', 'INACTIVO'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_solicitudes_timeline_valid'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT ck_rma_solicitudes_timeline_valid
      CHECK (
        (aprobado_en IS NULL OR aprobado_en >= created_at)
        AND (recibido_en IS NULL OR recibido_en >= COALESCE(aprobado_en, created_at))
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_pedido_id'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_pedido_id
      FOREIGN KEY (pedido_id) REFERENCES public.pedidos_venta(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_cliente_id'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_cliente_id
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_nota_credito_documento_id'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_nota_credito_documento_id
      FOREIGN KEY (nota_credito_documento_id) REFERENCES public.documentos(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_almacen_retorno_id'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_almacen_retorno_id
      FOREIGN KEY (almacen_retorno_id) REFERENCES public.almacenes(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_aprobado_por'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_aprobado_por
      FOREIGN KEY (aprobado_por) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_solicitudes_recibido_por'
        AND conrelid = 'public.rma_solicitudes'::regclass
    ) THEN
      ALTER TABLE public.rma_solicitudes
      ADD CONSTRAINT fk_rma_solicitudes_recibido_por
      FOREIGN KEY (recibido_por) REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('public.rma_items') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_items_motivo_nonempty'
        AND conrelid = 'public.rma_items'::regclass
    ) THEN
      ALTER TABLE public.rma_items
      ADD CONSTRAINT ck_rma_items_motivo_nonempty
      CHECK (motivo_item IS NOT NULL AND btrim(motivo_item) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_items_cantidades_valid'
        AND conrelid = 'public.rma_items'::regclass
    ) THEN
      ALTER TABLE public.rma_items
      ADD CONSTRAINT ck_rma_items_cantidades_valid
      CHECK (
        cantidad_autorizada >= 0
        AND cantidad_devuelta >= 0
        AND cantidad_devuelta <= cantidad_autorizada
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_items_rma_id'
        AND conrelid = 'public.rma_items'::regclass
    ) THEN
      ALTER TABLE public.rma_items
      ADD CONSTRAINT fk_rma_items_rma_id
      FOREIGN KEY (rma_id) REFERENCES public.rma_solicitudes(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_items_detalle_id'
        AND conrelid = 'public.rma_items'::regclass
    ) THEN
      ALTER TABLE public.rma_items
      ADD CONSTRAINT fk_rma_items_detalle_id
      FOREIGN KEY (detalle_id) REFERENCES public.pedidos_venta_detalle(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_items_producto_id'
        AND conrelid = 'public.rma_items'::regclass
    ) THEN
      ALTER TABLE public.rma_items
      ADD CONSTRAINT fk_rma_items_producto_id
      FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('public.rma_eventos') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_eventos_tipo_nonempty'
        AND conrelid = 'public.rma_eventos'::regclass
    ) THEN
      ALTER TABLE public.rma_eventos
      ADD CONSTRAINT ck_rma_eventos_tipo_nonempty
      CHECK (tipo IS NOT NULL AND btrim(tipo) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_rma_eventos_descripcion_nonempty'
        AND conrelid = 'public.rma_eventos'::regclass
    ) THEN
      ALTER TABLE public.rma_eventos
      ADD CONSTRAINT ck_rma_eventos_descripcion_nonempty
      CHECK (descripcion IS NOT NULL AND btrim(descripcion) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_rma_eventos_rma_id'
        AND conrelid = 'public.rma_eventos'::regclass
    ) THEN
      ALTER TABLE public.rma_eventos
      ADD CONSTRAINT fk_rma_eventos_rma_id
      FOREIGN KEY (rma_id) REFERENCES public.rma_solicitudes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant por relaciones RMA.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_rma_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_parent_tenant uuid;
  v_ref_tenant uuid;
BEGIN
  IF TG_TABLE_NAME = 'rma_solicitudes' THEN
    IF NEW.pedido_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.pedidos_venta WHERE id = NEW.pedido_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido % no existe para la solicitud RMA', NEW.pedido_id;
      END IF;
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_ref_tenant;
      ELSIF v_ref_tenant <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_solicitudes.pedido_id';
      END IF;
    END IF;

    IF NEW.cliente_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.clientes WHERE id = NEW.cliente_id;
      IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_solicitudes.cliente_id';
      END IF;
    END IF;

    IF NEW.almacen_retorno_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.almacenes WHERE id = NEW.almacen_retorno_id;
      IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_solicitudes.almacen_retorno_id';
      END IF;
    END IF;

    IF NEW.nota_credito_documento_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.documentos WHERE id = NEW.nota_credito_documento_id;
      IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_solicitudes.nota_credito_documento_id';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'rma_items' THEN
    IF NEW.rma_id IS NULL THEN
      RAISE EXCEPTION 'rma_items.rma_id es requerido';
    END IF;

    SELECT tenant_id INTO v_parent_tenant FROM public.rma_solicitudes WHERE id = NEW.rma_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La solicitud RMA % no existe', NEW.rma_id;
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_parent_tenant;
    ELSIF NEW.tenant_id <> v_parent_tenant THEN
      RAISE EXCEPTION 'Tenant inconsistente entre rma_items y rma_solicitudes';
    END IF;

    IF NEW.detalle_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.pedidos_venta_detalle WHERE id = NEW.detalle_id;
      IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_items.detalle_id';
      END IF;
    END IF;

    IF NEW.producto_id IS NOT NULL THEN
      SELECT tenant_id INTO v_ref_tenant FROM public.productos WHERE id = NEW.producto_id;
      IF FOUND AND v_ref_tenant IS NOT NULL AND NEW.tenant_id <> v_ref_tenant THEN
        RAISE EXCEPTION 'Tenant inconsistente en rma_items.producto_id';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'rma_eventos' THEN
    IF NEW.rma_id IS NULL THEN
      RAISE EXCEPTION 'rma_eventos.rma_id es requerido';
    END IF;

    SELECT tenant_id INTO v_parent_tenant FROM public.rma_solicitudes WHERE id = NEW.rma_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La solicitud RMA % no existe', NEW.rma_id;
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_parent_tenant;
    ELSIF NEW.tenant_id <> v_parent_tenant THEN
      RAISE EXCEPTION 'Tenant inconsistente entre rma_eventos y rma_solicitudes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rma_solicitudes_tenant ON public.rma_solicitudes;
CREATE TRIGGER trg_enforce_rma_solicitudes_tenant
BEFORE INSERT OR UPDATE ON public.rma_solicitudes
FOR EACH ROW
EXECUTE FUNCTION app.enforce_rma_tenant_consistency();

DROP TRIGGER IF EXISTS trg_enforce_rma_items_tenant ON public.rma_items;
CREATE TRIGGER trg_enforce_rma_items_tenant
BEFORE INSERT OR UPDATE ON public.rma_items
FOR EACH ROW
EXECUTE FUNCTION app.enforce_rma_tenant_consistency();

DROP TRIGGER IF EXISTS trg_enforce_rma_eventos_tenant ON public.rma_eventos;
CREATE TRIGGER trg_enforce_rma_eventos_tenant
BEFORE INSERT OR UPDATE ON public.rma_eventos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_rma_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Índices únicos operativos.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_solicitudes_tenant_numero
ON public.rma_solicitudes (tenant_id, upper(numero));

CREATE UNIQUE INDEX IF NOT EXISTS ux_rma_items_rma_detalle_activo
ON public.rma_items (rma_id, detalle_id)
WHERE detalle_id IS NOT NULL
  AND upper(COALESCE(estado, 'CREADA')) NOT IN ('RECHAZADO', 'INACTIVO');

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito para tablas RMA.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['rma_solicitudes', 'rma_items', 'rma_eventos']
  LOOP
    v_policy := format('%s_tenant_policy', v_table);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I
       USING (app.is_superadmin() OR tenant_id = app.current_tenant_id())
       WITH CHECK (app.is_superadmin() OR tenant_id = app.current_tenant_id())',
      v_policy,
      v_table
    );
  END LOOP;
END
$$;

COMMIT;
