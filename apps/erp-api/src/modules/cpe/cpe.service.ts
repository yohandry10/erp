import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateFacturaDto, FacturaDto, PaginationDto, PaginatedResponseDto } from '@erp-suite/dtos';
import { XmlSigner } from '@erp-suite/crypto';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../shared/events/event-bus.service';
import { OseService } from '../ose/ose.service';
import { ValidationService } from '../validations/validation.service';
import { Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CacheInvalidationService } from '../../shared/cache/cache-invalidation.service';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import { PdfGeneratorService } from './pdf-generator.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { DocumentoFiscal } from '../documentos/interfaces/documento-fiscal.interface';
import { normalizeCertificateInput } from '../../shared/utils/certificate.utils';
import * as crypto from 'crypto';

@Injectable()
export class CpeService {
  private readonly logger = new Logger(CpeService.name);
  private readonly estadosAnulables = new Set(['FIRMADO', 'ACEPTADO', 'ENVIADO']);
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
    private readonly oseService: OseService,
    private readonly validationService: ValidationService,
    private readonly auditService: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly fiscalAdapter: FiscalAdapterService, // 🌍 Adaptador multi-país
  ) {}

  /**
   * Obtiene el XmlSigner configurado para el tenant
   * Si el tenant tiene certificado propio, lo usa. Si no, usa la configuración global válida.
   */
  private async getXmlSigner(tenantId: string): Promise<XmlSigner> {
    try {
      // Obtener certificado del tenant desde la BD
      const { data: empresa, error } = await this.supabaseService.getClient()
        .from('empresa_config')
        .select('certificado_pfx, certificado_password')
        .eq('tenant_id', tenantId)
        .single();

      const typedEmpresa = empresa as any;
      if (!error && typedEmpresa && typedEmpresa.certificado_pfx) {
        console.log('🔐 Usando certificado del tenant:', tenantId);

        const certificadoBuffer = this.normalizeCertificateBuffer(typedEmpresa.certificado_pfx, typedEmpresa.certificado_password);

        if (!certificadoBuffer || certificadoBuffer.length === 0) {
          this.logger.warn(
            `El certificado almacenado para el tenant ${tenantId} no tiene un formato válido (string/base64/Buffer). Se intentará fallback de configuración global.`,
          );
        } else {
          // Crear XmlSigner con el certificado del tenant
          return new XmlSigner({
            pfxBuffer: certificadoBuffer, // Buffer del certificado
            pfxPassword: this.decryptText(typedEmpresa.certificado_password) || '',
          });
        }
      }
    } catch (error) {
      console.warn('⚠️ Error obteniendo certificado del tenant:', error.message);
    }

    const demoSignerConfig = this.resolveDemoSignerConfig(tenantId);
    this.logger.warn(`🔐 Usando certificado de configuración global para tenant ${tenantId}`);

    return new XmlSigner(demoSignerConfig);
  }

  private resolveDemoSignerConfig(tenantId: string): { pfxPath: string; pfxPassword: string } {
    const pfxPath = this.configService.get<string>('PFX_PATH');
    const pfxPassword = this.configService.get<string>('PFX_PASS');

    if (!pfxPath || !pfxPassword) {
      throw new BadRequestException(
        `No hay configuración de certificado fiscal para el tenant ${tenantId}. ` +
          'Configure PFX_PATH y PFX_PASS para fallback global o cargue el certificado del tenant.',
      );
    }

    return { pfxPath, pfxPassword };
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
  private normalizeCertificateBuffer(certificado: any, encryptedPassword?: string): Buffer | null {
    const buffer = this.decryptCertificate(certificado);

    if (!buffer) {
      this.logger.warn('Formato de certificado no soportado o vacío');
    }

    return buffer;
  }

  private getCertKeys(): Buffer[] {
    const keys: Buffer[] = [];
    const main =
      this.configService.get<string>('CERT_ENCRYPTION_KEY') ??
      this.configService.get<string>('ENCRYPTION_KEY');
    const old = this.configService.get<string>('CERT_ENCRYPTION_KEY_OLD');

    if (main && main.length >= 32) {
      keys.push(crypto.createHash('sha256').update(main).digest());
    }
    if (old && old.length >= 32) {
      keys.push(crypto.createHash('sha256').update(old).digest());
    }

    if (!keys.length) {
      throw new Error('CERT_ENCRYPTION_KEY no configurada o demasiado corta (min 32 chars)');
    }

    return keys;
  }

  private decryptCertificate(input: any): Buffer | null {
    const raw = normalizeCertificateInput(input);
    if (!raw || raw.length < 12 + 16) {
      return normalizeCertificateInput(input); // fallback
    }

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);

    const keys = this.getCertKeys();
    for (const key of keys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted;
      } catch {
        /* intentar siguiente clave */
      }
    }

    this.logger.warn('⚠️ No se pudo descifrar certificado con las claves configuradas, se usará valor crudo.');
    return normalizeCertificateInput(input);
  }

  private decryptText(input: string | null | undefined): string {
    if (!input) return '';
    const raw = Buffer.from(input, 'base64');
    if (raw.length < 12 + 16) return input;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);

    const keys = this.getCertKeys();
    for (const key of keys) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
        return decrypted;
      } catch {
        /* intentar siguiente clave */
      }
    }

    this.logger.warn('⚠️ No se pudo descifrar contraseña de certificado, se usará tal cual.');
    return input;
  }

  private getDocumentoKeyFromCpe(cpeRecord: any) {
    const tipoDocumentoSunat = this.normalizeTipoDocumentoSunat(cpeRecord.tipo_documento);
    if (!['01', '03'].includes(tipoDocumentoSunat)) {
      throw new BadRequestException(
        `No se puede crear documento operativo directo para tipo CPE ${tipoDocumentoSunat}`,
      );
    }
    const tipoDocumento = tipoDocumentoSunat === '03' ? 'BOLETA' : 'FACTURA';
    const numero =
      cpeRecord.numero != null
        ? String(cpeRecord.numero).padStart(8, '0')
        : '';

    if (!cpeRecord.serie || !numero) {
      throw new BadRequestException('El CPE requiere serie y número para crear el documento operativo');
    }

    return {
      tipoDocumento,
      serie: String(cpeRecord.serie).trim().toUpperCase(),
      numero,
    };
  }

  private assertDocumentoOperativoCoincideConCpe(documento: any, cpeRecord: any): void {
    const totalDocumentoCents = Math.round(Number(documento?.total ?? 0) * 100);
    const totalCpeCents = Math.round(Number(cpeRecord?.total_venta ?? 0) * 100);
    const receptorDocumento = String(
      documento?.receptor_numero_doc ??
      documento?.receptor_documento ??
      '',
    ).trim();
    const receptorCpe = String(cpeRecord?.documento_receptor ?? '').trim();

    if (Math.abs(totalDocumentoCents - totalCpeCents) > 1 || (receptorDocumento && receptorCpe && receptorDocumento !== receptorCpe)) {
      throw new BadRequestException(
        `Conflicto de numeración CPE ${cpeRecord.serie}-${String(cpeRecord.numero).padStart(8, '0')}: ` +
          'ya existe un documento operativo con total o receptor distinto',
      );
    }
  }

  private async findDocumentoOperativoParaCpe(client: any, tenantId: string, cpeRecord: any): Promise<string | null> {
    const key = this.getDocumentoKeyFromCpe(cpeRecord);
    const { data, error } = await client
      .from('documentos')
      .select('id,total,receptor_numero_doc,receptor_documento')
      .eq('tenant_id', tenantId)
      .eq('tipo_documento', key.tipoDocumento)
      .eq('serie', key.serie)
      .eq('numero', key.numero)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo consultar documento operativo del CPE: ${error.message}`);
    }

    if (data?.id) {
      this.assertDocumentoOperativoCoincideConCpe(data, cpeRecord);
    }

    return data?.id ?? null;
  }

  private async vincularDocumentoCpe(client: any, cpeId: string, documentoId: string): Promise<void> {
    const { error } = await client
      .from('cpe')
      .update({ documento_id: documentoId })
      .eq('id', cpeId);

    if (error) {
      throw new BadRequestException(`No se pudo vincular CPE con documento operativo: ${error.message}`);
    }
  }

  /**
   * Garantiza que exista un documento operativo real e idempotente para el CPE.
   * No usa el ID del CPE como sustituto de factura/documento.
   */
  private async ensureDocumentoParaCpe(cpeRecord: any, tenantId: string): Promise<string | null> {
    if (!cpeRecord?.id) {
      return null;
    }

    if (cpeRecord.documento_id) {
      return cpeRecord.documento_id;
    }

    const client = this.supabaseService.getClient();

    try {
      const documentoExistente = await this.findDocumentoOperativoParaCpe(client, tenantId, cpeRecord);
      if (documentoExistente) {
        await this.vincularDocumentoCpe(client, cpeRecord.id, documentoExistente);
        return documentoExistente;
      }

      const emisorInfo = await this.getEmpresaEmisorInfo(tenantId);
      const safeEmisorRuc = this.pickFirstNonEmpty(
        [cpeRecord.ruc_emisor, emisorInfo.ruc, this.configService.get<string>('EMPRESA_RUC')],
        '20000000000',
      );
      const safeEmisorRazon = this.pickFirstNonEmpty(
        [cpeRecord.razon_social_emisor, emisorInfo.razonSocial],
        'EMISOR',
      );
      const safeEmisorDireccion = this.pickFirstNonEmpty(
        [cpeRecord.direccion_emisor, emisorInfo.direccion],
        'DIRECCION NO DEFINIDA',
      );
      const documentoKey = this.getDocumentoKeyFromCpe(cpeRecord);

      const documentoOperativo = {
        tenant_id: tenantId,
        tipo_documento: documentoKey.tipoDocumento,
        serie: documentoKey.serie,
        numero: documentoKey.numero,
        fecha_emision: cpeRecord.fecha_emision ?? new Date().toISOString(),
        fecha_vencimiento: cpeRecord.fecha_vencimiento ?? cpeRecord.fecha_emision ?? null,
        emisor_ruc: safeEmisorRuc,
        emisor_razon_social: safeEmisorRazon,
        emisor_direccion: safeEmisorDireccion,
        receptor_tipo_doc: cpeRecord.tipo_documento_receptor ?? 'RUC',
        receptor_numero_doc: cpeRecord.documento_receptor ?? '00000000000',
        receptor_razon_social: cpeRecord.razon_social_receptor ?? 'CLIENTE',
        receptor_direccion: cpeRecord.direccion_receptor ?? null,
        moneda: cpeRecord.moneda ?? 'PEN',
        tipo_cambio: 1,
        subtotal: cpeRecord.total_gravadas ?? 0,
        impuesto_igv: cpeRecord.total_igv ?? 0,
        total: cpeRecord.total_venta ?? 0,
        estado: 'BORRADOR',
        observaciones: `Documento generado automáticamente desde CPE ${cpeRecord.serie}-${cpeRecord.numero}`,
        created_at: cpeRecord.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: documentoInsertado, error: insertError } = await client
        .from('documentos')
        .insert(documentoOperativo)
        .select('id')
        .single();

      if (insertError) {
        if ((insertError as any)?.code === '23505') {
          const documentoCreadoPorOtroProceso = await this.findDocumentoOperativoParaCpe(client, tenantId, cpeRecord);
          if (documentoCreadoPorOtroProceso) {
            await this.vincularDocumentoCpe(client, cpeRecord.id, documentoCreadoPorOtroProceso);
            return documentoCreadoPorOtroProceso;
          }
        }

        throw new BadRequestException(`No se pudo crear documento operativo para CPE: ${insertError.message}`);
      }

      const documentoId = documentoInsertado?.id ?? null;

      if (documentoId) {
        await this.vincularDocumentoCpe(client, cpeRecord.id, documentoId);
      }

      return documentoId;
    } catch (documentError) {
      this.logger.error(
        `❌ [CPE] Error creando documento operativo para CPE ${cpeRecord.id}:`,
        documentError,
      );
      throw documentError;
    }
  }

  private async getEmpresaEmisorInfo(tenantId: string) {
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

  private async getEmpresaEmisorInfoStrict(tenantId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('empresa_config')
      .select('ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo leer la configuracion fiscal de la empresa: ${error.message}`);
    }

    const typedData = data as any;
    const ruc = String(typedData?.ruc || '').trim();
    const razonSocial = String(typedData?.razon_social || '').trim();
    if (!/^\d{11}$/.test(ruc) || !razonSocial) {
      throw new BadRequestException('No se puede crear el CPE: faltan RUC o razon social reales en empresa_config');
    }

    return {
      ruc,
      razonSocial,
      direccion: typedData?.direccion_fiscal ?? '',
      ciudad: typedData?.provincia ?? '',
      departamento: typedData?.departamento ?? '',
      codigoUbigeo: typedData?.ubigeo ?? '',
    };
  }

  async create(createFacturaDto: CreateFacturaDto, tenantId: string, userId?: string): Promise<FacturaDto> {
    try {
      const supabaseClient = this.supabaseService.getClient();
      const eventId = randomUUID();
      const emissionDate = this.resolveEmissionDate((createFacturaDto as any).fecha_emision);
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
      console.log('✅ CPE encontrado para vista:', cpeData);
      return {
        ...cpeData,
        logo_url: typedEmpresaConfig?.logo_url || null,
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

  /**
   * Enviar manualmente CPE firmado a SUNAT
   */
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

  private buildXmlFromDocumentoFiscal(documento: DocumentoFiscal): string {
    const itemsXml = documento.detalles
      .map((detalle, index) => {
        return `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity>${detalle.cantidad.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${documento.moneda}">${detalle.valor_venta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${documento.moneda}">${detalle.precio_unitario.toFixed(2)}</cbc:PriceAmount>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:Item>
      <cbc:Description><![CDATA[${detalle.descripcion}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${documento.moneda}">${detalle.precio_unitario.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${documento.serie}-${documento.numero}</cbc:ID>
  <cbc:IssueDate>${documento.fecha_emision.substring(0, 10)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>${documento.tipo_documento}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${documento.moneda}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${documento.emisor.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.emisor.razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID>${documento.cliente.numero_documento}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${documento.cliente.razon_social}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${documento.moneda}">${documento.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${documento.moneda}">${documento.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${documento.moneda}">${documento.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${itemsXml}
</Invoice>`;
  }

  /**
   * Preparar XML firmado para envío a SUNAT (sin enviar todavía)
   * 
   * NOTA: El envío automático a SUNAT está DESACTIVADO por ahora.
   * Para enviar manualmente usar el endpoint: POST /api/cpe/:id/enviar-sunat
   */
  private async prepareXmlForSunat(cpeId: string, xmlContent: string, tenantId: string): Promise<boolean> {
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

  /**
   * Reintentar envío de CPE (método público para SunatRetryService)
   */
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

  /**
   * 🔴 CRÍTICO FIX: Determina si un error de SUNAT es técnico (reintentable) o de validación (no reintentable)
   */
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

  private resolveEmissionDate(fechaEmision?: string): string {
    if (!fechaEmision) {
      return this.formatDate(new Date());
    }

    const parsed = new Date(fechaEmision);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`fecha_emision inválida: ${fechaEmision}`);
    }

    return this.formatDate(parsed);
  }

  private resolveDueDate(emissionDate: string, fechaVencimiento?: string): string {
    if (fechaVencimiento) {
      const parsed = new Date(fechaVencimiento);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`fecha_vencimiento inválida: ${fechaVencimiento}`);
      }
      return this.formatDate(parsed);
    }

    const emission = new Date(emissionDate);
    const due = new Date(emission);
    due.setDate(due.getDate() + 30);
    return this.formatDate(due);
  }

  private resolveIdempotencyKey(dto: CreateFacturaDto, tenantId: string): string {
    const provided = (dto as any).idempotency_key?.trim();
    if (provided) {
      return provided;
    }

    return `${tenantId}:${dto.tipo_documento}:${dto.serie}:${dto.numero}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private generateXmlContent(factura: CreateFacturaDto): string {
    // Generate basic UBL 2.1 XML structure (simplified)
    const issueDate = (factura as any).fecha_emision || this.formatDate(new Date());
    const dueDateTag = (factura as any).fecha_vencimiento ? `\n  <cbc:DueDate>${(factura as any).fecha_vencimiento}</cbc:DueDate>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${factura.serie}-${factura.numero}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>${dueDateTag}
  <cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${factura.tipo_documento}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${factura.moneda}</cbc:DocumentCurrencyCode>

  <!-- Supplier Party -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${factura.ruc_emisor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${factura.razon_social_emisor}]]></cbc:Name>
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Customer Party -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${factura.tipo_documento_receptor}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${factura.documento_receptor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${factura.razon_social_receptor}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    }
  </cac:AccountingCustomerParty>

  <!-- Tax Total -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${factura.moneda}">${factura.total_igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${factura.moneda}">${factura.total_gravadas.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${factura.moneda}">${factura.total_igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyName="United Nations Economic Commission for Europe">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- Legal Monetary Total -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${factura.moneda}">${factura.total_gravadas.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${factura.moneda}">${factura.total_venta.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${factura.moneda}">${factura.total_venta.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Invoice Lines -->
  ${factura.items.map((item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${item.unidad}">${item.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${factura.moneda}">${item.valor_venta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
      <cac:SellersItemIdentification>
        <cbc:ID>${item.codigo}</cbc:ID>
      </cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${factura.moneda}">${item.precio_unitario.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
  `).join('')}

</Invoice>`;
  }

  private generateSimplePdfContent(cpe: any): string {
    const fechaEmision = cpe.fecha_emision ? new Date(cpe.fecha_emision).toLocaleDateString() : new Date(cpe.created_at).toLocaleDateString();
    const fechaVencimiento = cpe.fecha_vencimiento ? new Date(cpe.fecha_vencimiento).toLocaleDateString() : 'No definido';
    const sunatStatus = cpe.sunat_status ?? this.sunatStatuses.NOT_SENT;
    const hashFirma = cpe.hash_firma ?? cpe.hash ?? 'N/A';
    return `
FACTURA ELECTRÓNICA
===================

Serie: ${cpe.serie}
Número: ${cpe.numero}
Fecha emisión: ${fechaEmision}
Fecha vencimiento: ${fechaVencimiento}

EMISOR:
${cpe.razon_social_emisor}
RUC: ${cpe.ruc_emisor}

RECEPTOR:
${cpe.razon_social_receptor}
${cpe.tipo_documento_receptor}: ${cpe.documento_receptor}

DETALLE:
${cpe.items.map(item => 
  `${item.descripcion} - Cant: ${item.cantidad} - Precio: ${item.precio_unitario}`
).join('\n')}

TOTALES:
Subtotal: ${cpe.total_gravadas}
IGV: ${cpe.total_igv}
Total: ${cpe.total_venta}

Estado: ${cpe.estado}
SUNAT Status: ${sunatStatus}
Hash firma: ${hashFirma}

---
Documento generado por ERP Suite
`;
  }

  private generateSimplePdfContentFromData(cpeData: any): string {
    const items = Array.isArray(cpeData.items) ? cpeData.items : [];
    const fechaEmision = cpeData.fecha_emision
      ? new Date(cpeData.fecha_emision).toLocaleDateString()
      : (cpeData.created_at ? new Date(cpeData.created_at).toLocaleDateString() : new Date().toLocaleDateString());
    const fechaVencimiento = cpeData.fecha_vencimiento
      ? new Date(cpeData.fecha_vencimiento).toLocaleDateString()
      : 'No definido';
    const sunatStatus = cpeData.sunat_status ?? this.sunatStatuses.NOT_SENT;
    const hashFirma = cpeData.hash_firma ?? cpeData.hash ?? 'N/A';
    
    return `
COMPROBANTE ELECTRÓNICO
======================

Serie: ${cpeData.serie || 'N/A'}
Número: ${cpeData.numero || 'N/A'}
Fecha emisión: ${fechaEmision}
Fecha vencimiento: ${fechaVencimiento}

EMISOR:
${cpeData.razon_social_emisor || 'ERP KAME'}
RUC: ${cpeData.ruc_emisor || '12345678901'}

RECEPTOR:
${cpeData.razon_social_receptor || 'Cliente General'}
Documento: ${cpeData.documento_receptor || 'Sin documento'}

DETALLE:
${items.length > 0 ? items.map((item, index) => 
  `${index + 1}. ${item.nombre_producto || item.descripcion || 'Producto'} - Cant: ${item.cantidad || 1} - Precio: S/${item.precio_unitario || 0}`
).join('\n') : 'No hay items disponibles'}

TOTALES:
Subtotal: S/${parseFloat(cpeData.total_gravadas || 0).toFixed(2)}
IGV: S/${parseFloat(cpeData.total_igv || 0).toFixed(2)}
Total: S/${parseFloat(cpeData.total_venta || 0).toFixed(2)}

Estado: ${cpeData.estado || 'EMITIDO'}
SUNAT Status: ${sunatStatus}
Hash firma: ${hashFirma}

---
Documento generado por ERP KAME
${new Date().toLocaleString()}
`;
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

  private pickFirstNonEmpty(values: Array<string | null | undefined>, fallback = ''): string {
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

  async getComprobantesFromDatabase(filters: any = {}, tenantId?: string) {
    try {
      console.log('📄 Consultando tabla CPE en Supabase...', filters, 'tenantId:', tenantId);

      const client = this.supabaseService.getClient();
      if (!client) {
        console.error('❌ Cliente de Supabase no disponible');
        return {
          success: false,
          message: 'Cliente de Supabase no configurado',
          data: []
        };
      }

      // Paginación y rango
      const page = Number(filters.page || 1);
      const pageSize = Math.min(Number(filters.pageSize || 50), 200);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Construir query base
      let query = client
        .from('cpe')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Filtrar por tenant_id si se proporciona
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      // Aplicar filtros si existen
      if (filters.tipoComprobante) {
        query = query.eq('tipo_documento', filters.tipoComprobante);
      }

      if (filters.estado) {
        query = query.eq('estado', filters.estado);
      }

      if (filters.serie) {
        query = query.eq('serie', filters.serie);
      }

      if (filters.moneda) {
        query = query.eq('moneda', filters.moneda);
      }

      if (filters.fechaDesde) {
        query = query.gte('created_at', `${filters.fechaDesde}T00:00:00`);
      }

      if (filters.fechaHasta) {
        query = query.lte('created_at', `${filters.fechaHasta}T23:59:59`);
      }

      if (filters.cliente) {
        query = query.ilike('razon_social_receptor', `%${filters.cliente}%`);
      }

      const { data: cpeData, error, count } = await query;

      if (error) {
        console.error('❌ Error consultando CPE:', error);
        console.error('📊 Detalles completos del error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log(`📊 Datos CPE encontrados:`, cpeData?.length || 0);

      // Transformar datos al formato esperado por el frontend
      const comprobantesFormateados = (cpeData || []).map(cpe => ({
        id: cpe.id,
        tipoDocumento: cpe.tipo_documento,
        tipoComprobante: this.getTipoComprobanteText(cpe.tipo_documento),
        serie: cpe.serie,
        numero: cpe.numero,
        fechaEmision: cpe.created_at ? new Date(cpe.created_at).toISOString().split('T')[0] : '',
        cliente: cpe.razon_social_receptor || 'Cliente General',
        clienteRuc: cpe.documento_receptor || '',
        total: parseFloat(cpe.total_venta || 0),
        moneda: cpe.moneda || 'PEN',
        estado: cpe.estado || 'BORRADOR',
        estadoSunat: cpe.estado,
        observaciones: cpe.error_message || '',
        fechaCreacion: cpe.created_at
      }));

      console.log(`✅ Se formatearon ${comprobantesFormateados.length} comprobantes`);

      return {
        success: true,
        data: comprobantesFormateados,
        message: `Se encontraron ${comprobantesFormateados.length} comprobantes`,
        meta: {
          total: count ?? comprobantesFormateados.length,
          page,
          pageSize,
        }
      };

    } catch (error) {
      console.error('❌ Error general en getComprobantesFromDatabase:', error);
      return {
        success: false,
        data: [],
        message: `Error consultando comprobantes: ${error.message}`,
        error: error.message
      };
    }
  }

  async exportComprobantesCsv(filters: any = {}, tenantId?: string) {
    const response = await this.getComprobantesFromDatabase(
      { ...filters, page: 1, pageSize: 5000 },
      tenantId,
    );
    if (!response.success) {
      return { success: false, content: '', filename: '', message: response.message };
    }

    const headers = [
      'tipoComprobante',
      'serie',
      'numero',
      'fechaEmision',
      'cliente',
      'clienteRuc',
      'moneda',
      'total',
      'estado',
      'estadoSunat',
    ];

    const rows = (response.data || []).map((c: any) => [
      c.tipoComprobante,
      c.serie,
      c.numero,
      c.fechaEmision,
      c.cliente,
      c.clienteRuc,
      c.moneda,
      c.total,
      c.estado,
      c.estadoSunat,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const filename = `comprobantes_${new Date().toISOString().slice(0, 10)}.csv`;

    return { success: true, content: csvContent, filename };
  }

  private getTipoComprobanteText(tipo: string): string {
    switch (this.normalizeTipoDocumentoSunat(tipo, false) || tipo) {
      case '01':
        return 'Factura';
      case '03':
        return 'Boleta';
      case '07':
        return 'Nota Crédito';
      case '08':
        return 'Nota Débito';
      case 'TICKET':
        return 'Ticket';
      default:
        return tipo || 'Desconocido';
    }
  }

  private normalizeTipoDocumentoSunat(
    tipo: string | null | undefined,
    throwOnUnknown = true,
  ): string {
    const normalized = String(tipo || '').trim().toUpperCase();
    const map: Record<string, string> = {
      '01': '01',
      FACTURA: '01',
      'FACTURA ELECTRONICA': '01',
      'FACTURA ELECTRÓNICA': '01',
      '03': '03',
      BOLETA: '03',
      'BOLETA DE VENTA': '03',
      'BOLETA DE VENTA ELECTRONICA': '03',
      'BOLETA DE VENTA ELECTRÓNICA': '03',
      '07': '07',
      NOTA_CREDITO: '07',
      'NOTA CREDITO': '07',
      'NOTA CRÉDITO': '07',
      'NOTA DE CREDITO': '07',
      'NOTA DE CRÉDITO': '07',
      '08': '08',
      NOTA_DEBITO: '08',
      'NOTA DEBITO': '08',
      'NOTA DÉBITO': '08',
      'NOTA DE DEBITO': '08',
      'NOTA DE DÉBITO': '08',
    };

    const sunatCode = map[normalized];
    if (!sunatCode && throwOnUnknown) {
      throw new BadRequestException(`Tipo de documento CPE no soportado: ${tipo || '(vacio)'}`);
    }

    return sunatCode || '';
  }

  private defaultSerieForTipo(tipoDocumento: string): string {
    switch (tipoDocumento) {
      case '01':
        return 'F001';
      case '03':
        return 'B001';
      case '07':
        return 'FC01';
      case '08':
        return 'FD01';
      default:
        return 'F001';
    }
  }

  private async resolveNumeroCpe(
    tenantId: string,
    tipoDocumento: string,
    serie: string,
    provided?: any,
  ): Promise<number> {
    const numericProvided = Number(provided);
    if (Number.isFinite(numericProvided) && numericProvided > 0) {
      return Math.trunc(numericProvided);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('obtener_siguiente_numero_documento', {
        p_tenant_id: tenantId,
        p_tipo_documento: tipoDocumento,
        p_serie: serie,
      });

    if (error) {
      throw new BadRequestException(`No se pudo obtener el correlativo CPE: ${error.message}`);
    }

    const next = Number(Array.isArray(data) ? data[0] : data);
    if (!Number.isFinite(next) || next <= 0) {
      throw new BadRequestException(`Correlativo CPE invalido para ${tipoDocumento}-${serie}: ${data}`);
    }

    return Math.trunc(next);
  }

  private resolveTipoDocumentoReceptor(
    tipoDocumentoCpe: string,
    provided: any,
    documentoReceptor: string,
  ): string {
    const normalized = String(provided || '').trim().toUpperCase();
    const map: Record<string, string> = {
      '1': '1',
      DNI: '1',
      '6': '6',
      RUC: '6',
      '4': '4',
      CE: '4',
      CARNET_EXTRANJERIA: '4',
      '7': '7',
      PASAPORTE: '7',
    };
    const resolved = map[normalized] || (documentoReceptor.length === 11 ? '6' : '1');

    if (tipoDocumentoCpe === '01' && resolved !== '6') {
      throw new BadRequestException('La factura requiere receptor con RUC');
    }

    return resolved;
  }

  private normalizeComprobanteItems(items: any[]): any[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('El comprobante debe incluir al menos un item');
    }

    return items.map((item, index) => {
      const cantidad = this.roundMoney(item?.cantidad ?? 0, 6);
      const valorUnitario = this.roundMoney(
        item?.valor_unitario ?? item?.valorUnitario ?? item?.precio_unitario ?? item?.precioUnitario ?? 0,
        6,
      );
      const valorVenta = this.roundMoney(
        item?.valor_venta ?? item?.valorVenta ?? cantidad * valorUnitario,
      );
      const igv = this.roundMoney(item?.igv ?? item?.impuesto_igv ?? item?.total_impuestos ?? 0);
      const total = this.roundMoney(item?.total ?? item?.precio_venta ?? valorVenta + igv);
      const precioUnitario = this.roundMoney(item?.precio_unitario ?? item?.precioUnitario ?? valorUnitario, 6);

      if (cantidad <= 0) {
        throw new BadRequestException(`El item ${index + 1} debe tener cantidad > 0`);
      }
      if (!String(item?.descripcion || '').trim()) {
        throw new BadRequestException(`El item ${index + 1} requiere descripcion`);
      }

      return {
        codigo: String(item?.codigo ?? item?.codigo_producto ?? `ITEM-${index + 1}`).trim(),
        descripcion: String(item.descripcion).trim(),
        cantidad,
        unidad: String(item?.unidad ?? item?.unidad_medida ?? item?.unidadMedida ?? 'NIU').trim().toUpperCase(),
        precio_unitario: precioUnitario,
        valor_venta: valorVenta,
        igv,
        precio_venta: total,
        total,
      };
    });
  }

  private roundMoney(value: any, decimals = 2): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return Number(numeric.toFixed(decimals));
  }

  async getStatsFromDatabase(tenantId?: string) {
    try {
      console.log('📊 Calculando estadísticas CPE desde BD para tenant:', tenantId);

      const client = this.supabaseService.getClient();
      if (!client) {
        throw new Error('Cliente de Supabase no disponible');
      }

      const hoy = new Date().toISOString().split('T')[0];
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      // CPE emitidos hoy
      let queryHoy = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${hoy}T00:00:00Z`)
        .lte('created_at', `${hoy}T23:59:59Z`);

      if (tenantId) {
        queryHoy = queryHoy.eq('tenant_id', tenantId);
      }

      const { count: cpeHoy } = await queryHoy;

      // CPE del mes
      let queryMes = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMes = queryMes.eq('tenant_id', tenantId);
      }

      const { count: cpeMes } = await queryMes;

      // Monto facturado del mes
      let queryMonto = client
        .from('cpe')
        .select('total_venta')
        .gte('created_at', inicioMes);

      if (tenantId) {
        queryMonto = queryMonto.eq('tenant_id', tenantId);
      }

      const { data: montoData } = await queryMonto;

      const montoFacturado = (montoData || []).reduce((sum, cpe) => 
        sum + parseFloat(cpe.total_venta || 0), 0
      );

      // CPE rechazados
      let queryRechazados = client
        .from('cpe')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'RECHAZADO');

      if (tenantId) {
        queryRechazados = queryRechazados.eq('tenant_id', tenantId);
      }

      const { count: rechazados } = await queryRechazados;

      const stats = {
        cpeEmitidosHoy: cpeHoy || 0,
        cpeDelMes: cpeMes || 0,
        montoFacturado: Math.round(montoFacturado * 100) / 100,
        rechazados: rechazados || 0
      };

      console.log('✅ Estadísticas calculadas:', stats);

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error('❌ Error calculando estadísticas:', error);
      return {
        success: false,
        data: {
          cpeEmitidosHoy: 0,
          cpeDelMes: 0,
          montoFacturado: 0,
          rechazados: 0
        },
        error: error.message
      };
    }
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
    tipoNota: string = '01' // 01 = Anulación de la operación
  ): Promise<any> {
    const client = this.supabaseService.getClient();

    // 1. Obtener el CPE a anular
    const { data: cpe, error: cpeError } = await client
      .from('comprobantes_electronicos')
      .select('*')
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .single();

    if (cpeError || !cpe) {
      throw new NotFoundException('Comprobante electrónico no encontrado');
    }

    const estadoCpe = String(cpe.estado || '').toUpperCase();

    // 2. Validar que el CPE puede ser anulado
    if (estadoCpe === 'ANULADO') {
      throw new BadRequestException('El comprobante ya está anulado');
    }

    if (cpe.nota_credito_id) {
      throw new BadRequestException('El comprobante ya tiene una nota de crédito asociada');
    }

    if (!this.estadosAnulables.has(estadoCpe)) {
      throw new BadRequestException(
        `No se puede anular un comprobante en estado ${cpe.estado}. ` +
        `Solo se pueden anular comprobantes FIRMADOS, ACEPTADOS o ENVIADOS.`
      );
    }

    await this.assertCpeOriginalAccountingReady(client, tenantId, cpe, userId, motivo);

    const contextoOperacion = await this.resolveOperacionReversaContext(client, tenantId, cpe);

    // 3. Generar nota de crédito
    console.log(`📝 [CPE] Generando nota de crédito para CPE ${cpeId}...`);
    const serieNotaCredito = this.resolveSerieNotaCredito(cpe.serie);
    
    const notaCreditoData = {
      tipo_documento: '07',
      serie: serieNotaCredito,
      numero: await this.obtenerSiguienteNumeroNotaCredito(tenantId, serieNotaCredito),
      documento_referencia_tipo: cpe.tipo_documento,
      documento_referencia_serie: cpe.serie,
      documento_referencia_numero: cpe.numero,
      tipo_nota_credito: tipoNota,
      motivo_nota: motivo,
      ruc_emisor: cpe.ruc_emisor,
      razon_social_emisor: cpe.razon_social_emisor,
      tipo_documento_receptor: cpe.tipo_documento_receptor,
      documento_receptor: cpe.documento_receptor,
      razon_social_receptor: cpe.razon_social_receptor,
      moneda: cpe.moneda,
      total_gravadas: -cpe.total_gravadas, // Negativo para revertir
      total_igv: -cpe.total_igv,
      total_venta: -cpe.total_venta,
      tenant_id: tenantId,
      estado: 'BORRADOR',
      created_by: userId,
    };

    const { data: notaCredito, error: notaError } = await client
      .from('comprobantes_electronicos')
      .insert(notaCreditoData)
      .select()
      .single();

    if (notaError) {
      console.error('Error creando nota de crédito:', notaError);
      throw new BadRequestException('No se pudo crear la nota de crédito');
    }

    // 4. Actualizar estado del CPE original
    const { error: updateError } = await client
      .from('comprobantes_electronicos')
      .update({
        estado: 'ANULADO',
        nota_credito_id: notaCredito.id,
        motivo_anulacion: motivo,
        anulado_por: userId,
        anulado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', cpeId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error('Error actualizando estado del CPE:', updateError);
      throw new BadRequestException('No se pudo anular el comprobante');
    }

    await this.aplicarReversionOperativa(client, tenantId, cpe, notaCredito, contextoOperacion, motivo, userId);

    // 5. Emitir evento CPEAnulado para que otros módulos reviertan operaciones
    // Este evento será escuchado por:
    // - Contabilidad: Revertir asiento contable
    // - Finanzas: Liberar CxC
    // - Inventario: Restaurar stock (si aplica)
    try {
      const eventToInsert = OutboxEventBuilder.build({
        tenantId,
        eventType: 'cpe.anulado',
        aggregateType: 'cpe',
        aggregateId: cpeId,
        idempotencyKey: `cpe.anulado:${tenantId}:${cpeId}:${notaCredito.id}`,
        eventData: {
          cpe_id: cpeId,
          nota_credito_id: notaCredito.id,
          serie: cpe.serie,
          numero: cpe.numero,
          total: cpe.total_venta,
          motivo: motivo,
          anulado_por: userId,
          anulado_at: new Date().toISOString(),
          source: contextoOperacion.source,
          venta_pos_id: contextoOperacion.ventaPos?.id,
          pedido_id: contextoOperacion.pedido?.id,
          documento_id: contextoOperacion.documento?.id,
          cxc_id: contextoOperacion.cxc?.id,
          items: contextoOperacion.items.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
          })),
        },
      });

      await client
        .from('outbox_events')
        .insert(eventToInsert);

      console.log(`✅ [CPE] Evento CPEAnulado emitido para CPE ${cpeId}`);
    } catch (error) {
      console.error('Error emitiendo evento CPEAnulado:', error);
      // No fallar la anulación si el evento no se puede emitir
    }

    console.log(`✅ [CPE] Comprobante ${cpe.serie}-${cpe.numero} anulado exitosamente`);

    return {
      success: true,
      message: 'Comprobante anulado exitosamente',
      cpe_anulado: {
        id: cpeId,
        serie: cpe.serie,
        numero: cpe.numero,
        estado: 'ANULADO',
      },
      nota_credito: {
        id: notaCredito.id,
        serie: notaCredito.serie,
        numero: notaCredito.numero,
        estado: notaCredito.estado,
      },
    };
  }

  private resolveSerieNotaCredito(serie: string): string {
    const normalized = String(serie || '').trim().toUpperCase();
    if (normalized.startsWith('F')) return normalized.replace(/^F/, 'FC');
    if (normalized.startsWith('B')) return normalized.replace(/^B/, 'BC');
    return `NC${normalized}`.slice(0, 4);
  }

  private formatCpeNumero(cpe: any): string {
    return `${cpe.serie}-${String(cpe.numero).padStart(8, '0')}`;
  }

  private async assertCpeOriginalAccountingReady(
    client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
  ): Promise<void> {
    const sourceEventId = await this.resolveCpeOriginalSourceEventId(client, tenantId, cpe);

    const block = async (reason: string): Promise<never> => {
      await this.registrarIntentoAnulacionCpeBloqueado(client, tenantId, cpe, userId, motivo, reason);
      throw new ConflictException(reason);
    };

    if (!sourceEventId) {
      return block(
        'No se puede anular el CPE porque no conserva el evento contable original. Revise la trazabilidad antes de emitir una nota de crédito.',
      );
    }

    const { data: asientos, error: asientosError } = await client
      .from('asientos_contables')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_event_id', sourceEventId)
      .limit(2);

    if (asientosError) {
      throw new BadRequestException(`No se pudo validar el asiento contable original: ${asientosError.message}`);
    }

    if ((asientos?.length ?? 0) !== 1) {
      return block(
        `No se puede anular el CPE porque se esperaban 1 asiento contable original y se encontraron ${asientos?.length ?? 0}.`,
      );
    }

    const { data: detalles, error: detallesError } = await client
      .from('detalle_asientos')
      .select('id')
      .eq('asiento_id', asientos[0].id)
      .limit(1);

    if (detallesError) {
      throw new BadRequestException(`No se pudo validar el detalle del asiento contable original: ${detallesError.message}`);
    }

    if (!detalles?.length) {
      return block('No se puede anular el CPE porque el asiento contable original no tiene detalle.');
    }
  }

  private async registrarIntentoAnulacionCpeBloqueado(
    _client: any,
    tenantId: string,
    cpe: any,
    userId: string | undefined,
    motivo: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.auditService.registrarCambio(
        'comprobantes_electronicos',
        'UPDATE',
        userId ?? 'system',
        {
          old: { id: cpe.id, estado: cpe.estado, nota_credito_id: cpe.nota_credito_id ?? null },
          new: { anulacion_bloqueada: true, motivo_anulacion: motivo, motivo_bloqueo: reason },
        },
        tenantId,
        cpe.id,
        {
          accion: 'ANULACION_CPE_BLOQUEADA',
          source_event_id: cpe.event_id || cpe.source_event_id || null,
        },
      );
    } catch (auditError) {
      this.logger.warn(`No se pudo auditar intento bloqueado de anulación CPE ${cpe.id}: ${(auditError as Error).message}`);
    }
  }

  private async resolveCpeOriginalSourceEventId(client: any, tenantId: string, cpe: any): Promise<string | null> {
    const direct = cpe.event_id || cpe.source_event_id;
    if (direct) return direct;

    const { data, error } = await client
      .from('cpe')
      .select('event_id')
      .eq('tenant_id', tenantId)
      .eq('id', cpe.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`No se pudo resolver el evento contable original del CPE: ${error.message}`);
    }

    return data?.event_id || null;
  }

  private async resolveOperacionReversaContext(client: any, tenantId: string, cpe: any): Promise<any> {
    const numeroDocumento = this.formatCpeNumero(cpe);
    const numeroVariants = Array.from(new Set([
      String(cpe.numero),
      String(cpe.numero).padStart(8, '0'),
    ]));

    const { data: ventaPos } = await client
      .from('ventas_pos')
      .select('id, numero_ticket, total, estado, sesion_caja_id')
      .eq('tenant_id', tenantId)
      .eq('cpe_id', cpe.id)
      .maybeSingle();

    const { data: pedido } = await client
      .from('pedidos_venta')
      .select('id, numero, estado, factura_id')
      .eq('tenant_id', tenantId)
      .eq('factura_id', cpe.id)
      .maybeSingle();

    let documento: any = null;
    const { data: documentos } = await client
      .from('documentos')
      .select('id, serie, numero, estado, total, created_at')
      .eq('tenant_id', tenantId)
      .eq('serie', cpe.serie)
      .in('numero', numeroVariants)
      .limit(20);
    documento = this.pickOperationalDocument(documentos ?? [], cpe);

    let cxc: any = null;
    if (documento?.id) {
      const { data } = await client
        .from('cuentas_por_cobrar')
        .select('id, documento_id, numero_documento, monto_total, monto_pendiente, estado')
        .eq('tenant_id', tenantId)
        .eq('documento_id', documento.id)
        .maybeSingle();
      cxc = data ?? null;
    }
    if (!cxc) {
      const { data } = await client
        .from('cuentas_por_cobrar')
        .select('id, documento_id, numero_documento, monto_total, monto_pendiente, estado')
        .eq('tenant_id', tenantId)
        .eq('numero_documento', numeroDocumento)
        .limit(20);
      cxc = this.pickCuentaPorCobrar(data ?? [], cpe);
    }

    let items: Array<{ producto_id: string; cantidad: number; precio_unitario?: number }> = [];
    if (ventaPos?.id) {
      const { data } = await client
        .from('detalle_ventas_pos')
        .select('producto_id, cantidad, precio_unitario')
        .eq('tenant_id', tenantId)
        .eq('venta_pos_id', ventaPos.id);
      items = (data ?? []).map((item: any) => ({
        producto_id: item.producto_id,
        cantidad: Number(item.cantidad ?? 0),
        precio_unitario: Number(item.precio_unitario ?? 0),
      }));
    } else if (pedido?.id) {
      const { data } = await client
        .from('pedidos_venta_detalle')
        .select('producto_id, cantidad_despachada, cantidad, precio_unitario')
        .eq('tenant_id', tenantId)
        .eq('pedido_id', pedido.id);
      items = (data ?? []).map((item: any) => ({
        producto_id: item.producto_id,
        cantidad: Number(item.cantidad_despachada ?? item.cantidad ?? 0),
        precio_unitario: Number(item.precio_unitario ?? 0),
      }));
    }

    return {
      source: ventaPos?.id ? 'POS' : pedido?.id ? 'PEDIDO' : 'CPE',
      ventaPos,
      pedido,
      documento,
      cxc,
      items: items.filter((item) => item.producto_id && item.cantidad > 0),
    };
  }

  private pickOperationalDocument(documentos: any[], cpe: any): any | null {
    if (!documentos.length) return null;
    const totalCpe = Number(cpe.total_venta ?? 0);
    return documentos
      .map((documento) => ({
        documento,
        totalDiff: Math.abs(Number(documento.total ?? 0) - totalCpe),
        createdAt: new Date(documento.created_at ?? 0).getTime(),
      }))
      .sort((a, b) => a.totalDiff - b.totalDiff || b.createdAt - a.createdAt)[0]?.documento ?? null;
  }

  private pickCuentaPorCobrar(cuentas: any[], cpe: any): any | null {
    if (!cuentas.length) return null;
    const totalCpe = Number(cpe.total_venta ?? 0);
    return cuentas
      .map((cuenta) => ({
        cuenta,
        totalDiff: Math.abs(Number(cuenta.monto_total ?? 0) - totalCpe),
      }))
      .sort((a, b) => a.totalDiff - b.totalDiff)[0]?.cuenta ?? null;
  }

  private async aplicarReversionOperativa(
    client: any,
    tenantId: string,
    cpe: any,
    notaCredito: any,
    contexto: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    if (contexto.documento?.id) {
      const { error } = await client
        .from('documentos')
        .update({
          estado: 'ANULADO',
          motivo_anulacion: motivo,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.documento.id);
      if (error) throw new BadRequestException(`No se pudo anular el documento operativo: ${error.message}`);
    }

    if (contexto.cxc?.id && !['ANULADA', 'REVERTIDA'].includes(String(contexto.cxc.estado || '').toUpperCase())) {
      const { error } = await client
        .from('cuentas_por_cobrar')
        .update({
          estado: 'ANULADA',
          monto_pendiente: 0,
          observaciones: `REVERTIDA: CPE ${cpe.serie}-${cpe.numero} anulado con NC ${notaCredito.serie}-${notaCredito.numero}. Motivo: ${motivo}`,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.cxc.id);
      if (error) throw new BadRequestException(`No se pudo revertir CxC: ${error.message}`);
    }

    if (contexto.pedido?.id) {
      const { error } = await client
        .from('pedidos_venta')
        .update({
          estado: 'ANULADO',
          updated_at: new Date().toISOString(),
          metadata: {
            ...(contexto.pedido.metadata ?? {}),
            reverso_cpe_id: cpe.id,
            nota_credito_id: notaCredito.id,
            motivo_anulacion: motivo,
          },
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.pedido.id);
      if (error) throw new BadRequestException(`No se pudo marcar el pedido como anulado: ${error.message}`);
    }

    if (contexto.ventaPos?.id) {
      const { error } = await client
        .from('ventas_pos')
        .update({
          estado: 'ANULADA',
          updated_at: new Date().toISOString(),
          metadata: {
            reverso_cpe_id: cpe.id,
            nota_credito_id: notaCredito.id,
            motivo_anulacion: motivo,
          },
        })
        .eq('tenant_id', tenantId)
        .eq('id', contexto.ventaPos.id);
      if (error) throw new BadRequestException(`No se pudo marcar la venta POS como anulada: ${error.message}`);

      await this.registrarReversionCajaPos(client, tenantId, contexto.ventaPos, cpe, notaCredito, motivo, userId);
    }

    await this.revertirStockVenta(client, tenantId, contexto, cpe, notaCredito, motivo, userId);
  }

  private async revertirStockVenta(
    client: any,
    tenantId: string,
    contexto: any,
    cpe: any,
    notaCredito: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    for (const item of contexto.items) {
      const { data: movimientoExistente, error: lookupError } = await client
        .from('movimientos_inventario')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('producto_id', item.producto_id)
        .eq('referencia_id', notaCredito.id)
        .eq('referencia_tipo', 'REVERSO_VENTA')
        .maybeSingle();
      if (lookupError && lookupError.code !== 'PGRST116') {
        throw new BadRequestException(`No se pudo verificar reverso de inventario: ${lookupError.message}`);
      }
      if (movimientoExistente) continue;

      const { data: producto, error: productoError } = await client
        .from('productos')
        .select('id, stock_actual, stock, stock_reservado, controla_stock, es_servicio')
        .eq('tenant_id', tenantId)
        .eq('id', item.producto_id)
        .single();
      if (productoError || !producto) {
        throw new BadRequestException(`Producto ${item.producto_id} no encontrado para reverso`);
      }

      if (producto.es_servicio === true || producto.controla_stock === false) continue;

      const stockActual = Number(producto.stock_actual ?? producto.stock ?? 0);
      const nuevoStock = Number((stockActual + Number(item.cantidad)).toFixed(2));
      const { error: updateStockError } = await client
        .from('productos')
        .update({
          stock_actual: nuevoStock,
          stock: String(nuevoStock),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', item.producto_id);
      if (updateStockError) throw new BadRequestException(`No se pudo restaurar stock: ${updateStockError.message}`);

      const { error: movimientoError } = await client.from('movimientos_inventario').insert({
        tenant_id: tenantId,
        producto_id: item.producto_id,
        tipo: 'ENTRADA',
        cantidad: item.cantidad,
        referencia_tipo: 'REVERSO_VENTA',
        referencia_id: notaCredito.id,
        created_by: userId,
        motivo: `Reverso de venta ${cpe.serie}-${cpe.numero}`,
        notas: `Entrada por nota de crédito ${notaCredito.serie}-${notaCredito.numero}. Motivo: ${motivo}`,
        stock_actual: String(nuevoStock),
        stock_reservado: String(producto.stock_reservado ?? 0),
        activo: true,
        estado: 'ACTIVO',
        metadata: {
          source: contexto.source,
          cpe_id: cpe.id,
          nota_credito_id: notaCredito.id,
        },
      });
      if (movimientoError) throw new BadRequestException(`No se pudo registrar Kardex de reverso: ${movimientoError.message}`);
    }
  }

  private async registrarReversionCajaPos(
    client: any,
    tenantId: string,
    ventaPos: any,
    cpe: any,
    notaCredito: any,
    motivo: string,
    userId?: string,
  ): Promise<void> {
    const { data: efectivo } = await client
      .from('movimientos_caja')
      .select('id, monto, sesion_caja_id')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'venta_pos')
      .eq('referencia_documento', ventaPos.id)
      .eq('tipo_movimiento', 'VENTA')
      .maybeSingle();

    if (!efectivo?.id || Number(efectivo.monto ?? 0) <= 0) return;

    const { data: reversoExistente } = await client
      .from('movimientos_caja')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('referencia_tipo', 'reverso_venta_pos')
      .eq('referencia_documento', notaCredito.id)
      .maybeSingle();
    if (reversoExistente) return;

    const { error } = await client.rpc('registrar_movimiento_caja', {
      p_sesion_caja_id: efectivo.sesion_caja_id,
      p_tipo_movimiento: 'AJUSTE',
      p_monto: -Math.abs(Number(efectivo.monto)),
      p_referencia_documento: notaCredito.id,
      p_referencia_tipo: 'reverso_venta_pos',
      p_motivo: `Reverso POS ${cpe.serie}-${cpe.numero}: ${motivo}`,
      p_usuario_id: userId ?? null,
      p_metadata: {
        cpe_id: cpe.id,
        nota_credito_id: notaCredito.id,
        venta_pos_id: ventaPos.id,
      },
    });
    if (error) throw new BadRequestException(`No se pudo registrar reverso de caja POS: ${error.message}`);
  }

  /**
   * Obtiene el siguiente número de nota de crédito
   */
  private async obtenerSiguienteNumeroNotaCredito(tenantId: string, serie: string): Promise<number> {
    const client = this.supabaseService.getClient();
    
    const { data, error } = await client
      .from('comprobantes_electronicos')
      .select('numero')
      .eq('tenant_id', tenantId)
      .eq('serie', serie)
      .eq('tipo_documento', 'NOTA_CREDITO')
      .order('numero', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error obteniendo último número de nota de crédito:', error);
      return 1;
    }

    return data && data.length > 0 ? data[0].numero + 1 : 1;
  }
}
