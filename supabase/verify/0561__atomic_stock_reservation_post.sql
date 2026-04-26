-- =====================================================
-- MIGRACIÓN 0561: Post-setup de reservar_stock_atomico (grants/verificación/audit)
-- =====================================================
-- Nota: separada de 056 para evitar que Supabase CLI agrupe múltiples comandos
--       junto a CREATE FUNCTION en un único prepared statement.
-- =====================================================

-- Este archivo se ejecuta manualmente contra la BD local una vez que `npx supabase start` esté arriba.
-- (El Supabase CLI falla si intenta aplicar múltiples statements durante migraciones.)

COMMENT ON FUNCTION reservar_stock_atomico(UUID, NUMERIC, TEXT, TEXT, TEXT) IS
  'Reserva stock de forma atómica con locks (FOR UPDATE) para prevenir race conditions. CRÍTICO para producción.';

GRANT EXECUTE ON FUNCTION reservar_stock_atomico(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO audit_log (
  table_name,
  operation,
  record_id,
  new_values,
  user_id,
  tenant_id,
  metadata,
  timestamp
) VALUES (
  'system_migrations',
  'STOCK_ATOMIC_RESERVATION',
  gen_random_uuid(),
  jsonb_build_object(
    'migration', '056_atomic_stock_reservation',
    'function_created', 'reservar_stock_atomico',
    'priority', 'CRITICAL',
    'task', 'C1 - Reserva de stock atómica y concurrente',
    'sprint', 'Sprint 3 - Ventas e Inventario',
    'features', jsonb_build_array(
      'FOR UPDATE lock',
      'Validación de stock disponible',
      'Operación atómica',
      'Inserción de movimiento'
    )
  ),
  NULL,
  NULL,
  jsonb_build_object(
    'action', 'CREATE_ATOMIC_STOCK_RESERVATION',
    'compliance', 'PRODUCTION_BLOCKER_RESOLVED',
    'security_impact', 'HIGH',
    'concurrency_safety', 'CRITICAL'
  ),
  NOW()
);
