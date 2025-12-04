-- 158__cortes_caja.sql
-- Tabla de cortes / reportes de cierre de caja (corte Z) por sesión y tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cortes_caja (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  sesion_caja_id uuid NOT NULL,
  caja_id uuid,
  fecha_corte timestamptz NOT NULL DEFAULT now(),
  cajero_id uuid,
  moneda varchar(10) DEFAULT 'PEN',
  total_ventas numeric(18,2) DEFAULT 0,
  total_impuestos numeric(18,2) DEFAULT 0,
  total_neto numeric(18,2) DEFAULT 0,
  total_documentos integer DEFAULT 0,
  resumen_metodos_pago jsonb,
  resumen_fiscal jsonb,
  integridad_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cortes_caja_tenant_idx ON public.cortes_caja(tenant_id);
CREATE INDEX IF NOT EXISTS cortes_caja_sesion_idx ON public.cortes_caja(sesion_caja_id);
CREATE INDEX IF NOT EXISTS cortes_caja_fecha_idx ON public.cortes_caja(fecha_corte);

ALTER TABLE public.cortes_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cortes_caja_tenant_read ON public.cortes_caja;
CREATE POLICY cortes_caja_tenant_read ON public.cortes_caja
  FOR SELECT USING (
    tenant_id = auth.uid()
    OR tenant_id = ((current_setting('request.jwt.claims', true))::json->>'tenant_id')::uuid
  );

DROP POLICY IF EXISTS cortes_caja_tenant_write ON public.cortes_caja;
CREATE POLICY cortes_caja_tenant_write ON public.cortes_caja
  FOR INSERT WITH CHECK (
    tenant_id = auth.uid()
    OR tenant_id = ((current_setting('request.jwt.claims', true))::json->>'tenant_id')::uuid
  );

DROP POLICY IF EXISTS cortes_caja_tenant_update ON public.cortes_caja;
CREATE POLICY cortes_caja_tenant_update ON public.cortes_caja
  FOR UPDATE USING (
    tenant_id = auth.uid()
    OR tenant_id = ((current_setting('request.jwt.claims', true))::json->>'tenant_id')::uuid
  );

COMMENT ON TABLE public.cortes_caja IS 'Cortes (cierre diario/turno) generados desde POS. Guarda totales por método de pago y resumen fiscal.';

COMMIT;
