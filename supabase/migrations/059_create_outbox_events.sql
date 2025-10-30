-- ============================================
-- MIGRACIÓN: Adaptar tabla outbox_events existente
-- ============================================
-- La tabla outbox_events ya existe con una estructura diferente.
-- Esta migración agrega las columnas necesarias para multi-tenancy
-- y funcionalidades de reintentos con backoff exponencial
-- ============================================

-- Agregar columnas faltantes si no existen
DO $$ 
BEGIN
  -- Agregar tenant_id si no existe (lo almacenaremos en event_data también para compatibilidad)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbox_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE outbox_events ADD COLUMN tenant_id UUID;
    -- Crear índice para tenant_id
    CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_id ON outbox_events(tenant_id);
  END IF;

  -- Agregar max_retries si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbox_events' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE outbox_events ADD COLUMN max_retries INTEGER DEFAULT 5;
  END IF;

  -- Agregar next_retry_at si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbox_events' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE outbox_events ADD COLUMN next_retry_at TIMESTAMPTZ;
  END IF;

  -- Agregar updated_at si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbox_events' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE outbox_events ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Asegurar que status tenga valores por defecto correctos
  -- La tabla ya tiene status, solo actualizamos valores NULL si existen
  UPDATE outbox_events SET status = 'PENDING' WHERE status IS NULL;
END $$;

-- Índices para mejorar performance (crear si no existen)
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_retry ON outbox_events(status, next_retry_at) 
  WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_outbox_events_created_at ON outbox_events(created_at DESC);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_outbox_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS trigger_update_outbox_events_updated_at ON outbox_events;
CREATE TRIGGER trigger_update_outbox_events_updated_at
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW
  EXECUTE FUNCTION update_outbox_events_updated_at();

-- RLS: usuarios solo ven eventos de su tenant (si tenant_id existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'outbox_events' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

    -- Eliminar políticas existentes si las hay
    DROP POLICY IF EXISTS "Users can only see outbox events from their tenant" ON outbox_events;
    DROP POLICY IF EXISTS "Users can only insert outbox events for their tenant" ON outbox_events;
    DROP POLICY IF EXISTS "Users can only update outbox events from their tenant" ON outbox_events;

    CREATE POLICY "Users can only see outbox events from their tenant"
      ON outbox_events
      FOR SELECT
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
        OR EXISTS (
          SELECT 1 FROM usuarios_sistema 
          WHERE id = current_setting('app.current_user_id', true)::UUID
          AND is_super_admin = true
        )
      );

    CREATE POLICY "Users can only insert outbox events for their tenant"
      ON outbox_events
      FOR INSERT
      WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
      );

    CREATE POLICY "Users can only update outbox events from their tenant"
      ON outbox_events
      FOR UPDATE
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::UUID
        OR EXISTS (
          SELECT 1 FROM usuarios_sistema 
          WHERE id = current_setting('app.current_user_id', true)::UUID
          AND is_super_admin = true
        )
      );
  END IF;
END $$;

-- Función para obtener eventos pendientes para procesar (adaptada a estructura existente)
CREATE OR REPLACE FUNCTION get_pending_outbox_events(
  p_limit INTEGER DEFAULT 100,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  event_type VARCHAR,
  event_data JSONB,
  retry_count INTEGER,
  max_retries INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oe.id,
    oe.tenant_id,
    oe.event_type,
    oe.event_data,
    COALESCE(oe.retry_count, 0)::INTEGER as retry_count,
    COALESCE(oe.max_retries, 5)::INTEGER as max_retries
  FROM outbox_events oe
  WHERE 
    COALESCE(oe.status, 'PENDING') = 'PENDING'
    AND (oe.processed_at IS NULL)
    AND (oe.next_retry_at IS NULL OR oe.next_retry_at <= NOW())
    AND (p_tenant_id IS NULL OR oe.tenant_id = p_tenant_id OR (oe.event_data->>'tenantId')::UUID = p_tenant_id)
  ORDER BY oe.created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED; -- Evita procesamiento duplicado
END;
$$ LANGUAGE plpgsql;

-- Función para marcar evento como procesando
CREATE OR REPLACE FUNCTION mark_outbox_event_processing(p_event_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE outbox_events
  SET 
    status = 'PROCESSING',
    updated_at = COALESCE(updated_at, NOW())
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Función para marcar evento como completado
CREATE OR REPLACE FUNCTION mark_outbox_event_completed(p_event_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE outbox_events
  SET 
    status = 'COMPLETED',
    processed_at = NOW(),
    updated_at = COALESCE(updated_at, NOW())
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Función para marcar evento como fallido y programar reintento
CREATE OR REPLACE FUNCTION mark_outbox_event_failed(
  p_event_id UUID,
  p_error_message TEXT
)
RETURNS VOID AS $$
DECLARE
  v_retry_count INTEGER;
  v_max_retries INTEGER;
  v_next_retry_at TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(retry_count, 0), COALESCE(max_retries, 5) 
  INTO v_retry_count, v_max_retries
  FROM outbox_events
  WHERE id = p_event_id;

  IF v_retry_count >= v_max_retries THEN
    -- Máximo de reintentos alcanzado, marcar como fallido permanentemente
    UPDATE outbox_events
    SET 
      status = 'FAILED',
      error_message = p_error_message,
      updated_at = COALESCE(updated_at, NOW())
    WHERE id = p_event_id;
  ELSE
    -- Programar siguiente reintento con backoff exponencial
    v_next_retry_at := NOW() + (INTERVAL '1 minute' * POWER(2, v_retry_count)); -- 1min, 2min, 4min, 8min, 16min
    
    UPDATE outbox_events
    SET 
      status = 'PENDING',
      retry_count = COALESCE(retry_count, 0) + 1,
      error_message = p_error_message,
      next_retry_at = v_next_retry_at,
      updated_at = COALESCE(updated_at, NOW())
    WHERE id = p_event_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE outbox_events IS 'Tabla para persistir eventos antes de procesarlos (Outbox Pattern). Garantiza entrega atómica de eventos.';
COMMENT ON FUNCTION get_pending_outbox_events IS 'Obtiene eventos pendientes para procesar, usando SKIP LOCKED para evitar procesamiento duplicado.';
COMMENT ON FUNCTION mark_outbox_event_processing IS 'Marca un evento como en procesamiento.';
COMMENT ON FUNCTION mark_outbox_event_completed IS 'Marca un evento como completado exitosamente.';
COMMENT ON FUNCTION mark_outbox_event_failed IS 'Marca un evento como fallido y programa reintento con backoff exponencial.';

