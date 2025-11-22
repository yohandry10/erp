-- Quita el IGV hardcodeado (18%) en compras y lo calcula con configuracion_fiscal por país
-- con fallback seguro a 18% cuando no haya configuración.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.obtener_impuesto_principal_porcentaje(p_tenant_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_rate numeric := 0.18; -- fallback
BEGIN
  -- Si existe tabla tenants/pais, usar configuracion_fiscal
  IF to_regclass('public.tenants') IS NOT NULL THEN
    SELECT cf.impuesto_principal_porcentaje
    INTO v_rate
    FROM tenants t
    JOIN configuracion_fiscal cf ON cf.pais_id = t.pais_id
    WHERE t.id = p_tenant_id
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_rate, 0.18);
END;
$$;

-- Cotizaciones de compra
CREATE OR REPLACE FUNCTION calcular_totales_cotizacion_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal numeric := 0;
  v_impuesto_rate numeric := 0.18;
  v_impuesto numeric := 0;
  v_total numeric := 0;
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM cotizaciones_compra
  WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id)
  LIMIT 1;

  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_subtotal
  FROM cotizacion_compra_detalles
  WHERE cotizacion_id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  v_impuesto_rate := app.obtener_impuesto_principal_porcentaje(v_tenant);
  v_impuesto := ROUND(v_subtotal * v_impuesto_rate, 2);
  v_total := ROUND(v_subtotal + v_impuesto, 2);

  UPDATE cotizaciones_compra
  SET
    subtotal = v_subtotal,
    igv = v_impuesto,
    total = v_total,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Órdenes de compra
CREATE OR REPLACE FUNCTION calcular_totales_orden_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal numeric := 0;
  v_impuesto_rate numeric := 0.18;
  v_impuesto numeric := 0;
  v_total numeric := 0;
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM ordenes_compra
  WHERE id = COALESCE(NEW.orden_id, OLD.orden_id)
  LIMIT 1;

  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_subtotal
  FROM orden_compra_detalles
  WHERE orden_id = COALESCE(NEW.orden_id, OLD.orden_id);

  v_impuesto_rate := app.obtener_impuesto_principal_porcentaje(v_tenant);
  v_impuesto := ROUND(v_subtotal * v_impuesto_rate, 2);
  v_total := ROUND(v_subtotal + v_impuesto, 2);

  UPDATE ordenes_compra
  SET
    subtotal = v_subtotal,
    igv = v_impuesto,
    total = v_total,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.orden_id, OLD.orden_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Devoluciones a proveedor
CREATE OR REPLACE FUNCTION calcular_totales_devolucion_proveedor()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal numeric := 0;
  v_impuesto_rate numeric := 0.18;
  v_impuesto numeric := 0;
  v_total numeric := 0;
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM devoluciones_proveedor
  WHERE id = COALESCE(NEW.devolucion_id, OLD.devolucion_id)
  LIMIT 1;

  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_subtotal
  FROM devolucion_items
  WHERE devolucion_id = COALESCE(NEW.devolucion_id, OLD.devolucion_id);

  v_impuesto_rate := app.obtener_impuesto_principal_porcentaje(v_tenant);
  v_impuesto := ROUND(v_subtotal * v_impuesto_rate, 2);
  v_total := ROUND(v_subtotal + v_impuesto, 2);

  UPDATE devoluciones_proveedor
  SET
    subtotal = v_subtotal,
    igv = v_impuesto,
    total = v_total,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.devolucion_id, OLD.devolucion_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
