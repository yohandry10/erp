-- Migration 015: Configuración P3 (RMA, multialmacén y dashboards)
-- Fecha: 2025-10-21
-- Descripción: Agrega campos de configuración multi-tenant para el roadmap P3 del módulo Ventas

DO $$
BEGIN
  -- ==========================
  -- Configuración de RMA
  -- ==========================
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'habilitar_rma'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN habilitar_rma BOOLEAN DEFAULT false NOT NULL;

    RAISE NOTICE 'Campo habilitar_rma agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'dias_maximos_rma'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN dias_maximos_rma INTEGER DEFAULT 30 NOT NULL;
    RAISE NOTICE 'Campo dias_maximos_rma agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'rma_requiere_control_calidad'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN rma_requiere_control_calidad BOOLEAN DEFAULT true NOT NULL;
    RAISE NOTICE 'Campo rma_requiere_control_calidad agregado';
  END IF;

  -- Configuración multialmacén / FEFO
  -- ==========================
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'habilitar_multialmacen'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN habilitar_multialmacen BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Campo habilitar_multialmacen agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'requiere_ubicaciones_inventario'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN requiere_ubicaciones_inventario BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Campo requiere_ubicaciones_inventario agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'requiere_lotes_series'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN requiere_lotes_series BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Campo requiere_lotes_series agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'politica_rotacion_inventario'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN politica_rotacion_inventario VARCHAR(10) DEFAULT 'FIFO' NOT NULL
      CHECK (politica_rotacion_inventario IN ('FIFO', 'FEFO'));

    RAISE NOTICE 'Campo politica_rotacion_inventario agregado';
  END IF;

  -- Dashboards SUNAT / OTIF
  -- ==========================
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'habilitar_dashboards_sunat'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN habilitar_dashboards_sunat BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Campo habilitar_dashboards_sunat agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'habilitar_dashboards_otif'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN habilitar_dashboards_otif BOOLEAN DEFAULT false NOT NULL;
    RAISE NOTICE 'Campo habilitar_dashboards_otif agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'objetivo_otif'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN objetivo_otif NUMERIC(5,2) DEFAULT 95.00 NOT NULL;
    RAISE NOTICE 'Campo objetivo_otif agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresa_config' AND column_name = 'frecuencia_actualizacion_dashboards'
  ) THEN
    ALTER TABLE empresa_config
    ADD COLUMN frecuencia_actualizacion_dashboards INTEGER DEFAULT 60 NOT NULL;
    RAISE NOTICE 'Campo frecuencia_actualizacion_dashboards agregado';
  END IF;
END $$;

-- Comentarios descriptivos
COMMENT ON COLUMN empresa_config.habilitar_rma IS 'Si true, habilita el flujo de devoluciones (RMA) con retorno físico a inventario.';
COMMENT ON COLUMN empresa_config.dias_maximos_rma IS 'Cantidad máxima de días desde la venta para aceptar una solicitud RMA.';
COMMENT ON COLUMN empresa_config.rma_requiere_control_calidad IS 'Si true, requiere control de calidad antes de reincorporar stock devuelto.';

COMMENT ON COLUMN empresa_config.habilitar_multialmacen IS 'Si true, habilita la gestión de múltiples almacenes por tenant.';
COMMENT ON COLUMN empresa_config.requiere_ubicaciones_inventario IS 'Si true, exige registrar ubicaciones/pasillos en los almacenes.';
COMMENT ON COLUMN empresa_config.requiere_lotes_series IS 'Si true, exige control de lotes/series y compatibilidad FEFO.';
COMMENT ON COLUMN empresa_config.politica_rotacion_inventario IS 'Política de rotación aplicada al despacho de inventario (FIFO o FEFO).';

COMMENT ON COLUMN empresa_config.habilitar_dashboards_sunat IS 'Si true, expone dashboards multi-tenant con KPIs de cumplimiento SUNAT.';
COMMENT ON COLUMN empresa_config.habilitar_dashboards_otif IS 'Si true, habilita paneles OTIF (On-Time, In-Full) para monitorear entregas.';
COMMENT ON COLUMN empresa_config.objetivo_otif IS 'Porcentaje objetivo OTIF definido por el tenant.';
COMMENT ON COLUMN empresa_config.frecuencia_actualizacion_dashboards IS 'Frecuencia (en minutos) para actualizar datasets de dashboards SUNAT/OTIF.';
