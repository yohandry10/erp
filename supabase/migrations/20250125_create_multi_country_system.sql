-- =====================================================
-- MIGRACIÓN: Sistema Multi-País (SUNAT/DIAN)
-- Fecha: 2025-01-25
-- Descripción: Implementa configuración por país para Peru (SUNAT) y Colombia (DIAN)
-- =====================================================

-- 1. Tabla de países soportados
CREATE TABLE IF NOT EXISTS public.paises (
    id SERIAL PRIMARY KEY,
    codigo_iso VARCHAR(2) NOT NULL UNIQUE, -- PE, CO
    nombre VARCHAR(100) NOT NULL,
    nombre_fiscal VARCHAR(100) NOT NULL, -- SUNAT, DIAN
    moneda_codigo VARCHAR(3) NOT NULL, -- PEN, COP
    moneda_simbolo VARCHAR(5) NOT NULL, -- S/, $
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Configuración fiscal por país
CREATE TABLE IF NOT EXISTS public.configuracion_fiscal (
    id SERIAL PRIMARY KEY,
    pais_id INTEGER NOT NULL REFERENCES public.paises(id),
    
    -- Configuración de impuestos
    impuesto_principal_nombre VARCHAR(50) NOT NULL, -- IGV, IVA
    impuesto_principal_porcentaje DECIMAL(5,2) NOT NULL, -- 18.00, 19.00
    
    -- Configuración de retenciones
    retencion_renta_porcentaje DECIMAL(5,2),
    retencion_iva_porcentaje DECIMAL(5,2),
    
    -- Configuración de documentos
    documento_identidad_empresa VARCHAR(20) NOT NULL, -- RUC, NIT
    longitud_documento_empresa INTEGER NOT NULL, -- 11, 9
    
    -- Configuración de libros contables requeridos
    requiere_libro_diario BOOLEAN DEFAULT true,
    requiere_libro_mayor BOOLEAN DEFAULT true,
    requiere_libro_inventarios BOOLEAN DEFAULT true,
    requiere_libro_compras BOOLEAN DEFAULT true,
    requiere_libro_ventas BOOLEAN DEFAULT true,
    requiere_kardex_valorizado BOOLEAN DEFAULT true,
    requiere_libro_mayor_balances BOOLEAN DEFAULT false, -- Solo DIAN
    requiere_libros_societarios BOOLEAN DEFAULT false, -- Solo DIAN
    
    -- Configuración de reportes
    formato_fecha VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    separador_decimal VARCHAR(1) DEFAULT '.',
    separador_miles VARCHAR(1) DEFAULT ',',
    
    -- URLs de servicios fiscales
    url_webservice_principal TEXT,
    url_webservice_secundario TEXT,
    
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Agregar columna país a empresa_config
ALTER TABLE public.empresa_config 
ADD COLUMN IF NOT EXISTS pais_id INTEGER REFERENCES public.paises(id);

-- 4. Configuración de usuario para país preferido (CORREGIDO: UUID en lugar de INTEGER)
CREATE TABLE IF NOT EXISTS public.usuario_configuracion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios_sistema(id),
    pais_preferido_id INTEGER REFERENCES public.paises(id),
    idioma VARCHAR(5) DEFAULT 'es',
    zona_horaria VARCHAR(50) DEFAULT 'America/Lima',
    formato_fecha VARCHAR(20),
    formato_moneda VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(usuario_id)
);

-- 5. Insertar datos iniciales de países
INSERT INTO public.paises (codigo_iso, nombre, nombre_fiscal, moneda_codigo, moneda_simbolo) VALUES
('PE', 'Perú', 'SUNAT', 'PEN', 'S/'),
('CO', 'Colombia', 'DIAN', 'COP', '$')
ON CONFLICT (codigo_iso) DO NOTHING;

-- 6. Insertar configuración fiscal para Perú (SUNAT)
INSERT INTO public.configuracion_fiscal (
    pais_id,
    impuesto_principal_nombre,
    impuesto_principal_porcentaje,
    retencion_renta_porcentaje,
    documento_identidad_empresa,
    longitud_documento_empresa,
    requiere_libro_diario,
    requiere_libro_mayor,
    requiere_libro_inventarios,
    requiere_libro_compras,
    requiere_libro_ventas,
    requiere_kardex_valorizado,
    requiere_libro_mayor_balances,
    requiere_libros_societarios,
    formato_fecha,
    url_webservice_principal
) VALUES (
    (SELECT id FROM public.paises WHERE codigo_iso = 'PE'),
    'IGV',
    18.00,
    3.00,
    'RUC',
    11,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    'DD/MM/YYYY',
    'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'
);

-- 7. Insertar configuración fiscal para Colombia (DIAN)
INSERT INTO public.configuracion_fiscal (
    pais_id,
    impuesto_principal_nombre,
    impuesto_principal_porcentaje,
    retencion_renta_porcentaje,
    retencion_iva_porcentaje,
    documento_identidad_empresa,
    longitud_documento_empresa,
    requiere_libro_diario,
    requiere_libro_mayor,
    requiere_libro_inventarios,
    requiere_libro_compras,
    requiere_libro_ventas,
    requiere_kardex_valorizado,
    requiere_libro_mayor_balances,
    requiere_libros_societarios,
    formato_fecha,
    url_webservice_principal
) VALUES (
    (SELECT id FROM public.paises WHERE codigo_iso = 'CO'),
    'IVA',
    19.00,
    2.50,
    15.00,
    'NIT',
    9,
    true,
    true,
    true,
    true,
    true,
    true,
    true, -- DIAN requiere Libro Mayor y Balances consolidado
    true, -- DIAN requiere libros societarios
    'DD/MM/YYYY',
    'https://catalogo-vpfe.dian.gov.co/Document'
);

-- 8. Actualizar empresa_config existente con país por defecto (Perú)
UPDATE public.empresa_config 
SET pais_id = (SELECT id FROM public.paises WHERE codigo_iso = 'PE')
WHERE pais_id IS NULL;

-- 9. Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_pais ON public.configuracion_fiscal(pais_id);
CREATE INDEX IF NOT EXISTS idx_empresa_config_pais ON public.empresa_config(pais_id);
CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_usuario ON public.usuario_configuracion(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_pais ON public.usuario_configuracion(pais_preferido_id);

-- 10. Comentarios para documentación
COMMENT ON TABLE public.paises IS 'Países soportados por el sistema ERP';
COMMENT ON TABLE public.configuracion_fiscal IS 'Configuración fiscal específica por país (SUNAT/DIAN)';
COMMENT ON TABLE public.usuario_configuracion IS 'Configuración personalizada por usuario incluyendo país preferido';

COMMENT ON COLUMN public.configuracion_fiscal.impuesto_principal_nombre IS 'Nombre del impuesto principal (IGV para Perú, IVA para Colombia)';
COMMENT ON COLUMN public.configuracion_fiscal.requiere_libro_mayor_balances IS 'DIAN Colombia requiere Libro Mayor y Balances consolidado';
COMMENT ON COLUMN public.configuracion_fiscal.requiere_libros_societarios IS 'DIAN Colombia requiere Libro de Actas y Registro de Socios';

-- 11. Tabla de tipos de documentos fiscales por país
CREATE TABLE IF NOT EXISTS public.tipos_documentos_fiscales (
    id SERIAL PRIMARY KEY,
    pais_id INTEGER NOT NULL REFERENCES public.paises(id),
    codigo VARCHAR(10) NOT NULL, -- 01, 03, 07, 08, etc.
    nombre VARCHAR(100) NOT NULL, -- Factura, Boleta, Nota de Crédito, etc.
    descripcion TEXT,
    requiere_ruc BOOLEAN DEFAULT false,
    permite_exportacion BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pais_id, codigo)
);

-- 12. Tabla de tipos de impuestos por país
CREATE TABLE IF NOT EXISTS public.tipos_impuestos (
    id SERIAL PRIMARY KEY,
    pais_id INTEGER NOT NULL REFERENCES public.paises(id),
    codigo VARCHAR(10) NOT NULL, -- IGV, ISC, ICBPER, IVA, etc.
    nombre VARCHAR(100) NOT NULL,
    porcentaje DECIMAL(5,2) NOT NULL,
    tipo_calculo VARCHAR(20) DEFAULT 'porcentaje', -- porcentaje, fijo
    aplica_a VARCHAR(50) DEFAULT 'venta', -- venta, compra, ambos
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pais_id, codigo)
);

-- 13. Insertar tipos de documentos para Perú (SUNAT)
INSERT INTO public.tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion) VALUES
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '01', 'Factura', 'Factura electrónica', true, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '03', 'Boleta de Venta', 'Boleta de venta electrónica', false, false),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '07', 'Nota de Crédito', 'Nota de crédito electrónica', false, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '08', 'Nota de Débito', 'Nota de débito electrónica', false, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '09', 'Guía de Remisión', 'Guía de remisión electrónica', true, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), '20', 'Comprobante de Retención', 'Comprobante de retención electrónico', true, false)
ON CONFLICT (pais_id, codigo) DO NOTHING;

-- 14. Insertar tipos de documentos para Colombia (DIAN)
INSERT INTO public.tipos_documentos_fiscales (pais_id, codigo, nombre, descripcion, requiere_ruc, permite_exportacion) VALUES
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '01', 'Factura de Venta', 'Factura electrónica de venta', true, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '02', 'Factura de Exportación', 'Factura electrónica de exportación', true, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '03', 'Factura por Contingencia', 'Factura por contingencia del proveedor', true, false),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '91', 'Nota Crédito', 'Nota crédito electrónica', false, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '92', 'Nota Débito', 'Nota débito electrónica', false, true),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), '05', 'Documento Soporte', 'Documento soporte en adquisiciones', true, false)
ON CONFLICT (pais_id, codigo) DO NOTHING;

-- 15. Insertar tipos de impuestos para Perú (SUNAT)
INSERT INTO public.tipos_impuestos (pais_id, codigo, nombre, porcentaje, aplica_a) VALUES
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'IGV', 'Impuesto General a las Ventas', 18.00, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'ISC', 'Impuesto Selectivo al Consumo', 0.00, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'ICBPER', 'Impuesto a las Bolsas de Plástico', 0.50, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'EXO', 'Exonerado', 0.00, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'INA', 'Inafecto', 0.00, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'PE'), 'EXP', 'Exportación', 0.00, 'venta')
ON CONFLICT (pais_id, codigo) DO NOTHING;

-- 16. Insertar tipos de impuestos para Colombia (DIAN)
INSERT INTO public.tipos_impuestos (pais_id, codigo, nombre, porcentaje, aplica_a) VALUES
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'IVA', 'Impuesto al Valor Agregado', 19.00, 'ambos'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'IVA5', 'IVA Reducido', 5.00, 'ambos'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'INC', 'Impuesto Nacional al Consumo', 8.00, 'venta'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'RET', 'Retención en la Fuente', 2.50, 'compra'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'RETEIVA', 'Retención de IVA', 15.00, 'compra'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'EXE', 'Exento', 0.00, 'ambos'),
((SELECT id FROM public.paises WHERE codigo_iso = 'CO'), 'EXC', 'Excluido', 0.00, 'ambos')
ON CONFLICT (pais_id, codigo) DO NOTHING;

-- 17. Crear índices adicionales
CREATE INDEX IF NOT EXISTS idx_tipos_documentos_pais ON public.tipos_documentos_fiscales(pais_id);
CREATE INDEX IF NOT EXISTS idx_tipos_documentos_activo ON public.tipos_documentos_fiscales(activo);
CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_pais ON public.tipos_impuestos(pais_id);
CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_activo ON public.tipos_impuestos(activo);

-- 18. Comentarios adicionales
COMMENT ON TABLE public.tipos_documentos_fiscales IS 'Tipos de documentos fiscales disponibles por país';
COMMENT ON TABLE public.tipos_impuestos IS 'Tipos de impuestos y tasas aplicables por país';
COMMENT ON COLUMN public.tipos_documentos_fiscales.requiere_ruc IS 'Indica si el documento requiere RUC/NIT del cliente';
COMMENT ON COLUMN public.tipos_impuestos.tipo_calculo IS 'Tipo de cálculo: porcentaje o valor fijo';