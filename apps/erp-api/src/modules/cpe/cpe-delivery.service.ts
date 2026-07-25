import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { FacturaDto } from '@erp-suite/dtos';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CpeCertificateService } from './cpe-certificate.service';
import { buildSunatQrContent, buildSunatQrDataUrl } from './sunat-qr.util';

/** Firma, consulta, representa y entrega CPE al proveedor fiscal. */
export class CpeDeliveryService {
  private readonly logger = new Logger(CpeDeliveryService.name);
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT', READY: 'READY', SENDING: 'SENDING', ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED', ERROR: 'ERROR',
  } as const;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly fiscalAdapter: FiscalAdapterService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly certificateService: CpeCertificateService,
  ) {}

  private getXmlSigner(tenantId: string) {
    return this.certificateService.getXmlSigner(tenantId);
  }

async getEmpresaEmisorInfo(tenantId: string) {
    const { data } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select([
        'ruc',
        'razon_social',
        'direccion_fiscal',
        'ubigeo',
        'departamento',
        'provincia',
        'dian_regimen_fiscal',
        'dian_tipo_contribuyente',
      ].join(','))
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const typedData = data as any;
    return {
      ruc: typedData?.ruc ?? '20000000000',
      razonSocial: typedData?.razon_social ?? 'EMPRESA',
      direccion: typedData?.direccion_fiscal ?? 'DIRECCION NO DEFINIDA',
      ciudad: typedData?.provincia ?? '',
      departamento: typedData?.departamento ?? '',
      codigoUbigeo: typedData?.ubigeo ?? '',
      codigoDepartamento: '',
      regimenFiscal: typedData?.dian_regimen_fiscal ?? '',
      tipoContribuyente: typedData?.dian_tipo_contribuyente ?? '',
    };
  }

async findOne(id: string, tenantId: string): Promise<FacturaDto> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) {
        throw new NotFoundException('CPE not found');
      }

      return this.mapToDto(data);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error fetching CPE');
    }
  }

async getCpeById(id: string, tenantId: string): Promise<any> {
    try {
      console.log(`📄 Obteniendo CPE con ID: ${id}`);
      
      const { data: cpeData, error } = await this.supabaseService.getClient()
        .from('cpe')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !cpeData) {
        console.error('❌ CPE no encontrado:', error);
        throw new Error('CPE no encontrado');
      }

      // Obtener logo_url de empresa_config
      const { data: empresaConfig } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('logo_url')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const typedEmpresaConfig = empresaConfig as any;
      const typedCpeData = cpeData as any;
      const sunatQrContent = buildSunatQrContent(typedCpeData);
      let sunatQrDataUrl: string | null = null;

      try {
        sunatQrDataUrl = await buildSunatQrDataUrl(typedCpeData);
      } catch (qrError) {
        this.logger.warn(`No se pudo generar QR SUNAT para CPE ${id}: ${(qrError as Error).message}`);
      }

      console.log('✅ CPE encontrado para vista:', cpeData);
      return {
        ...cpeData,
        logo_url: typedEmpresaConfig?.logo_url || null,
        sunat_qr_content: sunatQrContent,
        sunat_qr_data_url: sunatQrDataUrl,
        valor_resumen: typedCpeData.valor_resumen || typedCpeData.hash_firma || typedCpeData.hash || null,
      };
    } catch (error) {
      console.error('❌ Error obteniendo CPE:', error);
      throw new Error(`Error obteniendo CPE: ${error.message}`);
    }
  }

async generatePdf(id: string, tenantId: string): Promise<Buffer> {
    try {
      this.logger.log(`📄 Generando PDF con formato SUNAT para CPE: ${id}`);
      
      // Usar el nuevo generador de PDF con formato oficial SUNAT
      // ✅ Incluye código QR obligatorio
      // ✅ Diseño visual estándar SUNAT
      // ✅ Leyendas obligatorias
      const pdfBuffer = await this.pdfGenerator.generateSunatCompliantPdf(id, tenantId);
      
      this.logger.log(`✅ PDF generado exitosamente para CPE: ${id}`);
      return pdfBuffer;
      
    } catch (error) {
      this.logger.error(`❌ Error generando PDF para CPE ${id}:`, error);
      throw new Error(`Error generando PDF: ${error.message}`);
    }
  }

async getSignedXml(id: string, tenantId: string): Promise<string> {
    const cpe = await this.findOne(id, tenantId);
    
    if (!cpe.xml_firmado) {
      throw new BadRequestException('XML not available for this CPE');
    }

    return cpe.xml_firmado;
  }

async resendToOse(id: string, tenantId: string, options?: { idempotencyKey?: string }) {
    const cpe = await this.findOne(id, tenantId);
    
    // Obtener XML firmado del CPE
    const fileName = `${cpe.ruc_emisor}-${cpe.tipo_documento}-${cpe.serie}-${cpe.numero}`;
    
    await this.sendToOse(id, cpe.xml_firmado, fileName, options);
    
    return { message: 'CPE resent to OSE successfully' };
  }

async sendToOseManual(
    id: string,
    xmlFirmado: string,
    fileName: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    console.log(`🚀 [CPE] Enviando manualmente CPE ${id} a SUNAT...`);
    await this.sendToOse(id, xmlFirmado, fileName, options);
  }

async checkOseStatus(id: string, tenantId: string) {
    const cpe = await this.findOne(id, tenantId);
    
    // 🌍 Consultar estado en servicio fiscal correcto (SUNAT o DIAN)
    const servicioFiscal = await this.fiscalAdapter.obtenerNombreServicioFiscal(tenantId);
    console.log(`🔍 Consultando estado en ${servicioFiscal} para CPE ${id}`);
    
    const response = await this.fiscalAdapter.consultarEstado(
      tenantId,
      cpe.tipo_documento,
      cpe.serie,
      cpe.numero.toString(),
      cpe.hash
    );
    
    // Actualizar estado en BD si es necesario
    if (response.success) {
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'ACEPTADO',
          sunat_status: this.sunatStatuses.ACCEPTED,
          cdr_sunat: response.cdr || 'CDR_RECEIVED',
          updated_at: new Date().toISOString(),
        },
        { id: cpe.id }
      );
    } else {
      await this.supabaseService.update(
        'cpe',
        {
          sunat_status: this.sunatStatuses.REJECTED,
          error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
          updated_at: new Date().toISOString(),
        },
        { id: cpe.id }
      );
    }
    
    return {
      id: cpe.id,
      estado: response.success ? 'ACEPTADO' : cpe.estado,
      codigoSunat: response.codigoRespuesta,
      descripcionSunat: response.descripcionRespuesta,
      timestamp: new Date(),
    };
  }

async prepareXmlForSunat(cpeId: string, xmlContent: string, tenantId: string): Promise<boolean> {
    try {
      console.log(`📄 [CPE] Preparando XML para CPE ${cpeId}...`);
      
      // Obtener el XmlSigner configurado para el tenant
      const xmlSigner = await this.getXmlSigner(tenantId);
      console.log('📜 [CPE] Certificado configurado');
      
      // Firmar el XML con certificado real
      const xmlSigned = xmlSigner.signXml(xmlContent);
      const hash = xmlSigner.generateHash(xmlSigned);

      // Validar la firma generada
      const isValid = xmlSigner.validateSignature(xmlSigned);
      if (!isValid) {
        console.warn('⚠️ [CPE] La firma generada no pasó la validación');
      }

      // Actualizar CPE con XML firmado
      console.log('🔧 [CPE] Actualizando estado a: FIRMADO');
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'FIRMADO', // Estado que indica listo para SUNAT
          hash: hash,
          hash_firma: hash,
          xml_firmado: xmlSigned,
          sunat_status: this.sunatStatuses.READY,
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );

      console.log(`✅ [CPE] XML firmado para CPE ${cpeId}`);
      console.log(`📊 [CPE] Hash: ${hash}`);
      console.log(`📊 [CPE] Firma válida: ${isValid ? '✅' : '⚠️'}`);
      console.log(`📊 [CPE] Modo certificado: DEMO`);

      return true;
    } catch (error) {
      console.error(`❌ [CPE] Error preparando XML para CPE ${cpeId}:`, error);
      
      // Marcar como ERROR
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'RECHAZADO',
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error preparando XML: ${error.message}`,
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );

      return false;
    }
  }

async retrySendToOse(
    cpeId: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    return this.sendToOse(cpeId, undefined, undefined, options);
  }

private async sendToOse(
    cpeId: string,
    xmlContent?: string,
    fileName?: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    try {
      // 🔍 PASO 1: Obtener datos del CPE incluyendo tenant_id
      const { data: cpeData, error: cpeError } = await this.supabaseService.getClient()
        .from('cpe')
        .select('*, tenant_id, xml_firmado, ruc_emisor, tipo_documento, serie, numero')
        .eq('id', cpeId)
        .single();

      if (cpeError || !cpeData) {
        throw new Error('No se pudo obtener datos del CPE');
      }

      const tenantId = cpeData.tenant_id;
      const effectiveIdempotencyKey =
        String(options?.idempotencyKey ?? '').trim() ||
        String((cpeData as any).idempotency_key ?? '').trim() ||
        `cpe.send:${tenantId}:${cpeId}`;

      // HARDENING: evitar doble envío concurrente si ya está en flight.
      if (
        (cpeData as any).estado === 'ENVIADO' &&
        (cpeData as any).sunat_status === this.sunatStatuses.SENDING
      ) {
        this.logger.warn(
          `♻️ [CPE] Envío ya en progreso para ${cpeId} (idempotencyKey=${effectiveIdempotencyKey}); omitiendo duplicado.`,
        );
        return;
      }
      
      // 🌍 PASO 2: Detectar servicio fiscal según país del tenant
      const servicioFiscal = await this.fiscalAdapter.obtenerNombreServicioFiscal(tenantId);
      console.log(`📤 [CPE] Enviando CPE ${cpeId} a ${servicioFiscal}...`);
      
      // PASO 3: Marcar como ENVIADO
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'ENVIADO',
          sunat_status: this.sunatStatuses.SENDING,
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );

      // PASO 4: Preparar XML si no se proporcionó
      if (!xmlContent || !fileName) {
        xmlContent = cpeData.xml_firmado;
        fileName = `${cpeData.ruc_emisor}-${cpeData.tipo_documento}-${cpeData.serie}-${cpeData.numero}`;
      }

      // 🚀 PASO 5: ENVIAR AL SERVICIO FISCAL CORRECTO (SUNAT o DIAN)
      // Construir documento electrónico desde CPE
      const paisCodigo = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
      const fiscalConfig = await this.fiscalAdapter.obtenerConfiguracionFiscal(tenantId);
      const emisorInfo = await this.getEmpresaEmisorInfo(tenantId);
      const emisorTipoDocumento = paisCodigo === 'CO' ? '31' : '6';
      const receptorTipoDocumento =
        cpeData.tipo_documento_receptor ||
        cpeData.tipo_documento_cliente ||
        (paisCodigo === 'CO' ? '31' : '6');
      const emisorNumeroDocumento = this.pickFirstNonEmpty(
        [cpeData.ruc_emisor, emisorInfo.ruc],
        '20000000000',
      );
      const emisorRazonSocial = this.pickFirstNonEmpty(
        [cpeData.razon_social_emisor, emisorInfo.razonSocial],
        'Emisor',
      );
      const emisorDireccion = this.pickFirstNonEmpty(
        [cpeData.direccion_emisor, emisorInfo.direccion],
        '',
      );
      const subtotalValue = parseFloat(cpeData.subtotal || cpeData.total_gravadas || '0');
      const impuestosValue = parseFloat(cpeData.igv || cpeData.total_igv || '0');
      const totalValue = parseFloat(cpeData.total || cpeData.total_venta || '0');
      const documento = {
        id: cpeData.id,
        tipoDocumento: cpeData.tipo_documento,
        serie: cpeData.serie,
        numero: cpeData.numero?.toString() || '',
        fechaEmision: cpeData.fecha_emision,
        fechaVencimiento: cpeData.fecha_vencimiento,
        emisor: {
          tipoDocumento: emisorTipoDocumento,
          numeroDocumento: emisorNumeroDocumento,
          razonSocial: emisorRazonSocial,
          direccion: emisorDireccion,
          ciudad: emisorInfo.ciudad || '',
          departamento: emisorInfo.departamento || '',
          codigoUbigeo: emisorInfo.codigoUbigeo || '',
          codigoDepartamento: emisorInfo.codigoDepartamento || '',
          regimenFiscal: emisorInfo.regimenFiscal || '',
          tipoContribuyente: emisorInfo.tipoContribuyente || '',
        },
        receptor: {
          tipoDocumento: receptorTipoDocumento,
          numeroDocumento: cpeData.documento_receptor || cpeData.numero_documento_cliente || '',
          razonSocial: cpeData.razon_social_receptor || cpeData.razon_social_cliente || 'Cliente',
          direccion: cpeData.direccion_receptor || cpeData.direccion_cliente || '',
        },
        moneda: cpeData.moneda || 'PEN',
        subtotal: subtotalValue,
        totalImpuestos: impuestosValue,
        importeTotal: totalValue,
        tasaImpuesto: fiscalConfig?.tasaImpuesto,
        items: cpeData.items || [],
        xmlContent: xmlContent
      };

      const response = await this.fiscalAdapter.enviarDocumento(documento, tenantId);

      if (response.success) {
        console.log(`✅ [CPE] CPE ${cpeId} enviado exitosamente a ${servicioFiscal}`);
        
        // Actualizar como ACEPTADO
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
        
        // 🔴 CRÍTICO FIX: Determinar si es error técnico recuperable o error de validación
        const isTechnicalError = this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta);
        
        // Marcar como RECHAZADO
        await this.supabaseService.update(
          'cpe',
          {
            estado: 'RECHAZADO',
            sunat_status: isTechnicalError ? this.sunatStatuses.ERROR : this.sunatStatuses.REJECTED,
            error_message: `${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
            retry_count: isTechnicalError ? 0 : null, // Solo reintentar errores técnicos
            next_retry_at: null,
            updated_at: new Date().toISOString(),
          },
          { id: cpeId }
        );
      }

    } catch (error) {
      console.error(`❌ [CPE] Error técnico enviando CPE ${cpeId}:`, error);
      
      // 🔴 CRÍTICO FIX: Marcar como RECHAZADO con información de reintento
      const retryCount = 0; // Primera vez que falla
      await this.supabaseService.update(
        'cpe',
        {
          estado: 'RECHAZADO',
          sunat_status: this.sunatStatuses.ERROR,
          error_message: `Error técnico: ${error.message}`,
          retry_count: retryCount,
          next_retry_at: null, // El servicio de reintentos lo programará
          updated_at: new Date().toISOString(),
        },
        { id: cpeId }
      );
    }
  }

private isTechnicalError(codigoRespuesta: string, descripcionRespuesta: string): boolean {
    // Códigos de error técnicos de SUNAT que se pueden reintentar
    const technicalErrorCodes = ['99', '98', '97']; // Errores técnicos genéricos
    
    // Si el código indica error técnico
    if (technicalErrorCodes.includes(codigoRespuesta)) {
      return true;
    }

    // Si el mensaje indica error técnico de red/conexión
    const errorMessage = descripcionRespuesta?.toLowerCase() || '';
    const technicalKeywords = [
      'timeout',
      'connection',
      'network',
      'técnico',
      'servicio no disponible',
      'temporalmente',
      'unavailable',
    ];

    return technicalKeywords.some(keyword => errorMessage.includes(keyword));
  }

mapToDto(cpeData: any): FacturaDto {
    const dto: FacturaDto & { documento_id?: string | null; documentoId?: string | null } = {
      id: cpeData.id,
      documento_id: cpeData.documento_id ?? null,
      documentoId: cpeData.documento_id ?? null,
      tipo_documento: cpeData.tipo_documento,
      serie: cpeData.serie,
      numero: cpeData.numero,
      ruc_emisor: cpeData.ruc_emisor,
      razon_social_emisor: cpeData.razon_social_emisor,
      tipo_documento_receptor: cpeData.tipo_documento_receptor,
      documento_receptor: cpeData.documento_receptor,
      razon_social_receptor: cpeData.razon_social_receptor,
      direccion_receptor: cpeData.direccion_receptor,
      moneda: cpeData.moneda,
      items: cpeData.items,
      total_gravadas: parseFloat(cpeData.total_gravadas),
      total_igv: parseFloat(cpeData.total_igv),
      total_venta: parseFloat(cpeData.total_venta),
      estado: cpeData.estado,
      hash: cpeData.hash,
      xml_firmado: cpeData.xml_firmado,
      cdr_sunat: cpeData.cdr_sunat,
      error_message: cpeData.error_message,
      tenant_id: cpeData.tenant_id,
      created_at: new Date(cpeData.created_at),
      updated_at: new Date(cpeData.updated_at),
    };

    return dto;
  }

pickFirstNonEmpty(values: Array<string | null | undefined>, fallback = ''): string {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
    return fallback;
  }
}
