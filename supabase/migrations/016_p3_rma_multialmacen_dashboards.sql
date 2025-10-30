-- Migration 016: P3 RMA, multialmacén y dashboards OTIF/SUNAT
-- Fecha: 2025-10-22
-- Descripción: Implementa tablas de RMA, estructuras multialmacén y vistas de KPIs multi-tenant

BEGIN;

-- =============================================
-- Tablas de almacenes y ubicaciones (multialmacén)
-- =============================================
CREATE TABLE IF NOT EXISTS almacenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  direccion TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, codigo)
);

ALTER TABLE almacenes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'almacenes_select_rls') THEN
    CREATE POLICY almacenes_select_rls ON almacenes FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'almacenes_insert_rls') THEN
    CREATE POLICY almacenes_insert_rls ON almacenes FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'almacenes_update_rls') THEN
    CREATE POLICY almacenes_update_rls ON almacenes FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'almacenes_delete_rls') THEN
    CREATE POLICY almacenes_delete_rls ON almacenes FOR DELETE USING (tenant_id = app.current_tenant_id());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS almacen_ubicaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  codigo VARCHAR(40) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(20) DEFAULT 'GENERAL',
  es_pickface BOOLEAN DEFAULT true,
  permite_reservas BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(almacen_id, codigo)
);

ALTER TABLE almacen_ubicaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_select_rls') THEN
    CREATE POLICY ubicaciones_select_rls ON almacen_ubicaciones FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_insert_rls') THEN
    CREATE POLICY ubicaciones_insert_rls ON almacen_ubicaciones FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_update_rls') THEN
    CREATE POLICY ubicaciones_update_rls ON almacen_ubicaciones FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_delete_rls') THEN
    CREATE POLICY ubicaciones_delete_rls ON almacen_ubicaciones FOR DELETE USING (tenant_id = app.current_tenant_id());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS producto_existencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  almacen_id UUID NOT NULL REFERENCES almacenes(id) ON DELETE CASCADE,
  ubicacion_id UUID REFERENCES almacen_ubicaciones(id) ON DELETE SET NULL,
  lote VARCHAR(80),
  fecha_expiracion DATE,
  stock_actual NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_reservado NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_danado NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ubicacion_norm UUID GENERATED ALWAYS AS (COALESCE(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  lote_norm TEXT GENERATED ALWAYS AS (COALESCE(lote, '')) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_producto_existencias_key
  ON producto_existencias(tenant_id, producto_id, almacen_id, ubicacion_norm, lote_norm);

ALTER TABLE producto_existencias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'existencias_select_rls') THEN
    CREATE POLICY existencias_select_rls ON producto_existencias FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'existencias_insert_rls') THEN
    CREATE POLICY existencias_insert_rls ON producto_existencias FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'existencias_update_rls') THEN
    CREATE POLICY existencias_update_rls ON producto_existencias FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'existencias_delete_rls') THEN
    CREATE POLICY existencias_delete_rls ON producto_existencias FOR DELETE USING (tenant_id = app.current_tenant_id());
  END IF;
END $$;

-- =============================================
-- Tablas y eventos de RMA
-- =============================================
CREATE TABLE IF NOT EXISTS rma_solicitudes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  numero VARCHAR(30),
  motivo_general TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'DEVOLUCION',
  estado VARCHAR(20) NOT NULL DEFAULT 'CREADA',
  nota_credito_documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL,
  almacen_retorno_id UUID REFERENCES almacenes(id) ON DELETE SET NULL,
  aprobado_por UUID,
  aprobado_en TIMESTAMPTZ,
  recibido_por UUID,
  recibido_en TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rma_solicitudes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_select_rls') THEN
    CREATE POLICY rma_select_rls ON rma_solicitudes FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_insert_rls') THEN
    CREATE POLICY rma_insert_rls ON rma_solicitudes FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_update_rls') THEN
    CREATE POLICY rma_update_rls ON rma_solicitudes FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rma_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  rma_id UUID NOT NULL REFERENCES rma_solicitudes(id) ON DELETE CASCADE,
  detalle_id UUID NOT NULL REFERENCES pedidos_venta_detalle(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad_autorizada NUMERIC(14,2) NOT NULL,
  cantidad_devuelta NUMERIC(14,2) NOT NULL DEFAULT 0,
  motivo_item TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  lote VARCHAR(80),
  fecha_expiracion DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rma_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_items_select_rls') THEN
    CREATE POLICY rma_items_select_rls ON rma_items FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_items_insert_rls') THEN
    CREATE POLICY rma_items_insert_rls ON rma_items FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_items_update_rls') THEN
    CREATE POLICY rma_items_update_rls ON rma_items FOR UPDATE USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rma_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  rma_id UUID NOT NULL REFERENCES rma_solicitudes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,
  descripcion TEXT,
  actor_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rma_eventos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_eventos_select_rls') THEN
    CREATE POLICY rma_eventos_select_rls ON rma_eventos FOR SELECT USING (tenant_id = app.current_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rma_eventos_insert_rls') THEN
    CREATE POLICY rma_eventos_insert_rls ON rma_eventos FOR INSERT WITH CHECK (tenant_id = app.current_tenant_id());
  END IF;
END $$;

-- =============================================
-- Funciones auxiliares para multialmacén y RMA
-- =============================================
CREATE OR REPLACE FUNCTION registrar_movimiento_almacen(
  p_producto_id UUID,
  p_almacen_id UUID,
  p_tipo TEXT,
  p_cantidad NUMERIC,
  p_referencia_tipo TEXT,
  p_referencia_id UUID,
  p_notas TEXT DEFAULT NULL,
  p_ubicacion_id UUID DEFAULT NULL,
  p_lote TEXT DEFAULT NULL,
  p_fecha_expiracion DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := app.current_tenant_id();
  v_existencia_id UUID;
BEGIN
  IF p_producto_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Producto y almacén son obligatorios';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida: %', p_cantidad;
  END IF;

  SELECT id INTO v_existencia_id
  FROM producto_existencias
  WHERE tenant_id = v_tenant
    AND producto_id = p_producto_id
    AND almacen_id = p_almacen_id
    AND ubicacion_norm = COALESCE(p_ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND lote_norm = COALESCE(p_lote, '')
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO producto_existencias(
      tenant_id, producto_id, almacen_id, ubicacion_id, lote,
      fecha_expiracion, stock_actual, stock_reservado, stock_danado
    ) VALUES (
      v_tenant, p_producto_id, p_almacen_id, p_ubicacion_id, p_lote,
      p_fecha_expiracion, 0, 0, 0
    )
    RETURNING id INTO v_existencia_id;
  ELSE
    UPDATE producto_existencias
    SET fecha_expiracion = COALESCE(p_fecha_expiracion, fecha_expiracion),
        updated_at = NOW()
    WHERE id = v_existencia_id;
  END IF;

  IF p_tipo = 'ENTRADA' THEN
    UPDATE producto_existencias
    SET stock_actual = stock_actual + p_cantidad,
        updated_at = NOW()
    WHERE id = v_existencia_id;
  ELSIF p_tipo = 'SALIDA' THEN
    UPDATE producto_existencias
    SET stock_actual = GREATEST(stock_actual - p_cantidad, 0),
        updated_at = NOW()
    WHERE id = v_existencia_id;
  ELSIF p_tipo = 'RESERVA' THEN
    UPDATE producto_existencias
    SET stock_reservado = stock_reservado + p_cantidad,
        updated_at = NOW()
    WHERE id = v_existencia_id;
  ELSIF p_tipo = 'LIBERACION' THEN
    UPDATE producto_existencias
    SET stock_reservado = GREATEST(stock_reservado - p_cantidad, 0),
        updated_at = NOW()
    WHERE id = v_existencia_id;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no soportado: %', p_tipo;
  END IF;

  UPDATE productos p
  SET stock_actual = COALESCE(t.stock_actual, 0),
      stock_reservado = COALESCE(t.stock_reservado, 0),
      updated_at = NOW()
  FROM (
    SELECT producto_id,
           SUM(stock_actual) AS stock_actual,
           SUM(stock_reservado) AS stock_reservado
    FROM producto_existencias
    WHERE tenant_id = v_tenant
      AND producto_id = p_producto_id
    GROUP BY producto_id
  ) AS t
  WHERE p.id = p_producto_id
    AND p.tenant_id = v_tenant;

  INSERT INTO movimientos_inventario (
    tenant_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, created_by
  ) VALUES (
    v_tenant, p_producto_id, p_tipo, p_cantidad, p_referencia_tipo, p_referencia_id, p_notas, NOW(), NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION rma_retorno_inventario(
  p_rma_item_id UUID,
  p_cantidad NUMERIC,
  p_almacen_id UUID,
  p_ubicacion_id UUID DEFAULT NULL,
  p_lote TEXT DEFAULT NULL,
  p_fecha_expiracion DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant UUID := app.current_tenant_id();
  v_rma RECORD;
BEGIN
  SELECT ri.id, ri.rma_id, ri.producto_id, rs.pedido_id
  INTO v_rma
  FROM rma_items ri
  JOIN rma_solicitudes rs ON rs.id = ri.rma_id
  WHERE ri.id = p_rma_item_id
    AND ri.tenant_id = v_tenant
    AND rs.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RMA item % no encontrado para el tenant actual', p_rma_item_id;
  END IF;

  PERFORM registrar_movimiento_almacen(
    v_rma.producto_id,
    p_almacen_id,
    'ENTRADA',
    p_cantidad,
    'RMA',
    v_rma.rma_id,
    'Retorno RMA',
    p_ubicacion_id,
    p_lote,
    p_fecha_expiracion
  );

  UPDATE rma_items
  SET cantidad_devuelta = LEAST(cantidad_autorizada, cantidad_devuelta + p_cantidad),
      estado = CASE WHEN cantidad_devuelta + p_cantidad >= cantidad_autorizada THEN 'CERRADO' ELSE 'PARCIAL' END,
      updated_at = NOW()
  WHERE id = p_rma_item_id;

  INSERT INTO rma_eventos(tenant_id, rma_id, tipo, descripcion, metadata)
  VALUES (v_tenant, v_rma.rma_id, 'RETORNO_INVENTARIO', 'Ingreso de stock por RMA', jsonb_build_object('rma_item_id', p_rma_item_id, 'cantidad', p_cantidad));
END;
$$;

-- =============================================
-- Extensión de tablas existentes para multialmacén/RMA
-- =============================================
ALTER TABLE pedido_despachos
  ADD COLUMN IF NOT EXISTS almacen_id UUID REFERENCES almacenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ubicacion_id UUID REFERENCES almacen_ubicaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote VARCHAR(80);

ALTER TABLE pedido_backorders
  ADD COLUMN IF NOT EXISTS almacen_id UUID REFERENCES almacenes(id) ON DELETE SET NULL;

-- =============================================
-- Dashboards multi-tenant (OTIF y SUNAT)
-- =============================================
CREATE OR REPLACE VIEW v_otif_multialmacen AS
SELECT
  pv.tenant_id,
  pv.id AS pedido_id,
  pv.numero,
  pv.fecha_pedido AS fecha_pedido,
  COALESCE(SUM(pvd.cantidad), 0) AS cantidad_solicitada,
  COALESCE(SUM(pd.cantidad), 0) AS cantidad_despachada,
  MIN(pd.registrado_en) AS primera_salida,
  MAX(pd.registrado_en) AS ultima_salida,
  (SELECT pd2.almacen_id 
   FROM pedido_despachos pd2 
   WHERE pd2.pedido_id = pv.id 
   ORDER BY pd2.registrado_en DESC 
   LIMIT 1) AS ultimo_almacen_id,
  CASE
    WHEN COALESCE(SUM(pvd.cantidad), 0) = 0 THEN 0
    ELSE COALESCE(SUM(pd.cantidad), 0) / NULLIF(SUM(pvd.cantidad), 0)
  END AS fill_rate
FROM pedidos_venta pv
LEFT JOIN pedidos_venta_detalle pvd ON pvd.pedido_id = pv.id
LEFT JOIN pedido_despachos pd ON pd.pedido_id = pv.id
GROUP BY pv.tenant_id, pv.id, pv.fecha_pedido;

CREATE OR REPLACE VIEW v_kpis_sunat_multitenant AS
SELECT
  d.tenant_id,
  date_trunc('day', d.fecha_emision) AS periodo,
  COUNT(*) FILTER (WHERE d.estado = 'ACEPTADO') AS aceptados,
  COUNT(*) FILTER (WHERE d.estado = 'OBSERVADO') AS observados,
  COUNT(*) FILTER (WHERE d.estado = 'RECHAZADO') AS rechazados,
  COUNT(*) FILTER (WHERE d.estado NOT IN ('ACEPTADO','OBSERVADO','RECHAZADO')) AS pendientes,
  COUNT(*) AS total
FROM documentos d
WHERE d.tipo_documento IN ('FACTURA','BOLETA','NOTA_CREDITO')
GROUP BY d.tenant_id, date_trunc('day', d.fecha_emision);

COMMIT;
