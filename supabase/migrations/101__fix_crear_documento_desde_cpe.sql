-- 101__fix_crear_documento_desde_cpe.sql
-- Alinea la función con el esquema actual (usa correlativo_actual y normaliza tipo_documento).

CREATE OR REPLACE FUNCTION crear_documento_desde_cpe(p_cpe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cpe RECORD;
  v_documento_id uuid;
  v_serie_config RECORD;
  v_tipo_documento TEXT;
  v_numero_text TEXT;
  v_empresa RECORD;
  v_emisor_ruc TEXT;
  v_emisor_razon TEXT;
  v_emisor_direccion TEXT;
  v_receptor_doc TEXT;
  v_receptor_nombre TEXT;
  v_receptor_direccion TEXT;
  v_receptor_tipo TEXT;
BEGIN
  SELECT * INTO v_cpe
  FROM cpe
  WHERE id = p_cpe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE no encontrado: %', p_cpe_id;
  END IF;

  IF v_cpe.documento_id IS NOT NULL THEN
    RETURN v_cpe.documento_id;
  END IF;

  v_tipo_documento :=
    CASE
      WHEN v_cpe.tipo_documento IN ('01', 'FACTURA') THEN 'FACTURA'
      WHEN v_cpe.tipo_documento IN ('03', 'BOLETA') THEN 'BOLETA'
      ELSE COALESCE(v_cpe.tipo_documento, 'FACTURA')
    END;

  v_numero_text :=
    CASE
      WHEN v_cpe.numero IS NULL THEN NULL
      WHEN v_cpe.numero::text ~ '^\d+$' THEN LPAD(v_cpe.numero::text, 8, '0')
      ELSE v_cpe.numero::text
    END;

  SELECT * INTO v_serie_config
  FROM documento_series
  WHERE tenant_id = v_cpe.tenant_id
    AND tipo_documento = v_tipo_documento
    AND serie = v_cpe.serie
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO documento_series (
      tenant_id,
      tipo_documento,
      serie,
      correlativo_actual,
      correlativo_maximo,
      activo
    ) VALUES (
      v_cpe.tenant_id,
      v_tipo_documento,
      v_cpe.serie,
      COALESCE(v_cpe.numero::integer, 1),
      99999999,
      true
    )
    RETURNING * INTO v_serie_config;
  END IF;

  SELECT
    ruc,
    razon_social,
    direccion_fiscal
  INTO v_empresa
  FROM empresa_config
  WHERE tenant_id = v_cpe.tenant_id
  LIMIT 1;

  v_emisor_ruc := COALESCE(NULLIF(TRIM(v_cpe.ruc_emisor), ''), NULLIF(TRIM(v_empresa.ruc), ''), '20000000000');
  v_emisor_razon := COALESCE(NULLIF(TRIM(v_cpe.razon_social_emisor), ''), NULLIF(TRIM(v_empresa.razon_social), ''), 'EMISOR');
  v_emisor_direccion := COALESCE(NULLIF(TRIM(v_empresa.direccion_fiscal), ''), 'DIRECCION NO DEFINIDA');

  v_receptor_doc := COALESCE(NULLIF(TRIM(v_cpe.documento_receptor), ''), '00000000');
  v_receptor_nombre := COALESCE(NULLIF(TRIM(v_cpe.razon_social_receptor), ''), 'CLIENTE');
  v_receptor_direccion := NULLIF(TRIM(v_cpe.direccion_receptor), '');
  v_receptor_tipo := COALESCE(NULLIF(TRIM(v_cpe.tipo_documento_receptor), ''), 'RUC');

  INSERT INTO documentos (
    tenant_id,
    tipo_documento,
    serie,
    numero,
    fecha_emision,
    fecha_vencimiento,
    moneda,
    tipo_cambio,
    subtotal,
    impuesto_igv,
    total,
    estado,
    emisor_ruc,
    emisor_razon_social,
    emisor_direccion,
    receptor_documento,
    receptor_nombre,
    receptor_direccion,
    receptor_tipo_doc,
    observaciones,
    created_at
  ) VALUES (
    v_cpe.tenant_id,
    v_tipo_documento,
    v_cpe.serie,
    COALESCE(v_numero_text, v_cpe.id::text),
    COALESCE(v_cpe.fecha_emision, v_cpe.created_at::date),
    COALESCE(v_cpe.fecha_vencimiento, COALESCE(v_cpe.fecha_emision, v_cpe.created_at::date)),
    COALESCE(v_cpe.moneda, 'PEN'),
    1,
    COALESCE(v_cpe.total_gravadas, v_cpe.total_venta, 0),
    COALESCE(v_cpe.total_igv, 0),
    COALESCE(v_cpe.total_venta, 0),
    CASE 
      WHEN v_cpe.sunat_status = 'ACCEPTED' THEN 'EMITIDO'
      WHEN v_cpe.sunat_status = 'REJECTED' THEN 'ANULADO'
      WHEN v_cpe.estado = 'ACEPTADO' THEN 'EMITIDO'
      WHEN v_cpe.estado = 'RECHAZADO' THEN 'ANULADO'
      ELSE 'BORRADOR'
    END,
    v_emisor_ruc,
    v_emisor_razon,
    v_emisor_direccion,
    v_receptor_doc,
    v_receptor_nombre,
    v_receptor_direccion,
    v_receptor_tipo,
    format('Documento creado desde CPE %s - Cliente: %s',
      v_cpe.id,
      COALESCE(v_cpe.razon_social_receptor, 'N/A')
    ),
    v_cpe.created_at
  )
  RETURNING id INTO v_documento_id;

  UPDATE cpe
  SET documento_id = v_documento_id
  WHERE id = p_cpe_id;

  RETURN v_documento_id;
END;
$$;
