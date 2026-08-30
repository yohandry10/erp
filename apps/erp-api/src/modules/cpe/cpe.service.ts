import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { categoriaDeAfectacion } from '../../shared/utils/igv-afectacion.util';
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
import { SucursalesService } from '../sucursales/sucursales.service';
import { CpeCertificateService } from './cpe-certificate.service';
import { CpeReportingService } from './cpe-reporting.service';
import { CpeCancellationService } from './cpe-cancellation.service';
import { CpeDeliveryService } from './cpe-delivery.service';
import { CpeRegistrationService } from './cpe-registration.service';
import { DocumentoFiscal } from '../documentos/interfaces/documento-fiscal.interface';
import { DesktopSignedCpeDto } from './dto/desktop-signed-cpe.dto';
import { normalizeDianIdentity } from '../fiscal/colombia/dian-document.util';

@Injectable()
export class CpeService {
  private readonly logger = new Logger(CpeService.name);
  private readonly xmlBuilder = new CpeXmlBuilder();
  private readonly certificateService: CpeCertificateService;
  private readonly reportingService: CpeReportingService;
  private readonly cancellationService: CpeCancellationService;
  private readonly deliveryService: CpeDeliveryService;
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
    private readonly sucursalesService: SucursalesService,
  ) {
    this.certificateService = new CpeCertificateService(supabaseService, configService);
    this.reportingService = new CpeReportingService(supabaseService);
    this.cancellationService = new CpeCancellationService(supabaseService, auditService);
    this.deliveryService = new CpeDeliveryService(supabaseService, fiscalAdapter, pdfGenerator, this.certificateService);
    this.registrationService = new CpeRegistrationService(
      supabaseService,
      cacheInvalidation,
      this.certificateService,
    );
  }
  /**
   * Obtiene el XmlSigner configurado para el tenant
   * Una cuenta real usa su certificado propio; sólo una demo PE en homologación
   * puede resolver el fixture sintético explícito del runtime.
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
    let totalIsc = 0;
    let gravadas = 0;
    let exoneradas = 0;
    let inafectas = 0;
    let exportacion = 0;

    for (const item of createFacturaDto.items) {
      const cantidad = sanitizeNumber((item as any).cantidad);
      const precioUnitario = sanitizeNumber((item as any).precio_unitario ?? (item as any).precioUnitario);
      const valorVenta = sanitizeNumber((item as any).valor_venta ?? (item as any).valorVenta ?? precioUnitario * cantidad);
      const igvItem = sanitizeNumber((item as any).impuesto_igv ?? (item as any).igv ?? 0);
      const iscItem = sanitizeNumber((item as any).impuesto_isc ?? 0);

      if (cantidad <= 0) {
        throw new BadRequestException('Cada ítem debe tener cantidad > 0');
      }
      if (precioUnitario < 0) {
        throw new BadRequestException('El precio unitario no puede ser negativo');
      }

      subtotal += valorVenta;
      totalIgv += igvItem;
      totalIsc += iscItem;

      // El subtotal agrupa todas las bases, pero cada una se declara por separado
      // según su afectación: total_gravadas no puede incluir lo exonerado.
      switch (categoriaDeAfectacion((item as any).tipo_afectacion_igv ?? (item as any).afectacion_igv)) {
        case 'EXONERADO':
          exoneradas += valorVenta;
          break;
        case 'INAFECTO':
          inafectas += valorVenta;
          break;
        case 'EXPORTACION':
          exportacion += valorVenta;
          break;
        default:
          gravadas += valorVenta;
      }
    }

    const total = subtotal + totalIgv + totalIsc;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      totalIgv: Number(totalIgv.toFixed(2)),
      totalIsc: Number(totalIsc.toFixed(2)),
      total: Number(total.toFixed(2)),
      gravadas: Number(gravadas.toFixed(2)),
      exoneradas: Number(exoneradas.toFixed(2)),
      inafectas: Number(inafectas.toFixed(2)),
      exportacion: Number(exportacion.toFixed(2)),
    };
  }

  private assertProvidedTotalsMatch(
    dto: CreateFacturaDto,
    calculated: {
      subtotal: number;
      totalIgv: number;
      totalIsc: number;
      total: number;
      gravadas: number;
      exoneradas: number;
      inafectas: number;
      exportacion: number;
    },
  ) {
    const fields: Array<[string, any, number]> = [
      ['total_gravadas', (dto as any).total_gravadas, calculated.gravadas],
      ['total_exoneradas', (dto as any).total_exoneradas, calculated.exoneradas],
      ['total_inafectas', (dto as any).total_inafectas, calculated.inafectas],
      ['total_exportacion', (dto as any).total_exportacion, calculated.exportacion],
      ['total_igv', (dto as any).total_igv, calculated.totalIgv],
      ['total_isc', (dto as any).total_isc, calculated.totalIsc],
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

  private assertReceptorValido(dto: CreateFacturaDto, paisCodigo = 'PE') {
    const tipo = String((dto as any).tipo_documento_receptor ?? '').trim();
    const documento = String((dto as any).documento_receptor ?? '').trim();
    const tipoDocumento = String((dto as any).tipo_documento ?? '').trim();

    if (!tipo || !documento) {
      throw new BadRequestException('El receptor del CPE requiere tipo y número de documento');
    }

    if (paisCodigo === 'CO') {
      try {
        const identity = normalizeDianIdentity(tipo, documento);
        (dto as any).tipo_documento_receptor = identity.type;
        (dto as any).documento_receptor = identity.canonicalNumber;
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Documento DIAN inválido');
      }
      return;
    }

    if (paisCodigo === 'AR') {
      const allowed = new Set(['80', '86', '87', '96', '99']);
      if (!allowed.has(tipo)) {
        throw new BadRequestException('Tipo de documento del receptor no válido para ARCA');
      }
      if (['80', '86', '87'].includes(tipo) && !/^\d{11}$/.test(documento)) {
        throw new BadRequestException('CUIT/CUIL/CDI del receptor debe tener 11 dígitos');
      }
      if (tipo === '96' && !/^\d{7,8}$/.test(documento)) {
        throw new BadRequestException('DNI argentino del receptor debe tener 7 u 8 dígitos');
      }
      if (tipo === '99' && !/^0*$/.test(documento)) {
        throw new BadRequestException('Consumidor Final ARCA no debe llevar un documento inventado');
      }
      if (!String((dto as any).arca_condicion_iva_receptor ?? '').trim()) {
        throw new BadRequestException(
          'La emisión ARCA exige la condición IVA del receptor para resolver la clase A/B/C',
        );
      }
      return;
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

    // SUNAT (Reglamento de Comprobantes de Pago): la boleta cuyo importe total
    // supere S/ 700 debe identificar al adquirente con apellidos y nombres o
    // razón social, y su número de documento. El genérico "clientes varios"
    // (tipo 0 / 99999999) solo es admisible por debajo de ese umbral.
    if (tipoDocumento === '03') {
      const moneda = String((dto as any).moneda ?? 'PEN').trim().toUpperCase();
      const totalVenta = Number((dto as any).total_venta ?? 0);
      const razonSocial = String((dto as any).razon_social_receptor ?? '').trim();
      const documentoGenerico = tipo === '0' || /^9+$/.test(documento);

      // El umbral es en soles; para otras monedas no se infiere un tipo de cambio.
      if (moneda === 'PEN' && totalVenta > 700 && (documentoGenerico || !razonSocial)) {
        throw new BadRequestException(
          'Las boletas mayores a S/ 700 requieren identificar al adquirente con apellidos y nombres o razón social, y su número de documento',
        );
      }
    }
  }

  /**
   * SUNAT exige que la serie sea de 4 caracteres alfanuméricos y que su primera
   * letra corresponda al tipo de comprobante: F para facturas y B para boletas.
   * Las notas de crédito/débito conservan el prefijo del documento que modifican.
   */
  private assertSerieCoherenteConTipo(dto: CreateFacturaDto, paisCodigo = 'PE') {
    const serie = String((dto as any).serie ?? '').trim().toUpperCase();
    const tipoDocumento = String((dto as any).tipo_documento ?? '').trim();

    if (paisCodigo === 'CO') {
      if (!/^[A-Z0-9]{1,4}$/.test(serie)) {
        throw new BadRequestException('El prefijo DIAN debe tener entre 1 y 4 caracteres alfanuméricos');
      }
      return;
    }


    if (paisCodigo === 'AR') {
      if (!/^\d{5}$/.test(serie) || Number(serie) < 1) {
        throw new BadRequestException('La serie ARCA debe ser el punto de venta de cinco dígitos');
      }
      return;
    }

    if (!/^[A-Z0-9]{4}$/.test(serie)) {
      throw new BadRequestException(
        'La serie debe tener exactamente 4 caracteres alfanuméricos en mayúsculas (ej: F001, B001)',
      );
    }

    const prefijosPorTipo: Record<string, string[]> = {
      '01': ['F'], // Factura
      '03': ['B'], // Boleta de venta
      '07': ['F', 'B'], // Nota de crédito (sigue al documento afectado)
      '08': ['F', 'B'], // Nota de débito (sigue al documento afectado)
    };

    const prefijosValidos = prefijosPorTipo[tipoDocumento];
    if (prefijosValidos && !prefijosValidos.includes(serie.charAt(0))) {
      const esperado = prefijosValidos.join(' o ');
      throw new BadRequestException(
        `La serie ${serie} no corresponde al tipo de comprobante ${tipoDocumento}: debe empezar con ${esperado}`,
      );
    }
  }

  /**
   * SUNAT rechaza comprobantes con fecha de emisión posterior a la fecha actual.
   * La comparación se hace en horario de Perú para no rechazar emisiones válidas
   * por el desfase entre UTC y America/Lima.
   */
  private assertFechaEmisionNoFutura(emissionDate: string, paisCodigo = 'PE') {
    const fechaEmision = String(emissionDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) {
      return;
    }

    const timeZone =
      paisCodigo === 'AR'
        ? 'America/Argentina/Buenos_Aires'
        : paisCodigo === 'CO'
          ? 'America/Bogota'
          : 'America/Lima';
    const hoyLocal = new Date().toLocaleDateString('en-CA', { timeZone });
    if (fechaEmision > hoyLocal) {
      throw new BadRequestException(
        `La fecha de emisión (${fechaEmision}) no puede ser futura; la fecha local es ${hoyLocal}`,
      );
    }
  }

  /**
   * Normaliza el certificado recibido desde Supabase (puede llegar como base64, Buffer JSON o ArrayBuffer)
   */




  /** Mapea el estado del CPE al estado del documento operativo del módulo Documentos. */





private async getEmpresaEmisorInfo(tenantId: string) {
    return this.deliveryService.getEmpresaEmisorInfo(tenantId);
  }

private getEmpresaEmisorInfoStrict(tenantId: string) {
    return this.registrationService.getEmpresaEmisorInfoStrict(tenantId);
  }

  private roundAtomicMoney(value: unknown): number {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException('Los importes del comprobante deben ser numéricos');
    }
    return Number(numeric.toFixed(2));
  }

  private calcularAjustePorTasa(total: number, aplica: unknown, tasa: unknown): number {
    const porcentaje = Number(tasa ?? 0);
    if (!aplica || !Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
    return this.roundAtomicMoney(total * (porcentaje / 100));
  }

  /**
   * Prepara la proyección financiera antes de abrir la transacción 443. La RPC
   * vuelve a validar todos los importes; esta lectura sólo resuelve la política
   * tributaria que debe quedar congelada junto con la factura.
   */
  private async prepararCxcAtomica(
    dto: CreateFacturaDto,
    tenantId: string,
    total: number,
  ): Promise<Record<string, unknown> | null> {
    const esCredito =
      (dto as any).condicion_pago === 'CREDITO' || (dto as any).es_credito === true;
    if (!esCredito) return null;

    const clienteId = String((dto as any).cliente_id ?? '').trim();
    if (!clienteId) {
      throw new BadRequestException('Una venta a crédito requiere cliente_id');
    }

    const client = this.supabaseService.getClient();
    const [clienteResult, configResult] = await Promise.all([
      client
        .from('clientes')
        .select(
          'id,sujeto_retencion,retencion_tasa,sujeto_percepcion,percepcion_tasa,sujeto_detraccion,detraccion_tasa',
        )
        .eq('tenant_id', tenantId)
        .eq('id', clienteId)
        .maybeSingle(),
      client
        .from('empresa_config')
        .select(
          'aplicar_retencion,retencion_tasa,aplicar_percepcion,percepcion_tasa,aplicar_detraccion,detraccion_tasa,detraccion_codigo',
        )
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    if (clienteResult.error || !clienteResult.data) {
      throw new BadRequestException('El cliente de la venta a crédito no existe o no pertenece al tenant');
    }
    if (configResult.error && configResult.error.code !== 'PGRST116') {
      throw new BadRequestException('No se pudo resolver la configuración financiera de la empresa');
    }

    const cliente = clienteResult.data as any;
    const config = (configResult.data ?? {}) as any;
    const declarados = ((dto as any).ajustes ?? {}) as Record<string, unknown>;

    const resolveAjuste = (
      nombre: 'retencion' | 'percepcion' | 'detraccion',
      sujetoCliente: string,
      tasaCliente: string,
      aplicaEmpresa: string,
      tasaEmpresa: string,
    ) => {
      if (declarados[nombre] !== undefined && declarados[nombre] !== null) {
        return this.roundAtomicMoney(declarados[nombre]);
      }
      return this.calcularAjustePorTasa(
        total,
        cliente[sujetoCliente] ?? config[aplicaEmpresa] ?? false,
        cliente[tasaCliente] ?? config[tasaEmpresa] ?? 0,
      );
    };

    const retencion = resolveAjuste(
      'retencion',
      'sujeto_retencion',
      'retencion_tasa',
      'aplicar_retencion',
      'retencion_tasa',
    );
    const percepcion = resolveAjuste(
      'percepcion',
      'sujeto_percepcion',
      'percepcion_tasa',
      'aplicar_percepcion',
      'percepcion_tasa',
    );
    const detraccion = resolveAjuste(
      'detraccion',
      'sujeto_detraccion',
      'detraccion_tasa',
      'aplicar_detraccion',
      'detraccion_tasa',
    );
    const anticipo = this.roundAtomicMoney(declarados.anticipo ?? 0);

    if (Math.min(retencion, percepcion, detraccion, anticipo) < 0) {
      throw new BadRequestException('Los ajustes tributarios no pueden ser negativos');
    }

    const pendienteSinRedondear = total - retencion - detraccion - anticipo + percepcion;
    if (pendienteSinRedondear < -0.01) {
      throw new BadRequestException('Los ajustes tributarios superan el total de la factura');
    }

    return {
      cliente_id: clienteId,
      monto_total: total,
      monto_pendiente: this.roundAtomicMoney(Math.max(pendienteSinRedondear, 0)),
      retencion_total: retencion,
      percepcion_total: percepcion,
      detraccion_total: detraccion,
      anticipo_total: anticipo,
      detraccion_codigo:
        declarados.detraccion_codigo ?? config.detraccion_codigo ?? null,
    };
  }

  private construirDetallesAtomicos(dto: CreateFacturaDto): Array<Record<string, unknown>> {
    return dto.items.map((item: any, index) => {
      const valorVenta = this.roundAtomicMoney(item.valor_venta);
      const impuestoIgv = this.roundAtomicMoney(item.impuesto_igv ?? item.igv ?? 0);
      const impuestoIsc = this.roundAtomicMoney(item.impuesto_isc ?? 0);
      return {
        orden: index + 1,
        pedido_detalle_id: item.pedido_detalle_id ?? null,
        producto_id: item.producto_id ?? null,
        codigo_producto: item.codigo_producto ?? item.codigo,
        descripcion: item.descripcion,
        unidad_medida: item.unidad_medida ?? item.unidad,
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        descuento_unitario: Number(item.descuento_unitario ?? 0),
        valor_venta: valorVenta,
        impuesto_igv: impuestoIgv,
        impuesto_isc: impuestoIsc,
        total_item: this.roundAtomicMoney(valorVenta + impuestoIgv + impuestoIsc),
        afectacion_igv: item.afectacion_igv ?? item.tipo_afectacion_igv ?? null,
      };
    });
  }

  private async finalizarPostCommitCpe(
    cpe: any,
    dto: CreateFacturaDto,
    tenantId: string,
    userId: string | undefined,
    requiereTransporte: boolean,
  ): Promise<void> {
    if (requiereTransporte) {
      try {
        await Promise.resolve(
          this.eventBus.emit(
            'cpe.requiere_transporte',
            {
              cpeId: cpe.id,
              tenantId,
              tenant_id: tenantId,
              clienteId: (dto as any).cliente_id ?? dto.documento_receptor,
              total: dto.total_venta,
              productos: dto.items ?? [],
            },
            'cpe',
          ),
        );
      } catch (error) {
        this.logger.warn(`No se pudo publicar la sugerencia de transporte del CPE ${cpe.id}`, error);
      }
    }

    try {
      await this.auditService.registrarCambio(
        'cpe',
        'INSERT',
        userId ?? null,
        {
          new: {
            tipo_documento: dto.tipo_documento,
            serie: dto.serie,
            numero: dto.numero,
            total_venta: dto.total_venta,
            estado: cpe.estado,
          },
        },
        tenantId,
        cpe.id,
        { accion: 'CREAR_CPE_ATOMICO', tipo_documento: dto.tipo_documento },
      );
    } catch (error) {
      this.logger.warn(`No se pudo registrar auditoría post-commit del CPE ${cpe.id}`, error);
    }

    try {
      await this.cacheInvalidation.onCpeCreated(tenantId);
    } catch (error) {
      this.logger.warn(`No se pudo invalidar cache post-commit del CPE ${cpe.id}`, error);
    }
  }

  private async validarDocumentoPosReservado(
    dto: CreateFacturaDto,
    tenantId: string,
  ): Promise<void> {
    const ventaPosId = String((dto as any).venta_pos_id ?? '').trim();
    const documentoId = String((dto as any).documento_id ?? '').trim();
    if (!ventaPosId || !documentoId) {
      throw new BadRequestException(
        'La finalización CPE POS exige venta_pos_id y documento_id reservados',
      );
    }

    const { data: venta, error } = await this.supabaseService
      .getClient()
      .from('ventas_pos')
      .select('id, documento_id, cpe_id, cpe_data, total, cliente_documento, accounting_event_id, atomic_result')
      .eq('tenant_id', tenantId)
      .eq('id', ventaPosId)
      .single();
    const snapshot = venta?.cpe_data ?? {};
    const numeroSnapshot = String(snapshot.numero ?? '').padStart(8, '0');
    const numeroDto = String((dto as any).numero ?? '').padStart(8, '0');
    if (
      error || !venta || String(venta.documento_id ?? '') !== documentoId ||
      String(snapshot.documento_id ?? '') !== documentoId ||
      !venta.accounting_event_id || !venta.atomic_result ||
      String(snapshot.serie ?? '').toUpperCase() !== String(dto.serie ?? '').toUpperCase() ||
      numeroSnapshot !== numeroDto ||
      Math.abs(Number(venta.total ?? 0) - Number(dto.total_venta ?? 0)) > 0.01 ||
      String(venta.cliente_documento ?? '').trim() !== String(dto.documento_receptor ?? '').trim()
    ) {
      throw new BadRequestException(
        'El CPE POS no coincide con la venta y el documento reservados atómicamente',
      );
    }
  }

  async create(
    createFacturaDto: CreateFacturaDto,
    tenantId: string,
    userId?: string,
    options?: { finalizarDocumentoPosReservado?: boolean },
  ): Promise<FacturaDto> {
    try {
      const requestedType = String(createFacturaDto.tipo_documento ?? '').trim();
      if (['07', '08'].includes(requestedType)) {
        throw new BadRequestException(
          'Las notas 07/08 deben crearse desde /cpe/notas-referenciadas para exigir comprobante afectado, motivo y efecto financiero atómico',
        );
      }
      if (!['01', '03'].includes(requestedType)) {
        throw new BadRequestException(
          'La frontera genérica CPE sólo admite factura 01 y boleta 03; use el flujo fiscal especializado',
        );
      }
      if (!userId) {
        throw new BadRequestException('La emisión de un CPE exige un actor autenticado');
      }
      const supabaseClient = this.supabaseService.getClient();
      const paisCodigo = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
      if (paisCodigo === 'CO' && requestedType !== '01') {
        throw new BadRequestException(
          'DIAN: la frontera POS/CPE sólo admite factura electrónica tipo 01',
        );
      }
      const eventId = randomUUID();
      const emissionDate = this.resolveEmissionDate((createFacturaDto as any).fecha_emision);
      const issueTime = this.resolveIssueTime((createFacturaDto as any).fecha_emision);
      const dueDate = this.resolveDueDate(emissionDate, (createFacturaDto as any).fecha_vencimiento);
      const totalesCalculados = this.recalculateTotals(createFacturaDto);
      const { subtotal, totalIgv, totalIsc, total, gravadas, exoneradas, inafectas, exportacion } =
        totalesCalculados;
      this.assertProvidedTotalsMatch(createFacturaDto, totalesCalculados);
      this.assertReceptorValido(createFacturaDto, paisCodigo);
      this.assertSerieCoherenteConTipo(createFacturaDto, paisCodigo);
      this.assertFechaEmisionNoFutura(emissionDate, paisCodigo);
      const idempotencyKey = this.resolveIdempotencyKey(createFacturaDto, tenantId);
      const finalizaDocumentoPosReservado =
        options?.finalizarDocumentoPosReservado === true;
      if (finalizaDocumentoPosReservado) {
        await this.validarDocumentoPosReservado(createFacturaDto, tenantId);
      }
      const usaEmisionAtomica = !finalizaDocumentoPosReservado && ['01', '03'].includes(
        String(createFacturaDto.tipo_documento ?? '').trim(),
      );

      // Reemplazar totales con cálculo servidor. Las bases van separadas por
      // afectación: total_gravadas solo contiene lo que efectivamente paga IGV.
      (createFacturaDto as any).total_gravadas = gravadas;
      (createFacturaDto as any).total_exoneradas = exoneradas;
      (createFacturaDto as any).total_inafectas = inafectas;
      (createFacturaDto as any).total_exportacion = exportacion;
      (createFacturaDto as any).total_igv = totalIgv;
      (createFacturaDto as any).total_isc = totalIsc;
      (createFacturaDto as any).total_venta = total;

      (createFacturaDto as any).fecha_emision = emissionDate;
      (createFacturaDto as any).hora_emision = issueTime;
      (createFacturaDto as any).fecha_vencimiento = dueDate;
      (createFacturaDto as any).idempotency_key = idempotencyKey;

      // 443 y 476 son reparadores: incluso si el CPE ya existe deben recibir
      // el retry para completar documento, detalles, vínculo POS y outbox.

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
      
      // El establecimiento anexo del emisor lo decide la serie, que es como lo
      // decide SUNAT: cada sucursal tiene sus propias series y el codigo viaja
      // en cbc:AddressTypeCode. Hasta la 503 estaba fijado a '0000' en el
      // constructor del XML porque no habia de donde sacarlo.
      const codigoEstablecimiento = paisCodigo === 'PE'
        ? await this.sucursalesService.codigoEstablecimientoDeSerie(
          tenantId,
          createFacturaDto.serie,
        )
        : '0000';

      // Generate XML content
      const xmlContent = this.generateXmlContent({
        ...createFacturaDto,
        codigo_establecimiento: codigoEstablecimiento,
      } as CreateFacturaDto);
      
      // Sign XML with tenant's certificate
      const signedXml = xmlSigner.signXml(xmlContent);
      const hash = xmlSigner.generateHash(signedXml);
      if (!xmlSigner.validateSignatureStrict(signedXml)) {
        throw new BadRequestException('La firma XML generada no pudo validarse; no se persistió el CPE');
      }

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
        // Bases por afectación: sin persistirlas, una venta exonerada quedaría
        // registrada como si toda su base fuese gravada.
        total_exoneradas: (createFacturaDto as any).total_exoneradas ?? 0,
        total_inafectas: (createFacturaDto as any).total_inafectas ?? 0,
        total_exportacion: (createFacturaDto as any).total_exportacion ?? 0,
        total_igv: createFacturaDto.total_igv,
        total_venta: createFacturaDto.total_venta,
        metadata: paisCodigo === 'AR' ? {
          arca_punto_venta: Number(createFacturaDto.serie),
          arca_condicion_iva_emisor: (createFacturaDto as any).arca_condicion_iva_emisor ?? null,
          arca_condicion_iva_receptor: (createFacturaDto as any).arca_condicion_iva_receptor,
        } : {},
        // producto_id queda en documento_detalles. Se excluye del JSON legado
        // de CPE para que un retry posterior al despliegue pueda reconciliar
        // comprobantes creados por el payload histórico sin cambiar su huella.
        items: usaEmisionAtomica
          ? createFacturaDto.items.map(({
              producto_id: _productoId,
              pedido_detalle_id: _pedidoDetalleId,
              ...item
            }) => item)
          : createFacturaDto.items,
        fecha_emision: emissionDate,
        fecha_vencimiento: dueDate,
        idempotency_key: idempotencyKey,
        event_id: eventId,
        estado: 'FIRMADO',
        hash: hash,
        hash_firma: hash,
        sunat_status: usaEmisionAtomica
          ? this.sunatStatuses.READY
          : this.sunatStatuses.NOT_SENT,
        xml_firmado: signedXml,
      };

      if (usaEmisionAtomica) {
        const requiereTransporte = this.evaluarSiRequiereTransporte(createFacturaDto, paisCodigo);
        const detalles = this.construirDetallesAtomicos(createFacturaDto);
        const cxc = await this.prepararCxcAtomica(createFacturaDto, tenantId, total);
        const tipoCambio = String(createFacturaDto.moneda ?? 'PEN').toUpperCase() === 'PEN'
          ? 1
          : Number((createFacturaDto as any).tipo_cambio ?? 0);

        const pedidoId = (createFacturaDto as any).pedido_id ?? null;
        const atomicArgs = {
          p_tenant_id: tenantId,
          p_cpe: {
            ...cpeData,
            created_by: userId,
            costo_ventas: Number((createFacturaDto as any).costo_ventas ?? 0),
            requiere_transporte: requiereTransporte,
          },
          p_documento: {
            pedido_id: pedidoId,
            subtotal,
            impuesto_igv: totalIgv,
            impuesto_isc: totalIsc,
            total,
            tipo_cambio: tipoCambio,
            metadata: {
              source: pedidoId ? 'ventas.pedidos.atomic' : 'cpe.api.atomic',
              pais: paisCodigo,
            },
          },
          p_detalles: detalles,
          p_cxc: cxc,
          p_event_id: eventId,
          p_idempotency_key: idempotencyKey,
        };
        const rpcName = pedidoId
          ? 'facturar_pedido_venta_tx'
          : 'emitir_factura_cliente_tx';
        const rpcArgs = pedidoId
          ? {
              p_pedido_id: pedidoId,
              p_actor_id: userId,
              ...atomicArgs,
            }
          : atomicArgs;
        const { data: atomicResult, error: atomicError } = await supabaseClient.rpc(
          rpcName,
          rpcArgs,
        );

        if (atomicError) {
          this.logger.error(
            `No se pudo emitir la factura atómica ${idempotencyKey}: ${atomicError.message}`,
            atomicError,
          );
          throw new BadRequestException(
            `No se pudo emitir la factura de forma transaccional: ${atomicError.message}`,
          );
        }

        const resultPayload = Array.isArray(atomicResult) ? atomicResult[0] : atomicResult;
        const persistedCpe = resultPayload?.cpe;
        if (!persistedCpe?.id || !resultPayload?.documento_id) {
          throw new BadRequestException('La emisión transaccional no devolvió el CPE/documento persistido');
        }

        const mappedCpe = {
          ...persistedCpe,
          documento_id: resultPayload.documento_id,
          documentoId: resultPayload.documento_id,
          cxc_id: resultPayload.cxc_id ?? null,
        };

        await this.finalizarPostCommitCpe(
          mappedCpe,
          createFacturaDto,
          tenantId,
          userId,
          requiereTransporte,
        );

        return this.mapToDto(mappedCpe);
      }

      if (!finalizaDocumentoPosReservado) {
        throw new BadRequestException('La emisión CPE no resolvió una frontera transaccional válida');
      }

      const ventaPosId = String((createFacturaDto as any).venta_pos_id ?? '').trim();
      const { data: posResult, error: posError } = await supabaseClient.rpc('finalizar_cpe_pos_tx', {
        p_tenant_id: tenantId,
        p_actor_id: userId,
        p_venta_id: ventaPosId,
        p_cpe: {
          ...cpeData,
          documento_id: (createFacturaDto as any).documento_id,
          venta_pos_id: ventaPosId,
          created_by: userId,
          metadata: {
            source: 'pos.atomic.476',
            venta_pos_id: ventaPosId,
          },
        },
        p_idempotency_key: idempotencyKey,
      });
      if (posError) {
        throw new BadRequestException(`No se pudo finalizar el CPE POS atómicamente: ${posError.message}`);
      }
      const finalized = Array.isArray(posResult) ? posResult[0] : posResult;
      if (!finalized?.cpe?.id || !finalized?.documento_id || !finalized?.venta?.cpe_id) {
        throw new BadRequestException('El finalizador POS no devolvió sus postcondiciones completas');
      }
      return this.mapToDto({ ...finalized.cpe, documento_id: finalized.documento_id });
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
    ).trim();
    const tipoDocumentoReceptor = this.resolveTipoDocumentoReceptor(
      tipoDocumento,
      payload?.tipo_documento_receptor ?? payload?.clienteTipoDocumento,
      documentoReceptor,
      emisor.pais,
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
      moneda: payload?.moneda || emisor.moneda,
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

async registerDesktopSignedXml(payload: DesktopSignedCpeDto, tenantId: string, userId: string) {
    return this.registrationService.registerDesktopSignedXml(payload, tenantId, userId);
  }



  async crearCPEDesdeDocumento(documento: DocumentoFiscal, tenantId: string, actorId: string) {
    if (!actorId) {
      throw new BadRequestException('Crear CPE desde documento exige un actor autenticado');
    }
    const tipoDocumentoSunat = this.normalizeTipoDocumentoSunat(documento.tipo_documento);
    const correlativo = Number(documento.numero);
    const dto = {
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
      items: documento.detalles.map((detalle, index) => ({
        codigo: (detalle as any).codigo_producto ?? `ITEM-${index + 1}`,
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        valor_venta: detalle.valor_venta,
        igv: detalle.impuesto_igv,
        total: detalle.total_item,
        unidad: (detalle as any).unidad_medida ?? 'NIU',
        tipo_afectacion_igv: Number(detalle.impuesto_igv) > 0 ? '10' : '20',
        producto_id: (detalle as any).producto_id ?? undefined,
      })),
      idempotency_key: `doc.cpe:${documento.id}`,
      condicion_pago: 'CONTADO',
      es_credito: false,
    } as unknown as CreateFacturaDto;

    return this.create(dto, tenantId, actorId);
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

async resendToOse(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    const result = await this.deliveryService.resendToOse(id, tenantId, options);
    const anulacion = await this.cancellationService.finalizarAnulacionAceptada(id, tenantId);
    return anulacion ? { ...result, anulacion } : result;
  }

  /**
   * Enviar manualmente CPE firmado a SUNAT
   */
async sendToOseManual(
    id: string,
    xmlFirmado: string,
    fileName: string,
    options: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
    tenantId: string,
  ) {
    const result = await this.deliveryService.sendToOseManual(
      id,
      xmlFirmado,
      fileName,
      { ...options, tenantId },
    );
    await this.cancellationService.finalizarAnulacionAceptada(id, tenantId);
    return result;
  }

async checkOseStatus(
    id: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    const result = await this.deliveryService.checkOseStatus(id, tenantId, options);
    const anulacion = await this.cancellationService.finalizarAnulacionAceptada(id, tenantId);
    return anulacion ? { ...result, anulacion } : result;
  }

  /**
   * Reintentar envío de CPE (método público para SunatRetryService)
   */
async retrySendToOse(
    cpeId: string,
    tenantId: string,
    options?: { idempotencyKey?: string; actorId?: string; origin?: 'USER' | 'WORKER' | 'SYSTEM' },
  ) {
    return this.deliveryService.retrySendToOse(cpeId, tenantId, options);
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











  private evaluarSiRequiereTransporte(createFacturaDto: CreateFacturaDto, paisCodigo = 'PE'): boolean {
    if (paisCodigo !== 'PE') {
      return false;
    }
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

private resolveTipoDocumentoReceptor(tipoDocumento: string, provided: any, documento: string, pais = 'PE'): string {
    return this.registrationService.resolveTipoDocumentoReceptor(tipoDocumento, provided, documento, pais);
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
   * Solicita la nota 07; los reversos se cierran atómicamente tras ACEPTADO+CDR.
   */
async anularComprobante(
  cpeId: string,
  motivo: string,
  tenantId: string,
  userId?: string,
  tipoNota: string = '01',
  idempotencyKey?: string,
): Promise<any> {
    return this.cancellationService.anularComprobante(
      cpeId,
      motivo,
      tenantId,
      userId,
      tipoNota,
      idempotencyKey,
    );
}

async obtenerEstadoFinancieroAnulacion(
  cpeId: string,
  tenantId: string,
  userId?: string,
): Promise<any> {
  return this.cancellationService.obtenerEstadoFinanciero(
    cpeId,
    tenantId,
    userId,
  );
}

async revertirCobroAplicado(
  cpeId: string,
  pagoId: string,
  payload: { motivo: string; sesion_caja_id?: string },
  tenantId: string,
  userId?: string,
  idempotencyKey?: string,
): Promise<any> {
  return this.cancellationService.revertirCobroAplicado(
    cpeId,
    pagoId,
    payload,
    tenantId,
    userId,
    idempotencyKey,
  );
}

async revertirAjusteAplicado(
  cpeId: string,
  operacionId: string,
  payload: { motivo: string },
  tenantId: string,
  userId?: string,
  idempotencyKey?: string,
): Promise<any> {
  return this.cancellationService.revertirAjusteAplicado(
    cpeId,
    operacionId,
    payload,
    tenantId,
    userId,
    idempotencyKey,
  );
}

async finalizarAnulacionFinanciera(
  notaCreditoId: string,
  tenantId: string,
  userId?: string,
  idempotencyKey?: string,
): Promise<any> {
  return this.cancellationService.finalizarAnulacionAceptada(
    notaCreditoId,
    tenantId,
    userId,
    idempotencyKey,
  );
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
