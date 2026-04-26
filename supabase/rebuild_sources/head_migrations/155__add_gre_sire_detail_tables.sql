-- Crea tablas faltantes para GRE y SIRE con RLS por tenant.
-- Incluye enlace pedido_gres para trazabilidad pedido↔GRE.

-- =========================================================
-- Tabla: gre_detalles (líneas de la GRE)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.gre_detalles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  gre_id UUID NOT NULL REFERENCES public.gre_guias(id) ON DELETE CASCADE,
  item INTEGER NOT NULL DEFAULT 1,
  descripcion TEXT NOT NULL,
  unidad_medida VARCHAR(10) DEFAULT 'NIU',
  cantidad NUMERIC NOT NULL,
  peso NUMERIC,
  producto_id UUID,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gre_detalles_tenant_idx ON public.gre_detalles (tenant_id);
CREATE INDEX IF NOT EXISTS gre_detalles_gre_idx ON public.gre_detalles (gre_id);

ALTER TABLE public.gre_detalles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gre_detalles_tenant_isolation ON public.gre_detalles;
CREATE POLICY gre_detalles_tenant_isolation
  ON public.gre_detalles
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

COMMENT ON TABLE public.gre_detalles IS 'Detalle de ítems de la Guía de Remisión Electrónica (GRE) por tenant.';
COMMENT ON COLUMN public.gre_detalles.tenant_id IS 'Tenant owner; RLS aplica.';

-- =========================================================
-- Tabla: pedido_gres (relación pedido ↔ GRE)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.pedido_gres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES public.pedidos_venta(id) ON DELETE CASCADE,
  gre_id UUID NOT NULL REFERENCES public.gre_guias(id) ON DELETE CASCADE,
  estado VARCHAR(50) DEFAULT 'RELACIONADO',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pedido_gres_unique
  ON public.pedido_gres (tenant_id, pedido_id, gre_id);
CREATE INDEX IF NOT EXISTS pedido_gres_tenant_idx ON public.pedido_gres (tenant_id);

ALTER TABLE public.pedido_gres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_gres_tenant_isolation ON public.pedido_gres;
CREATE POLICY pedido_gres_tenant_isolation
  ON public.pedido_gres
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

COMMENT ON TABLE public.pedido_gres IS 'Enlace entre pedidos de venta y GRE emitidas para ellos (multi-tenant).';

-- =========================================================
-- Tabla: sire_registros_detalle (detalle de registros SIRE)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sire_registros_detalle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sire_file_id UUID NOT NULL REFERENCES public.sire_files(id) ON DELETE CASCADE,
  cpe_id UUID,
  documento_id UUID,
  tipo_documento VARCHAR(10),
  serie VARCHAR(10),
  numero VARCHAR(20),
  fecha_emision DATE,
  ruc_emisor VARCHAR(20),
  ruc_receptor VARCHAR(20),
  razon_social_receptor TEXT,
  total NUMERIC,
  igv NUMERIC,
  moneda VARCHAR(3),
  estado VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sire_registros_detalle_tenant_idx ON public.sire_registros_detalle (tenant_id);
CREATE INDEX IF NOT EXISTS sire_registros_detalle_file_idx ON public.sire_registros_detalle (sire_file_id);

ALTER TABLE public.sire_registros_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sire_registros_detalle_tenant_isolation ON public.sire_registros_detalle;
CREATE POLICY sire_registros_detalle_tenant_isolation
  ON public.sire_registros_detalle
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

COMMENT ON TABLE public.sire_registros_detalle IS 'Detalle de líneas de archivos SIRE (ventas/compras) por tenant.';

-- =========================================================
-- RLS hardening existente: gre_guias y sire_files
-- (redeclara políticas para asegurar tenant_id en USING/WITH CHECK)
-- =========================================================
ALTER TABLE public.gre_guias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gre_guias_policy ON public.gre_guias;
CREATE POLICY gre_guias_policy
  ON public.gre_guias
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

ALTER TABLE public.sire_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sire_files_tenant_isolation ON public.sire_files;
CREATE POLICY sire_files_tenant_isolation
  ON public.sire_files
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());
