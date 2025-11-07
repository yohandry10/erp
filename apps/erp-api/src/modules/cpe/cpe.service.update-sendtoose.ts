/**
 * ARCHIVO TEMPORAL: Nuevo método sendToFiscalService para reemplazar sendToOse
 * 
 * Este método detecta automáticamente el país del tenant y envía al servicio correcto:
 * - Perú → SUNAT (OSE)
 * - Colombia → DIAN
 * 
 * INSTRUCCIONES:
 * 1. Copiar este método al cpe.service.ts
 * 2. Reemplazar todas las llamadas a sendToOse() por sendToFiscalService()
 * 3. Eliminar el método sendToOse() antiguo
 */

/**
 * 🌍 Envía documento al servicio fiscal correcto según el país del tenant
 * Reemplaza el método sendToOse() que estaba hardcoded a SUNAT
 */
private async sendToFiscalService(cpeId: string, tenantId: string, xmlContent?: string, fileName?: string): Promise<void> {
  try {
    // 1. Obtener nombre del servicio fiscal para logs
    const servicioFiscal = await this.fiscalAdapter.obtenerNombreServicioFiscal(tenantId);
    console.log(`📤 [CPE] Enviando CPE ${cpeId} a ${servicioFiscal}...`);
    
    // 2. Marcar como ENVIADO
    await this.supabaseService.update(
      'cpe',
      {
        estado: 'ENVIADO',
        sunat_status: this.sunatStatuses.SENDING, // TODO: Renombrar a fiscal_status
        updated_at: new Date().toISOString(),
      },
      { id: cpeId }
    );

    // 3. Si no se proporciona XML, obtenerlo de la BD
    if (!xmlContent || !fileName) {
      const { data: cpeData, error } = await this.supabaseService.getClient()
        .from('cpe')
        .select('xml_firmado, ruc_emisor, tipo_documento, serie, numero, tenant_id')
        .eq('id', cpeId)
        .single();

      if (error || !cpeData) {
        throw new Error('No se pudo obtener el XML del CPE');
      }

      xmlContent = cpeData.xml_firmado;
      fileName = `${cpeData.ruc_emisor}-${cpeData.tipo_documento}-${cpeData.serie}-${cpeData.numero}`;
      tenantId = cpeData.tenant_id;
    }

    // 4. 🌍 ENVIAR AL SERVICIO FISCAL CORRECTO (SUNAT o DIAN)
    // Construir documento electrónico desde CPE
    const { data: cpeCompleto } = await this.supabaseService.getClient()
      .from('cpe')
      .select('*')
      .eq('id', cpeId)
      .single();

    if (!cpeCompleto) {
      throw new Error('No se pudo obtener datos completos del CPE');
    }

    // Mapear CPE a DocumentoElectronico
    const documento = {
      id: cpeCompleto.id,
      tipoDocumento: cpeCompleto.tipo_documento,
      serie: cpeCompleto.serie,
      numero: cpeCompleto.numero.toString(),
      fechaEmision: cpeCompleto.fecha_emision,
      fechaVencimiento: cpeCompleto.fecha_vencimiento,
      emisor: {
        tipoDocumento: '6', // RUC/NIT
        numeroDocumento: cpeCompleto.ruc_emisor,
        razonSocial: cpeCompleto.razon_social_emisor || 'Emisor',
        direccion: cpeCompleto.direccion_emisor || '',
      },
      receptor: {
        tipoDocumento: cpeCompleto.tipo_documento_cliente || '6',
        numeroDocumento: cpeCompleto.numero_documento_cliente || '',
        razonSocial: cpeCompleto.razon_social_cliente || 'Cliente',
        direccion: cpeCompleto.direccion_cliente || '',
      },
      moneda: cpeCompleto.moneda || 'PEN',
      subtotal: parseFloat(cpeCompleto.subtotal || '0'),
      totalImpuestos: parseFloat(cpeCompleto.igv || '0'),
      importeTotal: parseFloat(cpeCompleto.total || '0'),
      tasaImpuesto: 0.18, // Se obtiene dinámicamente del país
      items: cpeCompleto.items || [],
      xmlContent: xmlContent
    };

    // 🚀 Enviar usando el adaptador multi-país
    const response = await this.fiscalAdapter.enviarDocumento(documento, tenantId);

    // 5. Procesar respuesta
    if (response.success) {
      console.log(`✅ [CPE] CPE ${cpeId} enviado exitosamente a ${servicioFiscal}`);
      
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'ACEPTADO',
          sunat_status: this.sunatStatuses.ACCEPTED,
          cdr_sunat: response.cdr || 'CDR_RECEIVED',
          hash: response.hash || response.numeroComprobante || null,
          hash_firma: response.hash || null,
          numero_comprobante_sunat: response.numeroComprobante,
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );
    } else {
      console.error(`❌ [CPE] Error enviando CPE ${cpeId} a ${servicioFiscal}: ${response.descripcionRespuesta}`);
      
      const isTechnicalError = this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);
      
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'RECHAZADO',
          sunat_status: isTechnicalError ? this.sunatStatuses.ERROR : this.sunatStatuses.REJECTED,
          error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
          retry_count: isTechnicalError ? 0 : null,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );
    }

  } catch (error) {
    console.error(`❌ [CPE] Error técnico enviando CPE ${cpeId}:`, error);
    
    await this.supabaseService.update(
      'cpe',
      {
        estado: 'RECHAZADO',
        sunat_status: this.sunatStatuses.ERROR,
        error_message: `Error técnico: ${error.message}`,
        retry_count: 0,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      },
      { id: cpeId }
    );
  }
}

/**
 * CAMBIOS NECESARIOS EN CPE.SERVICE.TS:
 * 
 * 1. Reemplazar línea 632:
 *    ANTES: const response = await this.oseService.enviarCpe(xmlContent, fileName);
 *    DESPUÉS: await this.sendToFiscalService(cpeId, tenantId, xmlContent, fileName);
 * 
 * 2. Actualizar método resendToOse (línea 465):
 *    ANTES: await this.sendToOse(id, cpe.xml_firmado, fileName);
 *    DESPUÉS: await this.sendToFiscalService(id, tenantId, cpe.xml_firmado, fileName);
 * 
 * 3. Actualizar método sendToOseManual (línea 481):
 *    ANTES: await this.sendToOse(id, xmlFirmado, fileName);
 *    DESPUÉS: await this.sendToFiscalService(id, tenantId, xmlFirmado, fileName);
 * 
 * 4. Actualizar método retrySendToOse (línea 596):
 *    ANTES: return this.sendToOse(cpeId);
 *    DESPUÉS: return this.sendToFiscalService(cpeId, tenantId);
 * 
 * 5. Eliminar el método sendToOse() completo (líneas 600-695)
 * 
 * 6. Agregar este nuevo método sendToFiscalService()
 */
