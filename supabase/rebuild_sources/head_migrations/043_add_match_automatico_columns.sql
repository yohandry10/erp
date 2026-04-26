    -- =====================================================
    -- Migration: 043_add_match_automatico_columns
    -- Description: Add match_automatico and match_id columns to movimientos_bancarios
    --              to track automatic vs manual matches in bank reconciliation
    -- Date: 2024-01-26
    -- =====================================================

    -- Add match_automatico column to track if the match was automatic or manual
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN IF NOT EXISTS match_automatico BOOLEAN DEFAULT false;

    -- Add match_id column to reference the matched movement
    ALTER TABLE movimientos_bancarios 
    ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES movimientos_bancarios(id) ON DELETE SET NULL;

    -- Add comments
    COMMENT ON COLUMN movimientos_bancarios.match_automatico IS 'Indica si el match fue realizado automáticamente (true) o manualmente (false)';
    COMMENT ON COLUMN movimientos_bancarios.match_id IS 'ID del movimiento con el que está matcheado (sistema ↔ extracto)';

    -- Create index for match_id to improve query performance
    CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_match_id ON movimientos_bancarios(match_id);

    -- Create index for match_automatico to filter automatic matches
    CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_match_automatico ON movimientos_bancarios(tenant_id, match_automatico) WHERE match_automatico = true;

    -- Update existing conciliated movements to have match_automatico = false (manual matches)
    -- This ensures backward compatibility with existing data
    UPDATE movimientos_bancarios 
    SET match_automatico = false 
    WHERE conciliado = true AND match_automatico IS NULL;
