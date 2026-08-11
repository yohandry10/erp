import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

  private readonly defaultDeliveryOptions = {
    origin: 'USER' as const,
  };

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

async resendToOse(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    return this.sendToOse(id, tenantId, options);
  }

async sendToOseManual(
    id: string,
    _xmlFirmado: string,
    _fileName: string,
    options: {
      tenantId: string;
      idempotencyKey?: string;
      actorId?: string;
      origin?: 'USER' | 'WORKER' | 'SYSTEM';
    },
  ) {
    return this.sendToOse(id, options.tenantId, options);
  }

async checkOseStatus(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    const origin = options?.origin ?? this.defaultDeliveryOptions.origin;
    const idempotencyKey = String(options?.idempotencyKey ?? '').trim()
      || `cpe.query:${tenantId}:${id}:${Math.floor(Date.now() / 300_000)}`;
    const claim = await this.reserveOperation('reservar_consulta_cpe_tx', {
      p_tenant_id: tenantId,
      p_actor_id: options?.actorId ?? null,
      p_cpe_id: id,
      p_idempotency_key: idempotencyKey,
      p_origin: origin,
    });
    if (!claim.claimed) {
      return this.deliveryResult(claim);
    }

    const cpe = claim.cpe;
    try {
      const response = await this.fiscalAdapter.consultarEstado(
        tenantId,
        cpe.tipo_documento,
        cpe.serie,
        String(cpe.numero),
        cpe.hash,
      );
      const resultKind = response.success
        ? (String(response.cdr ?? '').trim() ? 'ACCEPTED' : 'PENDING')
        : (this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta)
          ? 'TECHNICAL_ERROR'
          : 'REJECTED');
      const finalized = await this.finalizeOperation('finalizar_consulta_cpe_tx', claim, resultKind, response);
      if (resultKind === 'REJECTED') {
        throw new BadRequestException(
          `SUNAT/OSE rechazó la consulta: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
        );
      }
      if (resultKind === 'TECHNICAL_ERROR') {
        throw new ServiceUnavailableException(response.descripcionRespuesta || 'Consulta fiscal temporalmente no disponible');
      }
      return this.deliveryResult(finalized);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      await this.finalizeTechnicalException('finalizar_consulta_cpe_tx', claim, error);
      throw new ServiceUnavailableException(`No se pudo consultar SUNAT/OSE: ${this.errorMessage(error)}`);
    }
  }

async retrySendToOse(
    cpeId: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    return this.sendToOse(cpeId, tenantId, options);
  }

  async sendToOse(
    cpeId: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    const origin = options?.origin ?? this.defaultDeliveryOptions.origin;
    const idempotencyKey = String(options?.idempotencyKey ?? '').trim()
      || `cpe.send:${tenantId}:${cpeId}`;
    const claim = await this.reserveOperation('reservar_envio_cpe_tx', {
      p_tenant_id: tenantId,
      p_actor_id: options?.actorId ?? null,
      p_cpe_id: cpeId,
      p_idempotency_key: idempotencyKey,
      p_origin: origin,
    });
    if (!claim.claimed) {
      return this.deliveryResult(claim);
    }

    const cpeData = claim.cpe;
    try {
      const servicioFiscal = await this.fiscalAdapter.obtenerNombreServicioFiscal(tenantId);
      this.logger.log(`Enviando CPE ${cpeId} a ${servicioFiscal} (claim ${claim.operation.id})`);
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
        xmlContent: cpeData.xml_firmado,
      };

      const response = await this.fiscalAdapter.enviarDocumento(documento, tenantId);
      const resultKind = response.success
        ? (String(response.cdr ?? '').trim() ? 'ACCEPTED' : 'PENDING')
        : (this.isTechnicalError(response.codigoRespuesta, response.descripcionRespuesta)
          ? 'TECHNICAL_ERROR'
          : 'REJECTED');
      const finalized = await this.finalizeOperation('finalizar_envio_cpe_tx', claim, resultKind, response);
      if (resultKind === 'REJECTED') {
        throw new BadRequestException(
          `${servicioFiscal} rechazó el comprobante: ${response.codigoRespuesta}: ${response.descripcionRespuesta}`,
        );
      }
      if (resultKind === 'TECHNICAL_ERROR') {
        throw new ServiceUnavailableException(response.descripcionRespuesta || `${servicioFiscal} no está disponible`);
      }
      return this.deliveryResult(finalized);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      await this.finalizeTechnicalException('finalizar_envio_cpe_tx', claim, error);
      throw new ServiceUnavailableException(`No se pudo enviar a SUNAT/OSE: ${this.errorMessage(error)}`);
    }
  }

  private async reserveOperation(rpc: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc(rpc, args);
    if (error) {
      throw new BadRequestException(`No se pudo reservar la operación fiscal: ${error.message}`);
    }
    const claim = Array.isArray(data) ? data[0] : data;
    if (!claim?.cpe || (claim.claimed && (!claim.operation?.id || !claim.operation?.claim_token))) {
      throw new BadRequestException('La reserva fiscal devolvió una respuesta incompleta');
    }
    return claim;
  }

  private async finalizeOperation(
    rpc: string,
    claim: any,
    resultKind: 'ACCEPTED' | 'PENDING' | 'TECHNICAL_ERROR' | 'REJECTED',
    response: any,
  ): Promise<any> {
    const { data, error } = await this.supabaseService.getClient().rpc(rpc, {
      p_tenant_id: claim.cpe.tenant_id,
      p_operation_id: claim.operation.id,
      p_claim_token: claim.operation.claim_token,
      p_result_kind: resultKind,
      p_response_code: String(response?.codigoRespuesta ?? (resultKind === 'PENDING' ? 'PENDING' : 'UNKNOWN')),
      p_description: String(response?.descripcionRespuesta ?? resultKind),
      p_cdr: response?.cdr ?? null,
      p_external_hash: response?.hash ?? null,
      p_external_number: response?.numeroComprobante ?? null,
      p_response_summary: {
        success: Boolean(response?.success),
        hasCdr: Boolean(String(response?.cdr ?? '').trim()),
        resultKind,
      },
    });
    if (error) {
      throw new Error(`No se pudo finalizar la operación fiscal: ${error.message}`);
    }
    return Array.isArray(data) ? data[0] : data;
  }

  private async finalizeTechnicalException(rpc: string, claim: any, error: unknown): Promise<void> {
    await this.finalizeOperation(rpc, claim, 'TECHNICAL_ERROR', {
      success: false,
      codigoRespuesta: 'EXTERNAL_EXCEPTION',
      descripcionRespuesta: this.errorMessage(error),
    });
  }

  private deliveryResult(payload: any) {
    const operation = payload?.operation ?? null;
    const cpe = payload?.cpe ?? null;
    return {
      success: true,
      claimed: Boolean(payload?.claimed),
      idempotent: Boolean(payload?.idempotent),
      reason: payload?.reason ?? null,
      operationId: operation?.id ?? null,
      resultKind: operation?.result_kind ?? null,
      cpe,
      estado: cpe?.estado ?? null,
      codigoSunat: operation?.response_code ?? null,
      descripcionSunat: operation?.error_message ?? null,
      timestamp: new Date(),
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'Error fiscal desconocido');
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
