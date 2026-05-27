-- RRH-A4: Prevent TOCTOU race condition on caja session opening.
-- Only one ABIERTA session per caja per tenant at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesiones_caja_abierta
  ON sesiones_caja (tenant_id, caja_id)
  WHERE estado = 'ABIERTA';

-- Only one ABIERTA session per cajero per tenant at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesiones_caja_cajero_abierta
  ON sesiones_caja (tenant_id, cajero_id)
  WHERE estado = 'ABIERTA';
