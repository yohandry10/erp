-- Migration 014: Tabla de relación pedidos - GRE (multi-GRE por pedido)

BEGIN;

CREATE TABLE IF NOT EXISTS pedido_gres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  gre_id UUID NOT NULL REFERENCES gre_guias(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  creado_por UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notas TEXT
);

ALTER TABLE pedido_gres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_gres_rls ON pedido_gres;
CREATE POLICY pedido_gres_rls
  ON pedido_gres
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_gres_unique
  ON pedido_gres(pedido_id, gre_id);

CREATE INDEX IF NOT EXISTS idx_pedido_gres_pedido
  ON pedido_gres(pedido_id);

COMMENT ON TABLE pedido_gres IS 'Relación entre pedidos de venta y guías de remisión asociadas';
COMMENT ON COLUMN pedido_gres.estado IS 'Estado operativo de la GRE sincronizado con gre_guias.estado';

COMMIT;
