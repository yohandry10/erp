    -- =============================================
    -- CREAR/ACTUALIZAR TABLA: empresa_config
    -- Fecha: 2025-10-15
    -- Descripción: Tabla de configuración de empresa
    -- =============================================

    -- Verificar y crear tabla si no existe
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'empresa_config') THEN
            CREATE TABLE public.empresa_config (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            RAISE NOTICE '✅ Tabla empresa_config creada';
        ELSE
            RAISE NOTICE '✅ Tabla empresa_config ya existe';
        END IF;
    END $$;

    -- Agregar columnas una por una si no existen
    DO $$
    BEGIN
        -- ruc
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'ruc') THEN
            ALTER TABLE public.empresa_config ADD COLUMN ruc VARCHAR(11);
            RAISE NOTICE '✅ Columna ruc agregada';
        END IF;
        
        -- razon_social
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'razon_social') THEN
            ALTER TABLE public.empresa_config ADD COLUMN razon_social VARCHAR(255);
            RAISE NOTICE '✅ Columna razon_social agregada';
        END IF;
        
        -- nombre_comercial
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'nombre_comercial') THEN
            ALTER TABLE public.empresa_config ADD COLUMN nombre_comercial VARCHAR(255);
            RAISE NOTICE '✅ Columna nombre_comercial agregada';
        END IF;
        
        -- direccion_fiscal
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'direccion_fiscal') THEN
            ALTER TABLE public.empresa_config ADD COLUMN direccion_fiscal TEXT;
            RAISE NOTICE '✅ Columna direccion_fiscal agregada';
        END IF;
        
        -- ubigeo
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'ubigeo') THEN
            ALTER TABLE public.empresa_config ADD COLUMN ubigeo VARCHAR(6);
            RAISE NOTICE '✅ Columna ubigeo agregada';
        END IF;
        
        -- departamento
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'departamento') THEN
            ALTER TABLE public.empresa_config ADD COLUMN departamento VARCHAR(50);
            RAISE NOTICE '✅ Columna departamento agregada';
        END IF;
        
        -- provincia
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'provincia') THEN
            ALTER TABLE public.empresa_config ADD COLUMN provincia VARCHAR(50);
            RAISE NOTICE '✅ Columna provincia agregada';
        END IF;
        
        -- distrito
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'distrito') THEN
            ALTER TABLE public.empresa_config ADD COLUMN distrito VARCHAR(50);
            RAISE NOTICE '✅ Columna distrito agregada';
        END IF;
        
        -- telefono
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'telefono') THEN
            ALTER TABLE public.empresa_config ADD COLUMN telefono VARCHAR(20);
            RAISE NOTICE '✅ Columna telefono agregada';
        END IF;
        
        -- email
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'email') THEN
            ALTER TABLE public.empresa_config ADD COLUMN email VARCHAR(100);
            RAISE NOTICE '✅ Columna email agregada';
        END IF;
        
        -- sitio_web
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'sitio_web') THEN
            ALTER TABLE public.empresa_config ADD COLUMN sitio_web VARCHAR(255);
            RAISE NOTICE '✅ Columna sitio_web agregada';
        END IF;
        
        -- representante_legal
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'representante_legal') THEN
            ALTER TABLE public.empresa_config ADD COLUMN representante_legal VARCHAR(255);
            RAISE NOTICE '✅ Columna representante_legal agregada';
        END IF;
        
        -- dni_representante
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'dni_representante') THEN
            ALTER TABLE public.empresa_config ADD COLUMN dni_representante VARCHAR(8);
            RAISE NOTICE '✅ Columna dni_representante agregada';
        END IF;
        
        -- regimen_tributario
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'regimen_tributario') THEN
            ALTER TABLE public.empresa_config ADD COLUMN regimen_tributario VARCHAR(50) DEFAULT 'GENERAL';
            RAISE NOTICE '✅ Columna regimen_tributario agregada';
        END IF;
        
        -- actividad_economica
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'actividad_economica') THEN
            ALTER TABLE public.empresa_config ADD COLUMN actividad_economica TEXT;
            RAISE NOTICE '✅ Columna actividad_economica agregada';
        END IF;
        
        -- igv_porcentaje
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'igv_porcentaje') THEN
            ALTER TABLE public.empresa_config ADD COLUMN igv_porcentaje DECIMAL(5,2) DEFAULT 18.00;
            RAISE NOTICE '✅ Columna igv_porcentaje agregada';
        END IF;
        
        -- retencion_renta_porcentaje
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'retencion_renta_porcentaje') THEN
            ALTER TABLE public.empresa_config ADD COLUMN retencion_renta_porcentaje DECIMAL(5,2) DEFAULT 3.00;
            RAISE NOTICE '✅ Columna retencion_renta_porcentaje agregada';
        END IF;
        
        -- percepcion_porcentaje
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'percepcion_porcentaje') THEN
            ALTER TABLE public.empresa_config ADD COLUMN percepcion_porcentaje DECIMAL(5,2) DEFAULT 0;
            RAISE NOTICE '✅ Columna percepcion_porcentaje agregada';
        END IF;
        
        -- detraccion_porcentaje
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'detraccion_porcentaje') THEN
            ALTER TABLE public.empresa_config ADD COLUMN detraccion_porcentaje DECIMAL(5,2) DEFAULT 0;
            RAISE NOTICE '✅ Columna detraccion_porcentaje agregada';
        END IF;
        
        -- moneda_defecto
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'moneda_defecto') THEN
            ALTER TABLE public.empresa_config ADD COLUMN moneda_defecto VARCHAR(3) DEFAULT 'PEN';
            RAISE NOTICE '✅ Columna moneda_defecto agregada';
        END IF;
        
        -- redondeo_decimales
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'redondeo_decimales') THEN
            ALTER TABLE public.empresa_config ADD COLUMN redondeo_decimales INTEGER DEFAULT 2;
            RAISE NOTICE '✅ Columna redondeo_decimales agregada';
        END IF;
        
        -- incluir_igv_en_precio
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'incluir_igv_en_precio') THEN
            ALTER TABLE public.empresa_config ADD COLUMN incluir_igv_en_precio BOOLEAN DEFAULT true;
            RAISE NOTICE '✅ Columna incluir_igv_en_precio agregada';
        END IF;
        
        -- envio_automatico_sunat
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'envio_automatico_sunat') THEN
            ALTER TABLE public.empresa_config ADD COLUMN envio_automatico_sunat BOOLEAN DEFAULT true;
            RAISE NOTICE '✅ Columna envio_automatico_sunat agregada';
        END IF;
        
        -- generar_pdf_automatico
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'generar_pdf_automatico') THEN
            ALTER TABLE public.empresa_config ADD COLUMN generar_pdf_automatico BOOLEAN DEFAULT true;
            RAISE NOTICE '✅ Columna generar_pdf_automatico agregada';
        END IF;
        
        -- enviar_email_cliente
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'enviar_email_cliente') THEN
            ALTER TABLE public.empresa_config ADD COLUMN enviar_email_cliente BOOLEAN DEFAULT false;
            RAISE NOTICE '✅ Columna enviar_email_cliente agregada';
        END IF;
        
        -- validar_ruc_sunat
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'validar_ruc_sunat') THEN
            ALTER TABLE public.empresa_config ADD COLUMN validar_ruc_sunat BOOLEAN DEFAULT true;
            RAISE NOTICE '✅ Columna validar_ruc_sunat agregada';
        END IF;
        
        -- usar_codigos_barra
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'usar_codigos_barra') THEN
            ALTER TABLE public.empresa_config ADD COLUMN usar_codigos_barra BOOLEAN DEFAULT true;
            RAISE NOTICE '✅ Columna usar_codigos_barra agregada';
        END IF;
        
        -- formato_numeros
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'formato_numeros') THEN
            ALTER TABLE public.empresa_config ADD COLUMN formato_numeros VARCHAR(20) DEFAULT '#,##0.00';
            RAISE NOTICE '✅ Columna formato_numeros agregada';
        END IF;
        
        -- logo_url
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'logo_url') THEN
            ALTER TABLE public.empresa_config ADD COLUMN logo_url TEXT;
            RAISE NOTICE '✅ Columna logo_url agregada';
        END IF;
        
        -- logo_base64
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'logo_base64') THEN
            ALTER TABLE public.empresa_config ADD COLUMN logo_base64 TEXT;
            RAISE NOTICE '✅ Columna logo_base64 agregada';
        END IF;
        
        -- color_primario
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'color_primario') THEN
            ALTER TABLE public.empresa_config ADD COLUMN color_primario VARCHAR(7) DEFAULT '#1e40af';
            RAISE NOTICE '✅ Columna color_primario agregada';
        END IF;
        
        -- color_secundario
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'color_secundario') THEN
            ALTER TABLE public.empresa_config ADD COLUMN color_secundario VARCHAR(7) DEFAULT '#3b82f6';
            RAISE NOTICE '✅ Columna color_secundario agregada';
        END IF;
        
        -- pais_id
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'pais_id') THEN
            ALTER TABLE public.empresa_config ADD COLUMN pais_id INTEGER;
            RAISE NOTICE '✅ Columna pais_id agregada';
        END IF;
        
        -- tenant_id (si no existe)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa_config' AND column_name = 'tenant_id') THEN
            ALTER TABLE public.empresa_config ADD COLUMN tenant_id UUID NOT NULL DEFAULT '550e8400-e29b-41d4-a716-446655440000';
            RAISE NOTICE '✅ Columna tenant_id agregada';
        END IF;
    END $$;

    -- Crear constraint único si no existe
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'empresa_config_tenant_unique'
        ) THEN
            ALTER TABLE public.empresa_config 
            ADD CONSTRAINT empresa_config_tenant_unique UNIQUE(tenant_id);
            RAISE NOTICE '✅ Constraint tenant_unique agregado';
        END IF;
    END $$;

    -- Continuar con la estructura original (sin CREATE TABLE IF NOT EXISTS)
    CREATE TABLE IF NOT EXISTS public.empresa_config_dummy (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    );
    DROP TABLE IF EXISTS public.empresa_config_dummy;

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_empresa_config_tenant ON public.empresa_config(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_empresa_config_ruc ON public.empresa_config(ruc);
    CREATE INDEX IF NOT EXISTS idx_empresa_config_pais ON public.empresa_config(pais_id);

    -- Comentarios
    COMMENT ON TABLE public.empresa_config IS 'Configuración general de la empresa';
    COMMENT ON COLUMN public.empresa_config.ruc IS 'RUC de la empresa';
    COMMENT ON COLUMN public.empresa_config.razon_social IS 'Razón social de la empresa';
    COMMENT ON COLUMN public.empresa_config.regimen_tributario IS 'GENERAL, MYPE, RER, RUS';
    COMMENT ON COLUMN public.empresa_config.igv_porcentaje IS 'Porcentaje de IGV (18% en Perú)';

    -- Insertar configuración por defecto si no existe
    DO $$
    DECLARE
        v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM public.empresa_config;
        
        IF v_count = 0 THEN
            INSERT INTO public.empresa_config (
                tenant_id,
                ruc,
                razon_social,
                nombre_comercial,
                direccion_fiscal,
                ubigeo,
                departamento,
                provincia,
                distrito,
                telefono,
                email,
                representante_legal,
                regimen_tributario,
                actividad_economica,
                igv_porcentaje,
                moneda_defecto
            ) VALUES (
                '550e8400-e29b-41d4-a716-446655440000',
                '20000000001',
                'ERP KAME S.A.C.',
                'ERP KAME',
                'Av. Tecnología 123, San Isidro, Lima',
                '150101',
                'LIMA',
                'LIMA',
                'SAN ISIDRO',
                '+51 1 234-5678',
                'contacto@erpkame.com',
                'Juan Pérez García',
                'GENERAL',
                'Desarrollo de software empresarial',
                18.00,
                'PEN'
            );
            RAISE NOTICE '✅ Configuración por defecto insertada';
        ELSE
            RAISE NOTICE '✅ Ya existe configuración';
        END IF;
    END $$;

    -- Trigger para updated_at
    CREATE OR REPLACE FUNCTION update_empresa_config_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_empresa_config_updated_at ON public.empresa_config;
    CREATE TRIGGER trigger_empresa_config_updated_at
        BEFORE UPDATE ON public.empresa_config
        FOR EACH ROW
        EXECUTE FUNCTION update_empresa_config_updated_at();

    -- Verificación
    DO $$
    DECLARE
        v_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM public.empresa_config;
        
        RAISE NOTICE '========================================';
        RAISE NOTICE '✅ TABLA empresa_config CREADA';
        RAISE NOTICE '========================================';
        RAISE NOTICE '📊 Registros: %', v_count;
        RAISE NOTICE '✅ Configuración lista para usar';
        RAISE NOTICE '';
    END $$;
