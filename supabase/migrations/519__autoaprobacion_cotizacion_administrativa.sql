-- Migracion 519: excepcion administrativa, acotada y auditable, a la
-- segregacion de funciones de cotizaciones.
--
-- La regla general sigue siendo que el creador no decide su propia cotizacion.
-- Sin embargo, ADMIN y ADMIN_DEMO son roles operativos de administracion y el
-- producto permite que creen y aprueben una cotizacion. La excepcion se concede
-- solo cuando el actor conserva un rol canonico del tenant y ese rol tiene
-- concedido explicitamente `ventas.cotizaciones.approve`.
--
-- La autorrechazo permanece prohibida y una autoaprobacion sin observacion
-- recibe un texto de auditoria estable. El RPC sigue siendo invocable solo por
-- service_role; el guard HTTP conserva la primera barrera de permisos.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.cambiar_estado_cotizacion_tx(
  p_cotizacion_id uuid,
  p_tenant_id uuid,
  p_nuevo_estado text,
  p_actor_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_cot public.cotizaciones%ROWTYPE;
  v_estado text := upper(nullif(btrim(p_nuevo_estado), ''));
  v_motivo text := nullif(btrim(p_motivo), '');
  v_admin_autorizado boolean := false;
  v_autoaprobacion_admin boolean := false;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = p_actor_id
      AND u.tenant_id = p_tenant_id
      AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION 'El actor no pertenece al tenant o está inactivo';
  END IF;

  SELECT * INTO v_cot
  FROM public.cotizaciones
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;

  IF NOT (
    (upper(v_cot.estado::text) = 'BORRADOR' AND v_estado = 'ENVIADA')
    OR (
      upper(v_cot.estado::text) IN ('BORRADOR', 'ENVIADA')
      AND v_estado IN ('APROBADA', 'RECHAZADA')
    )
  ) THEN
    RAISE EXCEPTION 'Transición de cotización inválida: % -> %', v_cot.estado, v_estado;
  END IF;

  IF v_estado IN ('APROBADA', 'RECHAZADA') THEN
    IF v_cot.created_by IS NULL THEN
      RAISE EXCEPTION 'La cotización no tiene creador trazable';
    END IF;

    IF v_cot.created_by = p_actor_id THEN
      IF v_estado = 'RECHAZADA' THEN
        RAISE EXCEPTION 'El creador no puede rechazar su propia cotización';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r
          ON r.id = ur.role_id
         AND r.tenant_id = p_tenant_id
        JOIN public.rol_permisos rp
          ON rp.role_id = r.id
         AND coalesce(rp.concedido, false)
        JOIN public.permisos p
          ON p.id = rp.permiso_id
         AND p.tenant_id = p_tenant_id
        WHERE ur.usuario_sistema_id = p_actor_id
          AND ur.tenant_id = p_tenant_id
          AND coalesce(r.activo, true)
          AND coalesce(r.is_system_role, false)
          AND upper(btrim(r.nombre)) IN ('ADMIN', 'ADMIN_DEMO')
          AND coalesce(p.activo, true)
          AND lower(coalesce(
            nullif(btrim(p.codigo), ''),
            p.modulo || '.' || p.recurso || '.' || p.accion
          )) = 'ventas.cotizaciones.approve'
      ) INTO v_admin_autorizado;

      IF NOT v_admin_autorizado THEN
        RAISE EXCEPTION 'La cotización requiere un aprobador distinto del creador';
      END IF;

      v_autoaprobacion_admin := true;
    END IF;
  END IF;

  UPDATE public.cotizaciones
  SET estado = v_estado,
      aprobado_por = CASE
        WHEN v_estado = 'APROBADA' THEN p_actor_id
        ELSE aprobado_por
      END,
      fecha_aprobacion = CASE
        WHEN v_estado = 'APROBADA' THEN now()
        ELSE fecha_aprobacion
      END,
      observaciones_aprobacion = CASE
        WHEN v_estado = 'APROBADA' THEN coalesce(
          v_motivo,
          CASE WHEN v_autoaprobacion_admin THEN 'Autoaprobación administrativa' END
        )
        ELSE observaciones_aprobacion
      END,
      rechazado_por = CASE
        WHEN v_estado = 'RECHAZADA' THEN p_actor_id
        ELSE rechazado_por
      END,
      fecha_rechazo = CASE
        WHEN v_estado = 'RECHAZADA' THEN now()
        ELSE fecha_rechazo
      END,
      motivo_rechazo = CASE
        WHEN v_estado = 'RECHAZADA' THEN v_motivo
        ELSE motivo_rechazo
      END,
      updated_at = now()
  WHERE id = p_cotizacion_id
    AND tenant_id = p_tenant_id
  RETURNING * INTO v_cot;

  RETURN to_jsonb(v_cot);
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.cambiar_estado_cotizacion_tx(uuid, uuid, text, uuid, text) IS
  'Envía o decide una cotización con actor tenant; mantiene segregación operativa y permite autoaprobación trazable a ADMIN/ADMIN_DEMO con permiso explícito.';

-- La identidad tributaria de una demo completa es parte de su fixture. Se
-- normalizan demos antiguas que pudieron editarse y se impide volver a dejar
-- una demo completa con otro contribuyente, país o entorno fiscal. La salida
-- legítima es convertirla a real (is_demo=false), operación que permanece
-- permitida y puede cambiar luego la identidad por el flujo de conversión.
UPDATE public.empresa_config ec
SET ruc = CASE upper(btrim(ec.pais))
      WHEN 'AR' THEN '30710158229'
      WHEN 'CO' THEN '900123456-8'
      ELSE '20123456786'
    END,
    pais_id = p.id,
    sunat_environment = CASE
      WHEN upper(btrim(ec.pais)) = 'PE' THEN 'homologacion'
      ELSE ec.sunat_environment
    END,
    arca_environment = CASE
      WHEN upper(btrim(ec.pais)) = 'AR' THEN 'homologacion'
      ELSE ec.arca_environment
    END,
    dian_environment = CASE
      WHEN upper(btrim(ec.pais)) = 'CO' THEN 'HOMOLOGACION'
      ELSE ec.dian_environment
    END,
    updated_at = now()
FROM public.paises p
WHERE coalesce(ec.is_demo, false)
  AND upper(btrim(ec.pais)) IN ('PE', 'AR', 'CO')
  AND upper(p.codigo_iso) = upper(btrim(ec.pais))
  AND p.activo
  AND (
    ec.ruc IS DISTINCT FROM CASE upper(btrim(ec.pais))
      WHEN 'AR' THEN '30710158229'
      WHEN 'CO' THEN '900123456-8'
      ELSE '20123456786'
    END
    OR ec.pais_id IS DISTINCT FROM p.id
    OR (
      upper(btrim(ec.pais)) = 'PE'
      AND lower(coalesce(ec.sunat_environment, '')) <> 'homologacion'
    )
    OR (
      upper(btrim(ec.pais)) = 'AR'
      AND lower(coalesce(ec.arca_environment, '')) <> 'homologacion'
    )
    OR (
      upper(btrim(ec.pais)) = 'CO'
      AND upper(coalesce(ec.dian_environment, '')) <> 'HOMOLOGACION'
    )
  );

UPDATE public.tenants t
SET ruc = ec.ruc,
    pais = upper(ec.pais),
    updated_at = now()
FROM public.empresa_config ec
WHERE ec.tenant_id = t.id
  AND coalesce(ec.is_demo, false)
  AND upper(btrim(ec.pais)) IN ('PE', 'AR', 'CO')
  AND (t.ruc IS DISTINCT FROM ec.ruc OR upper(coalesce(t.pais, '')) IS DISTINCT FROM upper(ec.pais));

CREATE OR REPLACE FUNCTION app.enforce_demo_fiscal_identity_519()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_country text := upper(btrim(coalesce(NEW.pais, '')));
  v_expected_ruc text;
  v_expected_country_id bigint;
BEGIN
  IF coalesce(NEW.is_demo, false) IS NOT TRUE
     OR coalesce(NEW.configuracion_completa, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_expected_ruc := CASE v_country
    WHEN 'PE' THEN '20123456786'
    WHEN 'AR' THEN '30710158229'
    WHEN 'CO' THEN '900123456-8'
    ELSE NULL
  END;
  SELECT p.id INTO v_expected_country_id
  FROM public.paises p
  WHERE upper(p.codigo_iso) = v_country AND p.activo
  LIMIT 1;

  IF v_expected_ruc IS NULL
     OR NEW.ruc IS DISTINCT FROM v_expected_ruc
     OR NEW.pais_id IS DISTINCT FROM v_expected_country_id
     OR (v_country = 'PE' AND lower(coalesce(NEW.sunat_environment, '')) <> 'homologacion')
     OR (v_country = 'AR' AND lower(coalesce(NEW.arca_environment, '')) <> 'homologacion')
     OR (v_country = 'CO' AND upper(coalesce(NEW.dian_environment, '')) <> 'HOMOLOGACION')
     OR (
       TG_OP = 'UPDATE'
       AND coalesce(OLD.is_demo, false)
       AND coalesce(OLD.configuracion_completa, false)
       AND upper(btrim(coalesce(OLD.pais, ''))) IS DISTINCT FROM v_country
     ) THEN
    RAISE EXCEPTION 'DEMO_FISCAL_IDENTITY_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_demo_fiscal_identity_519 ON public.empresa_config;
CREATE TRIGGER trg_enforce_demo_fiscal_identity_519
BEFORE INSERT OR UPDATE OF ruc, pais, pais_id, sunat_environment,
  arca_environment, dian_environment, configuracion_completa, is_demo
ON public.empresa_config
FOR EACH ROW
EXECUTE FUNCTION app.enforce_demo_fiscal_identity_519();

CREATE OR REPLACE FUNCTION app.document_has_fiscal_evidence_519(
  p_xml_content text,
  p_cdr_content text,
  p_codigo_hash text,
  p_error_fiscal text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT nullif(btrim(coalesce(p_xml_content, '')), '') IS NOT NULL
      OR nullif(btrim(coalesce(p_cdr_content, '')), '') IS NOT NULL
      OR nullif(btrim(coalesce(p_codigo_hash, '')), '') IS NOT NULL
      OR nullif(btrim(coalesce(p_error_fiscal, '')), '') IS NOT NULL
      OR coalesce(p_metadata, '{}'::jsonb) ?| ARRAY[
        'last_cpe_operation_id', 'last_delivery_operation_id',
        'last_fiscal_result', 'fiscal_contract_version', 'signed_xml_sha256',
        'sunat_ticket', 'ticket_sunat', 'numero_sunat', 'external_number',
        'cdr', 'cdr_sunat', 'ose_response', 'sunat_response',
        'cancellation_request_key', 'cancellation_request_fingerprint',
        'cancellation_requested_by', 'cancellation_requested_at',
        'cancellation_finalization_key', 'cancellation_finalization_fingerprint',
        'cancellation_finalized_by', 'cancellation_finalized_at'
      ]
      OR upper(coalesce(p_metadata->>'fiscal_evidence', 'NONE')) <> 'NONE'
      OR lower(coalesce(p_metadata->>'sunat_sent', 'false')) = 'true';
$$;

-- La muestra comercial histórica de la demo incluía un CPE sin XML/CDR pero
-- lo etiquetaba como aceptado. Se conserva la venta, CxC y salida comercial,
-- pero la evidencia fiscal queda explícitamente local y no terminal.
CREATE OR REPLACE FUNCTION app.normalize_demo_document_seed_519()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF NEW.metadata->>'source' = 'demo_business_seed_v1'
     AND lower(coalesce(NEW.metadata->>'simulated', 'false')) = 'true'
     AND upper(coalesce(NEW.estado::text, '')) = 'EMITIDO'
     AND upper(coalesce(NEW.estado_sunat::text, '')) = 'ACEPTADO'
     AND NOT (NEW.metadata ? 'fiscal_evidence')
     AND NOT app.document_has_fiscal_evidence_519(
       NEW.xml_content, NEW.cdr_content, NEW.codigo_hash, NEW.error_sunat, NEW.metadata
     )
     AND EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE ec.tenant_id = NEW.tenant_id AND coalesce(ec.is_demo, false)
     ) THEN
    NEW.estado_sunat := 'PENDIENTE';
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'fiscal_evidence', 'NONE',
      'sunat_sent', false,
      'sample_kind', 'COMMERCIAL_ONLY'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_demo_cpe_seed_519()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF NEW.metadata->>'source' = 'demo_business_seed_v1'
     AND lower(coalesce(NEW.metadata->>'simulated', 'false')) = 'true'
     AND upper(coalesce(NEW.estado::text, '')) = 'ACEPTADO'
     AND upper(coalesce(NEW.estado_sunat::text, '')) = 'ACEPTADO'
     AND upper(coalesce(NEW.sunat_status::text, '')) = 'ACCEPTED'
     AND NEW.idempotency_key = 'demo-cpe-' || NEW.tenant_id::text
     AND nullif(btrim(coalesce(NEW.xml_firmado, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.cdr_sunat, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.hash, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.hash_firma, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.hash_code, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.numero_comprobante_sunat, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.error_message, '')), '') IS NULL
     AND coalesce(NEW.retry_count, 0) = 0
     AND NEW.next_retry_at IS NULL
     AND NEW.fecha_envio IS NULL
     AND NEW.nota_credito_id IS NULL
     AND nullif(btrim(coalesce(NEW.motivo_anulacion, '')), '') IS NULL
     AND NEW.anulado_por IS NULL
     AND NEW.anulado_at IS NULL
     AND NOT (NEW.metadata ? 'fiscal_evidence')
     AND NOT (NEW.metadata ? 'last_delivery_operation_id')
     AND NOT app.document_has_fiscal_evidence_519(
       NULL, NULL, NULL, NULL, NEW.metadata
     )
     AND EXISTS (
       SELECT 1
       FROM public.documentos d
       WHERE d.id = NEW.documento_id
         AND d.tenant_id = NEW.tenant_id
         AND d.metadata @> '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
         AND upper(d.estado::text) = 'EMITIDO'
         AND NOT app.document_has_fiscal_evidence_519(
           d.xml_content, d.cdr_content, d.codigo_hash, d.error_sunat, d.metadata
         )
         AND (
           upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
           OR (
             upper(coalesce(d.estado_sunat::text, '')) = 'PENDIENTE'
             AND d.metadata->>'fiscal_evidence' = 'NONE'
             AND lower(coalesce(d.metadata->>'sunat_sent', 'false')) = 'false'
             AND d.metadata->>'sample_kind' = 'COMMERCIAL_ONLY'
           )
         )
     )
     AND EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE ec.tenant_id = NEW.tenant_id AND coalesce(ec.is_demo, false)
     ) THEN
    NEW.estado := 'BORRADOR';
    NEW.estado_sunat := 'PENDIENTE';
    NEW.sunat_status := 'NOT_SENT';
    NEW.xml_firmado := NULL;
    NEW.cdr_sunat := NULL;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'fiscal_evidence', 'NONE',
      'sunat_sent', false,
      'sample_kind', 'COMMERCIAL_ONLY'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_demo_inventory_note_519()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF NEW.metadata->>'source' = 'demo_business_seed_v1'
     AND upper(coalesce(NEW.referencia_tipo, '')) = 'CPE'
     AND EXISTS (
       SELECT 1 FROM public.cpe c
       WHERE c.id = NEW.referencia_id
         AND c.tenant_id = NEW.tenant_id
         AND c.idempotency_key = 'demo-cpe-' || c.tenant_id::text
         AND c.metadata @> '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE"}'::jsonb
     )
     AND EXISTS (
       SELECT 1 FROM public.empresa_config ec
       WHERE ec.tenant_id = NEW.tenant_id AND coalesce(ec.is_demo, false)
     ) THEN
    NEW.motivo := 'Salida comercial del ejemplo histórico demo (sin envío fiscal)';
    NEW.notas := 'Salida comercial del ejemplo histórico demo (sin envío fiscal)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_demo_document_seed_519 ON public.documentos;
CREATE TRIGGER trg_normalize_demo_document_seed_519
BEFORE INSERT ON public.documentos
FOR EACH ROW EXECUTE FUNCTION app.normalize_demo_document_seed_519();

DROP TRIGGER IF EXISTS trg_normalize_demo_cpe_seed_519 ON public.cpe;
CREATE TRIGGER trg_normalize_demo_cpe_seed_519
BEFORE INSERT ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.normalize_demo_cpe_seed_519();

DROP TRIGGER IF EXISTS trg_normalize_demo_inventory_note_519 ON public.movimientos_inventario;
CREATE TRIGGER trg_normalize_demo_inventory_note_519
BEFORE INSERT ON public.movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION app.normalize_demo_inventory_note_519();

-- El comprobante comercial historico de la demo se sembraba con cabecera y
-- totales, pero sin lineas. Eso dejaba vacia la representacion impresa y hacia
-- imposible contrastar sus S/ 179,80 con el producto que produjo la salida de
-- inventario. La reparacion se limita al unico fixture PE conocido, exige que
-- no exista actividad/evidencia fiscal y no reemplaza ninguna linea ya escrita.
CREATE OR REPLACE FUNCTION app.ensure_demo_cpe_lines_519(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_cpe_id uuid;
  v_documento_id uuid;
  v_producto_id uuid;
  v_cpe_items_repaired bigint := 0;
  v_document_lines_inserted bigint := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant obligatorio para reparar lineas del CPE demo';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 519));

  SELECT c.id, c.documento_id
  INTO v_cpe_id, v_documento_id
  FROM public.cpe c
  JOIN public.documentos d
    ON d.id = c.documento_id
   AND d.tenant_id = c.tenant_id
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = 'demo-cpe-' || p_tenant_id::text
    AND c.metadata @> '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE","sunat_sent":false,"sample_kind":"COMMERCIAL_ONLY"}'::jsonb
    AND d.metadata @> '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE","sunat_sent":false,"sample_kind":"COMMERCIAL_ONLY"}'::jsonb
    AND EXISTS (
      SELECT 1
      FROM public.empresa_config ec
      WHERE ec.tenant_id = c.tenant_id
        AND coalesce(ec.is_demo, false)
        AND upper(btrim(coalesce(ec.pais, ''))) = 'PE'
        AND ec.ruc = '20123456786'
    )
    AND upper(coalesce(c.tipo_documento, '')) IN ('01', 'FACTURA')
    AND upper(coalesce(c.serie, '')) = 'F001'
    AND lpad(btrim(coalesce(c.numero, '')), 8, '0') = '00000001'
    AND upper(c.estado::text) = 'BORRADOR'
    AND upper(coalesce(c.estado_sunat::text, '')) = 'PENDIENTE'
    AND upper(c.sunat_status::text) = 'NOT_SENT'
    AND c.total_gravadas = 152.37
    AND c.total_igv = 27.43
    AND coalesce(c.total_venta, c.total) = 179.80
    AND c.total = 179.80
    AND CASE
      WHEN c.items IS NULL THEN true
      WHEN jsonb_typeof(c.items) = 'array' THEN jsonb_array_length(c.items) = 0
      ELSE false
    END
    AND nullif(btrim(coalesce(c.xml_firmado, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.cdr_sunat, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash_firma, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash_code, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.numero_comprobante_sunat, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.error_message, '')), '') IS NULL
    AND coalesce(c.retry_count, 0) = 0
    AND c.next_retry_at IS NULL
    AND c.fecha_envio IS NULL
    AND c.nota_credito_id IS NULL
    AND nullif(btrim(coalesce(c.motivo_anulacion, '')), '') IS NULL
    AND c.anulado_por IS NULL
    AND c.anulado_at IS NULL
    AND NOT app.document_has_fiscal_evidence_519(NULL, NULL, NULL, NULL, c.metadata)
    AND upper(coalesce(d.tipo_documento, '')) IN ('01', 'FACTURA')
    AND upper(coalesce(d.serie, '')) = 'F001'
    AND lpad(btrim(coalesce(d.numero, '')), 8, '0') = '00000001'
    AND upper(d.estado::text) = 'EMITIDO'
    AND upper(coalesce(d.estado_sunat::text, '')) = 'PENDIENTE'
    AND d.subtotal = 152.37
    AND d.impuesto_igv = 27.43
    AND d.total = 179.80
    AND nullif(btrim(coalesce(d.motivo_anulacion, '')), '') IS NULL
    AND NOT app.document_has_fiscal_evidence_519(
      d.xml_content, d.cdr_content, d.codigo_hash, d.error_sunat, d.metadata
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.documento_detalles dd
      WHERE dd.tenant_id = d.tenant_id
        AND dd.documento_id = d.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpe_operaciones o
      WHERE o.tenant_id = c.tenant_id
        AND o.cpe_id = c.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpe nc
      WHERE nc.tenant_id = c.tenant_id
        AND nc.id <> c.id
        AND upper(coalesce(nc.tipo_documento, '')) IN ('07', '08')
        AND (
          nc.metadata->>'original_cpe_id' = c.id::text
          OR (
            upper(coalesce(nc.documento_referencia_tipo, '')) = upper(coalesce(c.tipo_documento, ''))
            AND upper(coalesce(nc.documento_referencia_serie, '')) = upper(coalesce(c.serie, ''))
            AND lpad(btrim(coalesce(nc.documento_referencia_numero, '')), 8, '0')
                = lpad(btrim(coalesce(c.numero, '')), 8, '0')
          )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.productos p
      WHERE p.tenant_id = c.tenant_id
        AND upper(btrim(coalesce(p.codigo, ''))) = 'DEMO-004'
        AND coalesce(p.activo, true)
    )
  ORDER BY c.created_at, c.id
  FOR UPDATE OF c, d
  LIMIT 1;

  IF v_cpe_id IS NULL OR v_documento_id IS NULL THEN
    RETURN jsonb_build_object(
      'line_sets_repaired', 0,
      'cpe_items_repaired', 0,
      'document_lines_inserted', 0
    );
  END IF;

  SELECT p.id
  INTO v_producto_id
  FROM public.productos p
  WHERE p.tenant_id = p_tenant_id
    AND upper(btrim(coalesce(p.codigo, ''))) = 'DEMO-004'
    AND coalesce(p.activo, true)
  ORDER BY p.created_at, p.id
  LIMIT 1;

  UPDATE public.cpe c
  SET items = jsonb_build_array(jsonb_build_object(
        'item', 1,
        'producto_id', v_producto_id,
        'codigo', 'DEMO-004',
        'codigo_producto', 'DEMO-004',
        'descripcion', 'Audífonos Bluetooth',
        'unidad', 'NIU',
        'unidad_medida', 'NIU',
        'cantidad', 2,
        'precio_unitario', 76.185::numeric,
        'valor_unitario', 76.185::numeric,
        'precio_venta', 89.90::numeric,
        'valor_venta', 152.37::numeric,
        'igv', 27.43::numeric,
        'impuesto_igv', 27.43::numeric,
        'total', 179.80::numeric,
        'total_item', 179.80::numeric,
        'afectacion_igv', '10',
        'tipo_afectacion_igv', '10'
      )),
      updated_at = now()
  WHERE c.id = v_cpe_id
    AND c.tenant_id = p_tenant_id
    AND CASE
      WHEN c.items IS NULL THEN true
      WHEN jsonb_typeof(c.items) = 'array' THEN jsonb_array_length(c.items) = 0
      ELSE false
    END;
  GET DIAGNOSTICS v_cpe_items_repaired = ROW_COUNT;

  IF v_cpe_items_repaired <> 1 THEN
    RAISE EXCEPTION 'El CPE demo cambió durante la reparación de sus líneas';
  END IF;

  INSERT INTO public.documento_detalles (
    tenant_id, documento_id, orden, producto_id, codigo_producto,
    descripcion, unidad_medida, cantidad, precio_unitario,
    descuento_unitario, valor_venta, impuesto_igv, impuesto_isc,
    total_item, metadata
  ) VALUES (
    p_tenant_id, v_documento_id, 1, v_producto_id, 'DEMO-004',
    'Audífonos Bluetooth', 'NIU', 2, 76.185,
    0, 152.37, 27.43, 0, 179.80,
    '{"source":"demo_business_seed_v1","sample_kind":"COMMERCIAL_ONLY","line_contract":"519"}'::jsonb
  );
  GET DIAGNOSTICS v_document_lines_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'line_sets_repaired', CASE
      WHEN v_cpe_items_repaired = 1 AND v_document_lines_inserted = 1 THEN 1
      ELSE 0
    END,
    'cpe_items_repaired', v_cpe_items_repaired,
    'document_lines_inserted', v_document_lines_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_demo_cpe_lines_after_insert_519()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF NEW.metadata->>'source' = 'demo_business_seed_v1'
     AND lower(coalesce(NEW.metadata->>'simulated', 'false')) = 'true'
     AND NEW.idempotency_key = 'demo-cpe-' || NEW.tenant_id::text THEN
    PERFORM app.ensure_demo_cpe_lines_519(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_demo_cpe_lines_519 ON public.cpe;
CREATE TRIGGER trg_ensure_demo_cpe_lines_519
AFTER INSERT ON public.cpe
FOR EACH ROW EXECUTE FUNCTION app.ensure_demo_cpe_lines_after_insert_519();

-- 498 hizo que la venta POS del fixture pasara por el writer canónico. Desde
-- entonces la fila conserva la identidad durable `demo-pos-<tenant>` pero, de
-- forma correcta para el writer general, ya no copia `source` a metadata. El
-- cierre contable 422 seguía buscándola sólo por esa etiqueta y retornaba antes
-- de completar el asiento del CPE. Se conserva el mismo writer contable; sólo
-- se amplía su localizador a la identidad canónica, siempre dentro del tenant.
CREATE OR REPLACE FUNCTION app.ensure_demo_operational_accounting(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_pos public.ventas_pos%ROWTYPE;
  v_cpe public.cpe%ROWTYPE;
  v_recepcion public.recepciones%ROWTYPE;
  v_asiento_pos uuid;
  v_asiento_venta uuid;
  v_asiento_compra uuid;
  v_cuenta_10 uuid;
  v_cuenta_12 uuid;
  v_cuenta_20 uuid;
  v_cuenta_40 uuid;
  v_cuenta_42 uuid;
  v_cuenta_69 uuid;
  v_cuenta_70 uuid;
  v_costo_pos numeric(14,2);
  v_costo_cpe numeric(14,2);
  v_costo_compra numeric(14,2);
  v_numero integer;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,393));

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config
    WHERE tenant_id=p_tenant_id AND is_demo=true
  ) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa',p_tenant_id;
  END IF;

  SELECT id INTO v_user_id FROM public.users
  WHERE tenant_id=p_tenant_id ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_pos FROM public.ventas_pos
  WHERE tenant_id=p_tenant_id
    AND (
      metadata->>'source'='demo_business_seed_v1'
      OR (
        idempotency_key='demo-pos-' || p_tenant_id::text
        AND atomic_result->>'venta_id'=id::text
        AND metadata->>'atomic_rpc'='pos_registrar_ticket_atomic_tx_471'
      )
    )
  ORDER BY
    CASE WHEN idempotency_key='demo-pos-' || p_tenant_id::text THEN 0 ELSE 1 END,
    created_at,id
  LIMIT 1;
  SELECT * INTO v_cpe FROM public.cpe
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1'
  ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_recepcion FROM public.recepciones
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1'
  ORDER BY created_at,id LIMIT 1;

  -- Las demos anteriores a la muestra transaccional completa se dejan intactas.
  IF v_pos.id IS NULL OR v_cpe.id IS NULL OR v_recepcion.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.plan_cuentas
    (tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado,metadata)
  SELECT p_tenant_id,'69','Costo de ventas','GASTO','GASTO',2,true,true,'ACTIVO',
    '{"source":"demo_business_seed_v5"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='69' AND activo=true
  );

  SELECT id INTO v_cuenta_10 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='10' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_12 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='12' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_20 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='20' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_40 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='40' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_42 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='42' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_69 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='69' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_70 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='70' AND activo=true ORDER BY created_at,id LIMIT 1;

  IF v_cuenta_10 IS NULL OR v_cuenta_12 IS NULL OR v_cuenta_20 IS NULL OR
     v_cuenta_40 IS NULL OR v_cuenta_42 IS NULL OR v_cuenta_69 IS NULL OR v_cuenta_70 IS NULL THEN
    RETURN;
  END IF;

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_pos FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='VENTA_POS' AND referencia_id=v_pos.id AND tipo='SALIDA';

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_cpe FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='CPE' AND referencia_id=v_cpe.id AND tipo='SALIDA';

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_compra FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='RECEPCION_COMPRA' AND referencia_id=v_recepcion.id AND tipo='ENTRADA';

  IF v_costo_pos <= 0 OR v_costo_cpe <= 0 OR v_costo_compra <= 0 THEN
    RAISE EXCEPTION 'Valorización incompleta (POS %, CPE %, compra %) para tenant %',v_costo_pos,v_costo_cpe,v_costo_compra,p_tenant_id;
  END IF;

  SELECT id INTO v_asiento_venta FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1' AND tipo_asiento='VENTA'
  ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_asiento_compra FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1' AND tipo_asiento='COMPRA'
  ORDER BY created_at,id LIMIT 1;

  IF v_asiento_venta IS NULL OR v_asiento_compra IS NULL THEN
    RAISE EXCEPTION 'Asientos base de venta/compra demo ausentes para tenant %',p_tenant_id;
  END IF;

  DELETE FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id IN (v_asiento_venta,v_asiento_compra);

  INSERT INTO public.detalle_asientos (tenant_id,asiento_id,cuenta_id,debe,haber,concepto,fecha,metadata) VALUES
    (p_tenant_id,v_asiento_venta,v_cuenta_12,v_cpe.total,0,'Clientes - Venta a crédito',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_69,v_costo_cpe,0,'Costo de ventas',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_70,0,v_cpe.total_gravadas,'Ventas',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_40,0,v_cpe.total_igv,'IGV por pagar',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_20,0,v_costo_cpe,'Mercaderías',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_20,v_costo_compra,0,'Mercaderías',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_40,118-v_costo_compra,0,'IGV crédito fiscal',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_42,0,118,'Proveedores',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}');

  UPDATE public.asientos_contables SET
    referencia=v_cpe.serie||'-'||lpad(v_cpe.numero::text,8,'0'),
    total_debe=round(v_cpe.total+v_costo_cpe,2),total_haber=round(v_cpe.total+v_costo_cpe,2),
    source_event_id=COALESCE(source_event_id,v_cpe.id),updated_at=now(),
    metadata=COALESCE(metadata,'{}')||'{"accounting_contract":"runtime-sale-v1"}'::jsonb
  WHERE id=v_asiento_venta AND tenant_id=p_tenant_id;

  UPDATE public.asientos_contables SET
    referencia=v_recepcion.id::text,total_debe=118,total_haber=118,
    source_event_id=COALESCE(source_event_id,v_recepcion.id),updated_at=now(),
    metadata=COALESCE(metadata,'{}')||'{"accounting_contract":"runtime-purchase-v1"}'::jsonb
  WHERE id=v_asiento_compra AND tenant_id=p_tenant_id;

  SELECT id INTO v_asiento_pos FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND (source_event_id=v_pos.id OR referencia=v_pos.numero_ticket)
  ORDER BY created_at,id LIMIT 1;

  IF v_asiento_pos IS NULL THEN
    SELECT COALESCE(max(numero_asiento),0)+1 INTO v_numero FROM public.asientos_contables WHERE tenant_id=p_tenant_id;
    v_asiento_pos:=gen_random_uuid();
    INSERT INTO public.asientos_contables
      (id,tenant_id,numero_asiento,fecha,tipo_asiento,concepto,descripcion,origen,referencia,
       total_debe,total_haber,estado,usuario_id,source_event_id,metadata)
    VALUES (v_asiento_pos,p_tenant_id,v_numero,v_pos.fecha,'VENTA','Venta POS '||v_pos.numero_ticket,
      'Venta al contado con costo de mercadería','POS',v_pos.numero_ticket,
      round(v_pos.total+v_costo_pos,2),round(v_pos.total+v_costo_pos,2),'CONFIRMADO',
      COALESCE(v_pos.usuario_id,v_user_id),v_pos.id,
      '{"source":"demo_business_seed_v5","accounting_contract":"runtime-sale-v1"}'::jsonb);
  ELSE
    DELETE FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=v_asiento_pos;
    UPDATE public.asientos_contables SET total_debe=round(v_pos.total+v_costo_pos,2),
      total_haber=round(v_pos.total+v_costo_pos,2),updated_at=now() WHERE id=v_asiento_pos;
  END IF;

  INSERT INTO public.detalle_asientos (tenant_id,asiento_id,cuenta_id,debe,haber,concepto,fecha,metadata) VALUES
    (p_tenant_id,v_asiento_pos,v_cuenta_10,v_pos.total,0,'Caja - Cobro contado',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_69,v_costo_pos,0,'Costo de ventas',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_70,0,v_pos.subtotal,'Ventas',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_40,0,v_pos.impuestos,'IGV por pagar',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_20,0,v_costo_pos,'Mercaderías',v_pos.fecha,'{"source":"demo_business_seed_v5"}');

  IF EXISTS (
    SELECT 1 FROM public.asientos_contables a
    WHERE a.tenant_id=p_tenant_id AND a.id IN (v_asiento_pos,v_asiento_venta,v_asiento_compra)
      AND abs(COALESCE(a.total_debe,0)-COALESCE(a.total_haber,0))>=0.01
  ) THEN RAISE EXCEPTION 'Cierre contable demo desbalanceado para tenant %',p_tenant_id; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.normalize_legacy_demo_seed_519()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_cpe_count bigint := 0;
  v_document_count bigint := 0;
  v_inventory_count bigint := 0;
  v_line_set_count bigint := 0;
  v_demo_tenant_id uuid;
  v_line_result jsonb;
BEGIN
  UPDATE public.cpe c
  SET estado = 'BORRADOR',
      estado_sunat = 'PENDIENTE',
      sunat_status = 'NOT_SENT',
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'fiscal_evidence', 'NONE',
        'sunat_sent', false,
        'sample_kind', 'COMMERCIAL_ONLY',
        'normalized_by', '519'
      ),
      updated_at = now()
  WHERE c.metadata @> '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
    AND c.idempotency_key = 'demo-cpe-' || c.tenant_id::text
    AND upper(c.estado::text) = 'ACEPTADO'
    AND upper(coalesce(c.estado_sunat::text, '')) = 'ACEPTADO'
    AND upper(c.sunat_status::text) = 'ACCEPTED'
    AND nullif(btrim(coalesce(c.xml_firmado, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.cdr_sunat, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash_firma, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.hash_code, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.numero_comprobante_sunat, '')), '') IS NULL
    AND nullif(btrim(coalesce(c.error_message, '')), '') IS NULL
    AND coalesce(c.retry_count, 0) = 0
    AND c.next_retry_at IS NULL
    AND c.fecha_envio IS NULL
    AND c.nota_credito_id IS NULL
    AND nullif(btrim(coalesce(c.motivo_anulacion, '')), '') IS NULL
    AND c.anulado_por IS NULL
    AND c.anulado_at IS NULL
    AND NOT (c.metadata ? 'fiscal_evidence')
    AND NOT (c.metadata ? 'last_delivery_operation_id')
    AND NOT app.document_has_fiscal_evidence_519(
      NULL, NULL, NULL, NULL, c.metadata
    )
    AND EXISTS (
      SELECT 1
      FROM public.documentos d
      WHERE d.id = c.documento_id
        AND d.tenant_id = c.tenant_id
        AND d.metadata @> '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
        AND upper(d.estado::text) = 'EMITIDO'
        AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
        AND NOT app.document_has_fiscal_evidence_519(
          d.xml_content, d.cdr_content, d.codigo_hash, d.error_sunat, d.metadata
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cpe_operaciones o
      WHERE o.tenant_id = c.tenant_id AND o.cpe_id = c.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.cpe nc
      WHERE nc.tenant_id = c.tenant_id
        AND nc.id <> c.id
        AND upper(coalesce(nc.tipo_documento, '')) IN ('07', '08')
        AND (
          nc.metadata->>'original_cpe_id' = c.id::text
          OR (
            upper(coalesce(nc.documento_referencia_tipo, '')) = upper(coalesce(c.tipo_documento, ''))
            AND upper(coalesce(nc.documento_referencia_serie, '')) = upper(coalesce(c.serie, ''))
            AND lpad(btrim(coalesce(nc.documento_referencia_numero, '')), 8, '0')
                = lpad(btrim(coalesce(c.numero, '')), 8, '0')
          )
        )
    );
  GET DIAGNOSTICS v_cpe_count = ROW_COUNT;

  UPDATE public.documentos d
  SET estado_sunat = 'PENDIENTE',
      metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
        'fiscal_evidence', 'NONE',
        'sunat_sent', false,
        'sample_kind', 'COMMERCIAL_ONLY',
        'normalized_by', '519'
      ),
      updated_at = now()
  FROM public.cpe c
  WHERE c.documento_id = d.id
    AND c.tenant_id = d.tenant_id
    AND c.idempotency_key = 'demo-cpe-' || c.tenant_id::text
    AND c.metadata @> '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE","normalized_by":"519"}'::jsonb
    AND d.metadata @> '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
    AND upper(d.estado::text) = 'EMITIDO'
    AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
    AND NOT app.document_has_fiscal_evidence_519(
      d.xml_content, d.cdr_content, d.codigo_hash, d.error_sunat, d.metadata
    );
  GET DIAGNOSTICS v_document_count = ROW_COUNT;

  UPDATE public.movimientos_inventario mi
  SET motivo = 'Salida comercial del ejemplo histórico demo (sin envío fiscal)',
      notas = 'Salida comercial del ejemplo histórico demo (sin envío fiscal)',
      updated_at = now()
  FROM public.cpe c
  WHERE c.id = mi.referencia_id
    AND c.tenant_id = mi.tenant_id
    AND c.idempotency_key = 'demo-cpe-' || c.tenant_id::text
    AND c.metadata @> '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE"}'::jsonb
    AND mi.metadata->>'source' = 'demo_business_seed_v1'
    AND upper(coalesce(mi.referencia_tipo, '')) = 'CPE'
    AND (
      mi.motivo = 'Factura demo aceptada en homologación'
      OR mi.notas = 'Factura demo aceptada en homologación'
    );
  GET DIAGNOSTICS v_inventory_count = ROW_COUNT;

  FOR v_demo_tenant_id IN
    SELECT ec.tenant_id
    FROM public.empresa_config ec
    WHERE coalesce(ec.is_demo, false)
      AND upper(btrim(coalesce(ec.pais, ''))) = 'PE'
      AND ec.tenant_id IS NOT NULL
  LOOP
    v_line_result := app.ensure_demo_cpe_lines_519(v_demo_tenant_id);
    v_line_set_count := v_line_set_count
      + coalesce((v_line_result->>'line_sets_repaired')::bigint, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'cpe_normalized', v_cpe_count,
    'documents_normalized', v_document_count,
    'inventory_normalized', v_inventory_count,
    'cpe_line_sets_repaired', v_line_set_count
  );
END;
$$;

SELECT app.normalize_legacy_demo_seed_519();

DO $$
DECLARE
  v_demo_tenant record;
BEGIN
  FOR v_demo_tenant IN
    SELECT ec.tenant_id
    FROM public.empresa_config ec
    WHERE coalesce(ec.is_demo, false)
      AND upper(btrim(coalesce(ec.pais, ''))) = 'PE'
      AND ec.tenant_id IS NOT NULL
  LOOP
    PERFORM app.ensure_demo_operational_accounting(v_demo_tenant.tenant_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_demo_fiscal_identity_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.document_has_fiscal_evidence_519(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.normalize_legacy_demo_seed_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.normalize_demo_document_seed_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.normalize_demo_cpe_seed_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.normalize_demo_inventory_note_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.ensure_demo_cpe_lines_519(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.ensure_demo_cpe_lines_after_insert_519()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.ensure_demo_operational_accounting(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
