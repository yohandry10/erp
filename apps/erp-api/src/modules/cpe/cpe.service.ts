import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateFacturaDto, FacturaDto, PaginationDto, PaginatedResponseDto } from '@erp-suite/dtos';
import { XmlSigner } from '@erp-suite/crypto';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../shared/events/event-bus.service';
import { ValidationService } from '../validations/validation.service';
import { Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { CpeXmlBuilder } from './cpe-xml.builder';
import { CpeCertificateService } from './cpe-certificate.service';
import { CpeReportingService } from './cpe-reporting.service';
import { CpeCancellationService } from './cpe-cancellation.service';
import { CpeDeliveryService } from './cpe-delivery.service';
import { CpeOperationalDocumentService } from './cpe-operational-document.service';
import { CpeRegistrationService } from './cpe-registration.service';
import { DocumentoFiscal } from '../documentos/interfaces/documento-fiscal.interface';

@Injectable()
export class CpeService {
  private readonly logger = new Logger(CpeService.name);
  private readonly xmlBuilder = new CpeXmlBuilder();
  private readonly certificateService: CpeCertificateService;
  private readonly reportingService: CpeReportingService;
  private readonly cancellationService: CpeCancellationService;
  private readonly deliveryService: CpeDeliveryService;
  private readonly operationalDocumentService: CpeOperationalDocumentService;
  private readonly registrationService: CpeRegistrationService;
  private readonly sunatStatuses = {
    NOT_SENT: 'NOT_SENT',
    READY: 'READY',
    SENDING: 'SENDING',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
  } as const;
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBusService,
    private readonly validationService: ValidationService,
    private readonly auditService: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly fiscalAdapter: FiscalAdapterService, // 🌍 Adaptador multi-país
  ) {
    this.certificateService = new CpeCertificateService(supabaseService, configService);
    this.reportingService = new CpeReportingService(supabaseService);
    this.cancellationService = new CpeCancellationService(supabaseService, auditService);
    this.deliveryService = new CpeDeliveryService(supabaseService, fiscalAdapter, pdfGenerator, this.certificateService);
    this.operationalDocumentService = new CpeOperationalDocumentService(
      supabaseService,
      configService,
      this.deliveryService,
      this.xmlBuilder,
    );
    this.registrationService = new CpeRegistrationService(
      supabaseService,
      eventBus,
      auditService,
      cacheInvalidation,
      this.operationalDocumentService,
      this.xmlBuilder,
    );
  }
  /**
   * Obtiene el XmlSigner configurado para el tenant
   * Si el tenant tiene certificado propio, lo usa. Si no, usa la configuración global válida.
   */
private async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    return this.certificateService.getXmlSigner(tenantId);
  }



  private recalculateTotals(createFacturaDto: CreateFacturaDto) {
    if (!Array.isArray(createFacturaDto.items) || createFacturaDto.items.length === 0) {
      throw new BadRequestException('El comprobante debe incluir al menos un ítem');
    }

    const sanitizeNumber = (n: any) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return 0;
      return num;
    };

    let subtotal = 0;
    let totalIgv = 0;

    for (const item of createFacturaDto.items) {
      const cantidad = sanitizeNumber((item as any).cantidad);
      const precioUnitario = sanitizeNumber((item as any).precio_unitario ?? (item as any).precioUnitario);
      const valorVenta = sanitizeNumber((item as any).valor_venta ?? (item as any).valorVenta ?? precioUnitario * cantidad);
      const igvItem = sanitizeNumber((item as any).impuesto_igv ?? (item as any).igv ?? 0);

      if (cantidad <= 0) {
        throw new BadRequestException('Cada ítem debe tener cantidad > 0');
      }
      if (precioUnitario < 0) {
        throw new BadRequestException('El precio unitario no puede ser negativo');
      }

      subtotal += valorVenta;
      totalIgv += igvItem;
    }

    const total = subtotal + totalIgv;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      totalIgv: Number(totalIgv.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  private assertProvidedTotalsMatch(dto: CreateFacturaDto, calculated: { subtotal: number; totalIgv: number; total: number }) {
    const fields: Array<[string, any, number]> = [
      ['total_gravadas', (dto as any).total_gravadas, calculated.subtotal],
      ['total_igv', (dto as any).total_igv, calculated.totalIgv],
      ['total_venta', (dto as any).total_venta, calculated.total],
    ];

    for (const [field, provided, expected] of fields) {
      if (provided === undefined || provided === null || provided === '') continue;
      const numeric = Number(provided);
      if (!Number.isFinite(numeric)) {
        throw new BadRequestException(`El campo ${field} debe ser numérico`);
      }
      const providedCents = Math.round(numeric * 100);
      const expectedCents = Math.round(expected * 100);
      if (Math.abs(providedCents - expectedCents) > 1) {
        throw new BadRequestException(
          `Totales inconsistentes para CPE: ${field}=${numeric.toFixed(2)} no coincide con el total calculado ${expected.toFixed(2)}`,
        );
      }
    }
  }

  private assertReceptorValido(dto: CreateFacturaDto) {
    const tipo = String((dto as any).tipo_documento_receptor ?? '').trim();
    const documento = String((dto as any).documento_receptor ?? '').trim();
    const tipoDocumento = String((dto as any).tipo_documento ?? '').trim();

    if (!tipo || !documento) {
      throw new BadRequestException('El receptor del CPE requiere tipo y número de documento');
    }

    if (tipo === '6' && !/^\d{11}$/.test(documento)) {
      throw new BadRequestException('El RUC del receptor debe tener 11 dígitos');
    }

    if (tipo === '1' && !/^\d{8}$/.test(documento)) {
      throw new BadRequestException('El DNI del receptor debe tener 8 dígitos');
    }

    if (tipoDocumento === '01' && tipo !== '6') {
      throw new BadRequestException('La factura requiere receptor con RUC');
    }
  }

  /**
   * Normaliza el certificado recibido desde Supabase (puede llegar como base64, Buffer JSON o ArrayBuffer)
   */




  /** Mapea el estado del CPE al estado del documento operativo del módulo Documentos. */





  /**
   * Garantiza que exista un documento operativo real e idempotente para el CPE.
   * No usa el ID del CPE como sustituto de factura/documento.
   */
  private async ensureDocumentoParaCpe(cpeRecord: any, tenantId: string): Promise<string | null> {
    return this.operationalDocumentService.ensureDocumentoParaCpe(cpeRecord, tenantId);
  }

  private mapCpeEstadoADocumento(cpeEstado?: string | null): string {
    return this.operationalDocumentService.mapCpeEstadoADocumento(cpeEstado);
  }

private async getEmpresaEmisorInfo(tenantId: string) {
    return this.deliveryService.getEmpresaEmisorInfo(tenantId);
  }

private getEmpresaEmisorInfoStrict(tenantId: string) {
    return this.registrationService.getEmpresaEmisorInfoStrict(tenantId);
  }

  async create(createFacturaDto: CreateFacturaDto, tenantId: string, userId?: string): Promise<FacturaDto> {
    try {
      const supabaseClient = this.supabaseService.getClient();
      const eventId = randomUUID();
      const emissionDate = this.resolveEmissionDate((createFacturaDto as any).fecha_emision);
      const issueTime = this.resolveIssueTime((createFacturaDto as any).fecha_emision);
      const dueDate = this.resolveDueDate(emissionDate, (createFacturaDto as any).fecha_vencimiento);
      const { subtotal, totalIgv, total } = this.recalculateTotals(createFacturaDto);
      this.assertProvidedTotalsMatch(createFacturaDto, { subtotal, totalIgv, total });
      this.assertReceptorValido(createFacturaDto);
      const idempotencyKey = this.resolveIdempotencyKey(createFacturaDto, tenantId);

      // Reemplazar totales con cálculo servidor
      (createFacturaDto as any).total_gravadas = subtotal;
      (createFacturaDto as any).total_igv = totalIgv;
      (createFacturaDto as any).total_venta = total;

      (createFacturaDto as any).fecha_emision = emissionDate;
      (createFacturaDto as any).hora_emision = issueTime;
      (createFacturaDto as any).fecha_vencimiento = dueDate;
      (createFacturaDto as any).idempotency_key = idempotencyKey;

      const { data: existingCpe, error: existingCpeError } = await supabaseClient
        .from('cpe')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingCpeError && existingCpeError.code && existingCpeError.code !== 'PGRST116') {
        this.logger.error(`❌ [CPE] Error verificando idempotencia: ${existingCpeError.message}`, existingCpeError);
        throw new BadRequestException('No se pudo validar idempotencia del comprobante');
      }

      if (existingCpe) {
        this.logger.warn(`♻️ [CPE] Solicitud idempotente detectada para ${idempotencyKey}, retornando CPE existente ${existingCpe.id}`);
        return this.mapToDto(existingCpe);
      }

      // ===== PRE-EMISSION VALIDATIONS =====
      this.logger.log(`Starting pre-emission validations for tenant: ${tenantId}`);

      // 1. Validate certificate
      const certificateValidation = await this.validationService.validateCertificate(tenantId);
      if (!certificateValidation.isValid) {
        this.logger.error(`Certificate validation failed: ${certificateValidation.errors.join(', ')}`);
        throw new BadRequestException({
          message: 'No se puede emitir el CPE: Certificado digital inválido',
          errors: certificateValidation.errors,
          code: 'CERT_VALIDATION_FAILED',
        });
      }

      // Log certificate warnings (expiring soon)
      if (certificateValidation.warnings.length > 0) {
        this.logger.warn(`Certificate warnings: ${certificateValidation.warnings.join(', ')}`);
      }

      // 2. Validate RUC configuration
      const rucValidation = await this.validationService.validateRucConfiguration(tenantId);
      if (!rucValidation.isValid) {
        this.logger.error(`RUC validation failed: ${rucValidation.errors.join(', ')}`);
        throw new BadRequestException({
          message: 'No se puede emitir el CPE: Configuración de RUC incompleta',
          errors: rucValidation.errors,
          missingFields: rucValidation.missingFields,
          code: 'RUC_VALIDATION_FAILED',
        });
      }

      // 3. Validate document format and fiscal limits (multi-country)
      const documentValidation = await this.validationService.validateDocumentBeforeEmission(
        {
          items: createFacturaDto.items || [],
          total: createFacturaDto.total_venta,
          serie: createFacturaDto.serie,
          correlativo: createFacturaDto.numero?.toString(),
          tipoDocumento: createFacturaDto.tipo_documento,
        },
        tenantId // 🌍 Pasar tenantId para validaciones por país
      );

      if (!documentValidation.isValid) {
        this.logger.error(`Document validation failed: ${documentValidation.errors.length} errors`);
        throw new BadRequestException({
          message: 'No se puede emitir el CPE: El documento no cumple con las validaciones fiscales',
          errors: documentValidation.errors.map(e => e.message),
          validationErrors: documentValidation.errors,
          code: 'DOCUMENT_VALIDATION_FAILED',
        });
      }

      // Log document warnings
      if (documentValidation.warnings.length > 0) {
        this.logger.warn(`Document warnings: ${documentValidation.warnings.map(w => w.message).join(', ')}`);
      }

      this.logger.log('✅ All pre-emission validations passed');
      // ===== END PRE-EMISSION VALIDATIONS =====

      // Obtener XmlSigner del tenant
      const xmlSigner = await this.getXmlSigner(tenantId);
      
      // Generate XML content
      const xmlContent = this.generateXmlContent(createFacturaDto);
      
      // Sign XML with tenant's certificate
      const signedXml = xmlSigner.signXml(xmlContent);
      const hash = xmlSigner.generateHash(signedXml);

      // Prepare data for database (con totales recalculados server-side)
      const cpeData = {
        tenant_id: tenantId,
        tipo_documento: createFacturaDto.tipo_documento,
        serie: createFacturaDto.serie,
        numero: createFacturaDto.numero,
        ruc_emisor: createFacturaDto.ruc_emisor,
        razon_social_emisor: createFacturaDto.razon_social_emisor,
        tipo_documento_receptor: createFacturaDto.tipo_documento_receptor,
        documento_receptor: createFacturaDto.documento_receptor,
        razon_social_receptor: createFacturaDto.razon_social_receptor,
        cliente_id: (createFacturaDto as any).cliente_id ?? null,
        direccion_receptor: createFacturaDto.direccion_receptor,
        moneda: createFacturaDto.moneda,
        total_gravadas: createFacturaDto.total_gravadas,
        total_igv: createFacturaDto.total_igv,
        total_venta: createFacturaDto.total_venta,
        items: createFacturaDto.items,
        fecha_emision: emissionDate,
        fecha_vencimiento: dueDate,
        idempotency_key: idempotencyKey,
        event_id: eventId,
        estado: 'FIRMADO',
        hash: hash,
        hash_firma: hash,
        sunat_status: this.sunatStatuses.NOT_SENT,
        xml_firmado: signedXml,
      };

      // Insert into database
      const { data, error } = await supabaseClient
        .from('cpe')
        .insert(cpeData)
        .select()
        .single();

      if (error) {
        if (error.code === '23505' && String(error.message || '').includes('idempotency')) {
          const { data: racedCpe, error: racedLookupError } = await supabaseClient
            .from('cpe')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (!racedLookupError && racedCpe) {
            this.logger.warn(
              `♻️ [CPE] Carrera idempotente detectada para ${idempotencyKey}, retornando CPE existente ${racedCpe.id}`,
            );
            return this.mapToDto(racedCpe);
          }
        }

        console.error('Database error:', error);
        throw new BadRequestException('Error creating CPE: ' + error.message);
      }

      if (!data) {
        throw new BadRequestException('No data returned from database insert');
      }

      const createdCpe = Array.isArray(data) ? data[0] : data;
      const documentoId = await this.ensureDocumentoParaCpe(createdCpe, tenantId);

      if (documentoId) {
        (createdCpe as any).documento_id = documentoId;
      }

      // Generar XML firmado (sin enviar a SUNAT todavía)
      const preparedForSunat = await this.prepareXmlForSunat((createdCpe as any).id, xmlContent, tenantId);

      // ℹ️ NO ENVIAR AUTOMÁTICAMENTE - El usuario debe enviar manualmente desde el módulo CPE
      console.log('ℹ️ CPE creado y firmado. Estado: FIRMADO (listo para envío manual a SUNAT)');

      // Emitir evento de comprobante creado para finanzas
      const requiereTransporte = this.evaluarSiRequiereTransporte(createFacturaDto);
      const cpeId = (createdCpe as any).id;
      const documentoReferenciaId = (createdCpe as any).documento_id ?? documentoId ?? null;

      if (!documentoReferenciaId) {
        throw new BadRequestException(`CPE ${cpeId} no tiene documento operativo asociado`);
      }

      const comprobanteCreadoEventId = randomUUID();
      const comprobanteCreadoIdempotencyKey = `cpe.creado:${tenantId}:${cpeId}`;

      await this.eventBus.emitComprobanteCreadoEvent({
        eventId: comprobanteCreadoEventId,
        tenantId,
        idempotencyKey: comprobanteCreadoIdempotencyKey,
        cpeId: cpeId,
        tipoDocumento: createFacturaDto.tipo_documento,
        serie: createFacturaDto.serie,
        numero: createFacturaDto.numero,
        clienteId: (createFacturaDto as any).cliente_id ?? createFacturaDto.documento_receptor,
        total: createFacturaDto.total_venta,
        esCredito: (createFacturaDto as any).condicion_pago === 'CREDITO' || (createFacturaDto as any).es_credito === true,
        ventaId: undefined, // Se puede agregar referencia si viene de POS
        requiereTransporte: requiereTransporte,
        moneda: createFacturaDto.moneda,
      });

      const sunatStatusForEvent = preparedForSunat ? this.sunatStatuses.READY : this.sunatStatuses.ERROR;

      await this.eventBus.emitFacturaEmitidaEvent({
        eventId,
        tenantId,
        idempotencyKey,
        cpeId,
        facturaId: documentoReferenciaId,
        serie: createFacturaDto.serie,
        numero: String(createFacturaDto.numero),
        clienteId: (createFacturaDto as any).cliente_id ?? createFacturaDto.documento_receptor,
        subtotal: createFacturaDto.total_gravadas,
        impuestos: createFacturaDto.total_igv,
        total: createFacturaDto.total_venta,
        moneda: createFacturaDto.moneda,
        fechaEmision: emissionDate,
        fechaVencimiento: dueDate,
        source: 'cpe.api',
        // Solo las ventas a crédito generan cuenta por cobrar. Una boleta/factura
        // pagada al contado (POS/efectivo) no es una deuda del cliente.
        esCredito:
          (createFacturaDto as any).condicion_pago === 'CREDITO' ||
          (createFacturaDto as any).es_credito === true,
        sunatStatus: sunatStatusForEvent,
        hashFirma: hash,
        hash: hash,
      });

      // Evaluar si necesita guía de remisión automática
      if (requiereTransporte) {
        console.log(`🚚 [CPE] CPE ${cpeId} requiere transporte (Total: S/ ${createFacturaDto.total_venta}), emitiendo evento...`);
        
        const eventData = {
          cpeId: cpeId,
          tenantId: tenantId,
          tenant_id: tenantId, // compatibilidad legado
          clienteId: createFacturaDto.documento_receptor,
          total: createFacturaDto.total_venta,
          productos: createFacturaDto.items || []
        };
        
        console.log(`🚚 [CPE] Datos del evento a emitir:`, eventData);
        
        this.eventBus.emit('cpe.requiere_transporte', eventData, 'cpe');
        
        console.log(`✅ [CPE] Evento cpe.requiere_transporte emitido para CPE ${cpeId}`);
      } else {
        console.log(`ℹ️ [CPE] CPE ${cpeId} no requiere transporte (Total: S/ ${createFacturaDto.total_venta})`);
      }

      // Registrar auditoría (el userId se podría obtener del contexto si está disponible)
      try {
        await this.auditService.registrarCambio(
          'cpe',
          'INSERT',
          userId ?? null,
          {
            new: {
              tipo_documento: createFacturaDto.tipo_documento,
              serie: createFacturaDto.serie,
              numero: createFacturaDto.numero,
              total_venta: createFacturaDto.total_venta,
              estado: 'FIRMADO'
            }
          },
          tenantId,
          cpeId,
          { accion: 'CREAR_CPE', tipo_documento: createFacturaDto.tipo_documento }
        );
      } catch (error) {
        console.warn('⚠️ No se pudo registrar auditoría de creación de CPE:', error);
      }

      // Invalidar cache del dashboard automáticamente
      try {
        await this.cacheInvalidation.onCpeCreated(tenantId);
      } catch (error) {
        this.logger.warn('⚠️ No se pudo invalidar cache después de crear CPE:', error);
      }

      let persistedCpeRecord = createdCpe;

      try {
        const { data: refreshedCpe, error: refreshError } = await supabaseClient
          .from('cpe')
          .select('*')
          .eq('id', cpeId)
          .single();

        if (!refreshError && refreshedCpe) {
          persistedCpeRecord = refreshedCpe;
        } else {
          persistedCpeRecord = {
            ...createdCpe,
            sunat_status: sunatStatusForEvent,
            hash_firma: hash,
            fecha_emision: emissionDate,
            fecha_vencimiento: dueDate,
            idempotency_key: idempotencyKey,
            event_id: eventId,
            documento_id: documentoReferenciaId ?? (createdCpe as any).documento_id ?? null,
          };
        }
      } catch (refreshError) {
        this.logger.warn(`⚠️ [CPE] No se pudo refrescar CPE ${cpeId} desde Supabase:`, refreshError);
        persistedCpeRecord = {
          ...createdCpe,
          sunat_status: sunatStatusForEvent,
          hash_firma: hash,
          fecha_emision: emissionDate,
          fecha_vencimiento: dueDate,
          idempotency_key: idempotencyKey,
          event_id: eventId,
          documento_id: documentoReferenciaId ?? (createdCpe as any).documento_id ?? null,
        };
      }

      return this.mapToDto(persistedCpeRecord);
    } catch (error) {
      console.error('Error in CpeService.create:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error creating CPE');
    }
  }

  async createFromComprobantePayload(payload: any, tenantId: string, userId?: string): Promise<FacturaDto> {
    const tipoDocumento = this.normalizeTipoDocumentoSunat(
      payload?.tipo_documento ?? payload?.tipoComprobante ?? payload?.tipo_comprobante,
    );
    const serie = String(payload?.serie || this.defaultSerieForTipo(tipoDocumento)).trim().toUpperCase();
    const numero = await this.resolveNumeroCpe(tenantId, tipoDocumento, serie, payload?.numero ?? payload?.correlativo);
    const emisor = await this.getEmpresaEmisorInfoStrict(tenantId);
    const documentoReceptor = String(
      payload?.documento_receptor ?? payload?.clienteRuc ?? payload?.clienteDocumento ?? '',
    ).replace(/\D/g, '');
    const tipoDocumentoReceptor = this.resolveTipoDocumentoReceptor(
      tipoDocumento,
      payload?.tipo_documento_receptor ?? payload?.clienteTipoDocumento,
      documentoReceptor,
    );
    const razonSocialReceptor = String(
      payload?.razon_social_receptor ?? payload?.clienteRazonSocial ?? payload?.clienteNombre ?? '',
    ).trim();
    if (!razonSocialReceptor) {
      throw new BadRequestException('El receptor del CPE requiere razón social o nombre');
    }

    const items = this.normalizeComprobanteItems(payload?.items);
    const totalGravadas = this.roundMoney(
      payload?.total_gravadas ?? payload?.subtotal ?? items.reduce((sum, item) => sum + item.valor_venta, 0),
    );
    const totalIgv = this.roundMoney(
      payload?.total_igv ?? payload?.totalIgv ?? items.reduce((sum, item) => sum + item.igv, 0),
    );
    const totalVenta = this.roundMoney(payload?.total_venta ?? payload?.total ?? totalGravadas + totalIgv);

    const dto: CreateFacturaDto = {
      tipo_documento: tipoDocumento as any,
      serie,
      numero,
      ruc_emisor: emisor.ruc,
      razon_social_emisor: emisor.razonSocial,
      tipo_documento_receptor: tipoDocumentoReceptor,
      documento_receptor: documentoReceptor,
      razon_social_receptor: razonSocialReceptor,
      direccion_receptor: payload?.direccion_receptor ?? payload?.clienteDireccion ?? '',
      moneda: payload?.moneda || 'PEN',
      items,
      total_gravadas: totalGravadas,
      total_igv: totalIgv,
      total_venta: totalVenta,
      fecha_emision: payload?.fecha_emision ?? payload?.fechaEmision,
      fecha_vencimiento: payload?.fecha_vencimiento ?? payload?.fechaVencimiento,
      idempotency_key:
        payload?.idempotency_key ??
        payload?.idempotencyKey ??
        `cpe.ui:${tenantId}:${tipoDocumento}:${serie}:${numero}`,
    } as CreateFacturaDto;

    return this.create(dto, tenantId, userId);
  }

async registerDesktopSignedXml(payload: any, tenantId: string, userId?: string) {
    return this.registrationService.registerDesktopSignedXml(payload, tenantId, userId);
  }



  async crearCPEDesdeDocumento(documento: DocumentoFiscal, tenantId: string) {
    const client = this.supabaseService.getClient();
    const idempotencyKey = `doc.cpe:${documento.id}`;
    const eventId = randomUUID();

    const { data: existente, error: existenteError } = await client
      .from('cpe')
      .select('*')
      .eq('documento_id', documento.id)
      .maybeSingle();

    if (existenteError && existenteError.code && existenteError.code !== 'PGRST116') {
      throw new BadRequestException('No se pudo validar CPE existente para el documento');
    }

    if (existente) {
      return existente;
    }

    const tipoDocumentoSunat = this.normalizeTipoDocumentoSunat(documento.tipo_documento);
    const correlativo = Number(documento.numero);
    const xmlBase = this.buildXmlFromDocumentoFiscal(documento);
    const xmlSigner = await this.getXmlSigner(tenantId);
    const xmlFirmado = xmlSigner.signXml(xmlBase);
    const hash = xmlSigner.generateHash(xmlFirmado);

    const cpePayload = {
      tenant_id: tenantId,
      documento_id: documento.id,
      tipo_documento: tipoDocumentoSunat,
      serie: documento.serie,
      numero: Number.isNaN(correlativo) ? 0 : correlativo,
      fecha_emision: documento.fecha_emision,
      fecha_vencimiento: documento.fecha_vencimiento,
      cliente_id: documento.cliente_id,
      tipo_documento_receptor: documento.cliente.documento_tipo,
      documento_receptor: documento.cliente.numero_documento,
      razon_social_receptor: documento.cliente.razon_social,
      direccion_receptor: documento.cliente.direccion,
      ruc_emisor: documento.emisor.ruc,
      razon_social_emisor: documento.emisor.razon_social,
      moneda: documento.moneda,
      total_gravadas: documento.subtotal,
      total_igv: documento.impuesto_igv,
      total_venta: documento.total,
      items: documento.detalles.map((detalle) => ({
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        valor_venta: detalle.valor_venta,
        impuesto_igv: detalle.impuesto_igv,
        total: detalle.total_item,
      })),
      event_id: eventId,
      idempotency_key: idempotencyKey,
      estado: 'FIRMADO',
      xml_content: xmlBase,
      xml_firmado: xmlFirmado,
      hash,
      hash_firma: hash,
      hash_code: hash,
      sunat_status: this.sunatStatuses.READY,
      estado_sunat: 'PENDIENTE',
    };

    const { data, error } = await client.from('cpe').insert(cpePayload).select().single();

    if (error) {
      console.error('❌ [CPE] Error creando CPE desde documento:', error);
      throw new BadRequestException('No se pudo crear el CPE desde el documento');
    }

    const requiereTransporte = this.evaluarSiRequiereTransporte({
      total_venta: documento.total,
    } as CreateFacturaDto);

    const comprobanteCreadoEventId = randomUUID();
    const comprobanteCreadoIdempotencyKey = `cpe.creado:${tenantId}:${data.id}`;

    await this.eventBus.emitComprobanteCreadoEvent({
      eventId: comprobanteCreadoEventId,
      tenantId,
      idempotencyKey: comprobanteCreadoIdempotencyKey,
      cpeId: data.id,
      tipoDocumento: tipoDocumentoSunat,
      serie: documento.serie,
      numero: correlativo,
      clienteId: documento.cliente.numero_documento,
      total: documento.total,
      esCredito: true,
      ventaId: documento.pedido_id ?? undefined,
      requiereTransporte,
      moneda: documento.moneda,
    });

    await this.eventBus.emitFacturaEmitidaEvent({
      eventId,
      tenantId,
      idempotencyKey,
      cpeId: data.id,
      facturaId: documento.id,
      serie: documento.serie,
      numero: documento.numero,
      clienteId: documento.cliente.numero_documento,
      subtotal: documento.subtotal,
      impuestos: documento.impuesto_igv,
      total: documento.total,
      moneda: documento.moneda,
      fechaEmision: documento.fecha_emision,
      fechaVencimiento: documento.fecha_vencimiento,
      source: 'ventas.pedidos',
      sunatStatus: this.sunatStatuses.READY,
      hashFirma: hash,
      hash,
      pedidoId: documento.pedido_id ?? undefined,
    });

    try {
      await this.cacheInvalidation.onCpeCreated(tenantId);
    } catch (cacheError) {
      this.logger.warn('⚠️ [CPE] No se pudo invalidar cache tras crear CPE desde documento:', cacheError);
    }

    return data;
  }

  async findAll(paginationDto: PaginationDto, tenantId: string): Promise<PaginatedResponseDto<FacturaDto>> {
    try {
      const { page, limit, offset } = paginationDto;

      // Get total count
      const { count } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Get paginated data
      const { data, error } = await this.supabaseService
        .getClient()
        .from('cpe')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new BadRequestException('Error fetching CPEs: ' + error.message);
      }

      const cpes = data.map(cpe => this.mapToDto(cpe));

      return new PaginatedResponseDto(cpes, count || 0, page, limit);
    } catch (error) {
      console.error('Error in CpeService.findAll:', error);
      throw new BadRequestException('Error fetching CPEs');
    }
  }

async findOne(id: string, tenantId: string): Promise<FacturaDto> {
    return this.deliveryService.findOne(id, tenantId);
  }

async getCpeById(id: string, tenantId: string): Promise<any> {
    return this.deliveryService.getCpeById(id, tenantId);
  }

async generatePdf(id: string, tenantId: string): Promise<Buffer> {
    return this.deliveryService.generatePdf(id, tenantId);
  }

async getSignedXml(id: string, tenantId: string): Promise<string> {
    return this.deliveryService.getSignedXml(id, tenantId);
  }

async resendToOse(id: string, tenantId: string, options?: { idempotencyKey?: string }) {
    return this.deliveryService.resendToOse(id, tenantId, options);
  }

  /**
   * Enviar manualmente CPE firmado a SUNAT
   */
async sendToOseManual(
    id: string,
    xmlFirmado: string,
    fileName: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    return this.deliveryService.sendToOseManual(id, xmlFirmado, fileName, options);
  }

async checkOseStatus(id: string, tenantId: string) {
    return this.deliveryService.checkOseStatus(id, tenantId);
  }

  private buildXmlFromDocumentoFiscal(documento: DocumentoFiscal): string {
    return this.xmlBuilder.buildXmlFromDocumentoFiscal(documento);
  }

  /**
   * Preparar XML firmado para envío a SUNAT (sin enviar todavía)
   * 
   * NOTA: El envío automático a SUNAT está DESACTIVADO por ahora.
   * Para enviar manualmente usar el endpoint: POST /api/cpe/:id/enviar-sunat
   */
private async prepareXmlForSunat(cpeId: string, xmlContent: string, tenantId: string): Promise<boolean> {
    return this.deliveryService.prepareXmlForSunat(cpeId, xmlContent, tenantId);
  }

  /**
   * Reintentar envío de CPE (método público para SunatRetryService)
   */
async retrySendToOse(
    cpeId: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    return this.deliveryService.retrySendToOse(cpeId, options);
  }


  /**
   * 🔴 CRÍTICO FIX: Determina si un error de SUNAT es técnico (reintentable) o de validación (no reintentable)
   */

  private resolveEmissionDate(fechaEmision?: string): string {
    return this.xmlBuilder.resolveEmissionDate(fechaEmision);
  }

  private resolveDueDate(emissionDate: string, fechaVencimiento?: string): string {
    return this.xmlBuilder.resolveDueDate(emissionDate, fechaVencimiento);
  }

  private resolveIdempotencyKey(dto: CreateFacturaDto, tenantId: string): string {
    const provided = (dto as any).idempotency_key?.trim();
    if (provided) {
      return provided;
    }

    return `${tenantId}:${dto.tipo_documento}:${dto.serie}:${dto.numero}`;
  }





  private generateXmlContent(factura: CreateFacturaDto): string {
    return this.xmlBuilder.generateXmlContent(factura);
  }













  private resolveIssueTime(fechaEmision?: string): string {
    return this.xmlBuilder.resolveIssueTime(fechaEmision);
  }











  private evaluarSiRequiereTransporte(createFacturaDto: CreateFacturaDto): boolean {
    // Lógica para determinar si el comprobante requiere transporte
    
    // 1. Si el total es mayor a S/ 1000, probablemente requiere transporte
    if (createFacturaDto.total_venta > 1000) {
      return true;
    }
    
    // 2. Si tiene productos físicos (no servicios), requiere transporte
    // Por ahora, asumimos que todo comprobante > S/ 500 es producto físico
    if (createFacturaDto.total_venta > 500) {
      return true;
    }
    
    // 3. Verificar si el cliente tiene dirección diferente al emisor
    // (esto se podría implementar consultando la base de datos del cliente)
    
    // Por defecto, no requiere transporte para montos pequeños
    return false;
  }

  private mapToDto(cpeData: any): FacturaDto {
    return this.deliveryService.mapToDto(cpeData);
  }

  private pickFirstNonEmpty(values: Array<string | null | undefined>, fallback = ''): string {
    return this.deliveryService.pickFirstNonEmpty(values, fallback);
  }


async getComprobantesFromDatabase(filters: any = {}, tenantId?: string) {
    return this.reportingService.getComprobantesFromDatabase(filters, tenantId);
  }

async exportComprobantesCsv(filters: any = {}, tenantId?: string) {
    return this.reportingService.exportComprobantesCsv(filters, tenantId);
  }


  private normalizeTipoDocumentoSunat(
    tipo: string | null | undefined,
    throwOnUnknown = true,
  ): string {
    return this.xmlBuilder.normalizeTipoDocumentoSunat(tipo, throwOnUnknown);
  }

private defaultSerieForTipo(tipoDocumento: string): string {
    return this.registrationService.defaultSerieForTipo(tipoDocumento);
  }

private resolveNumeroCpe(tenantId: string, tipoDocumento: string, serie: string, provided?: any): Promise<number> {
    return this.registrationService.resolveNumeroCpe(tenantId, tipoDocumento, serie, provided);
  }

private resolveTipoDocumentoReceptor(tipoDocumento: string, provided: any, documento: string): string {
    return this.registrationService.resolveTipoDocumentoReceptor(tipoDocumento, provided, documento);
  }

private normalizeComprobanteItems(itemsInput: any): any[] {
    return this.registrationService.normalizeComprobanteItems(itemsInput);
  }

private roundMoney(value: any): number {
    return this.registrationService.roundMoney(value);
  }

async getStatsFromDatabase(tenantId?: string) {
    return this.reportingService.getStatsFromDatabase(tenantId);
  }

  /**
   * Anular un comprobante CPE
   * Genera nota de crédito y emite eventos para reversión de operaciones
   */
async anularComprobante(
    cpeId: string,
    motivo: string,
    tenantId: string,
    userId?: string,
    tipoNota: string = '01',
  ): Promise<any> {
    return this.cancellationService.anularComprobante(cpeId, motivo, tenantId, userId, tipoNota);
  }



private async assertCpeOriginalAccountingReady(
    client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
  ): Promise<void> {
    return this.cancellationService.assertCpeOriginalAccountingReady(client, tenantId, cpe, userId, motivo);
  }









  /**
   * Obtiene el siguiente número de nota de crédito
   */
}
