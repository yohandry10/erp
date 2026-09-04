import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
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
import {
  DianGenerationContext,
  DianReceiverTaxProfile,
  DocumentoElectronico,
} from '../../shared/integration/fiscal.interfaces';
import type { DianTaxInput } from '../fiscal/colombia/dian-xml-builder.service';

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
      if (!/^[A-Z0-9]{0,4}$/.test(serie)) {
        throw new BadRequestException(
          'El prefijo DIAN es opcional; cuando exista debe tener entre 1 y 4 caracteres alfanuméricos',
        );
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

  /**
   * Cierra la ecuacion monetaria de cada linea DIAN antes de reservar un
   * correlativo. La tolerancia es de un centavo por importe; tasas expresadas
   * como razon (0.19) o porcentaje (19) se normalizan a porcentaje.
   */
  private normalizeAndValidateDianLines(
    dto: CreateFacturaDto,
    configuredVatRateInput: unknown,
  ): void {
    const moneyTolerance = 0.01;
    const number = (value: unknown, label: string): number => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`DIAN: ${label} debe ser numerico`);
      }
      return parsed;
    };
    const declared = (item: any, aliases: string[]): Array<[string, number]> =>
      aliases
        .filter((alias) => item[alias] !== undefined && item[alias] !== null && item[alias] !== '')
        .map((alias) => [alias, number(item[alias], alias)]);
    const assertMoney = (
      entries: Array<[string, number]>,
      expected: number,
      line: number,
      concept: string,
    ) => {
      for (const [field, value] of entries) {
        if (Math.abs(value - expected) > moneyTolerance + Number.EPSILON) {
          throw new BadRequestException(
            `DIAN: linea ${line}, ${concept} inconsistente: ${field}=${value.toFixed(2)} y corresponde ${expected.toFixed(2)}`,
          );
        }
      }
    };
    const percent = (value: number): number => {
      if (value < 0 || value > 100) {
        throw new BadRequestException('DIAN: la tasa tributaria debe estar entre 0 y 100');
      }
      return value > 0 && value <= 1 ? value * 100 : value;
    };
    const configuredVatRateValue = Number(configuredVatRateInput);
    if (!Number.isFinite(configuredVatRateValue)) {
      throw new BadRequestException(
        'DIAN: la tasa de IVA del contribuyente no esta configurada',
      );
    }
    const configuredVatRate = percent(configuredVatRateValue);

    dto.items = dto.items.map((raw: any, index) => {
      const line = index + 1;
      const item = { ...raw };
      const quantity = number(item.cantidad, `la cantidad de la linea ${line}`);
      const unitPrice = number(
        item.precio_unitario ?? item.precioUnitario,
        `el precio unitario de la linea ${line}`,
      );
      const unitDiscount = number(
        item.descuento_unitario ?? item.descuentoUnitario ?? 0,
        `el descuento unitario de la linea ${line}`,
      );
      if (quantity <= 0 || unitPrice < 0 || unitDiscount < 0 || unitDiscount > unitPrice) {
        throw new BadRequestException(
          `DIAN: linea ${line}, cantidad, precio y descuento unitario son invalidos`,
        );
      }
      if (unitDiscount > 0) {
        throw new BadRequestException(
          `DIAN: linea ${line}, el descuento requiere codigo y motivo DIAN explicitos antes de reservar`,
        );
      }

      const affectations = [
        item.afectacion_igv,
        item.tipo_afectacion_igv,
        item.afectacionIgv,
        item.tipoAfectacionIgv,
      ]
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
        .map((value) => String(value).trim());
      const uniqueAffectations = [...new Set(affectations)];
      if (uniqueAffectations.length !== 1 || !['10', '20', '30'].includes(uniqueAffectations[0])) {
        throw new BadRequestException(
          `DIAN: la linea ${line} debe conservar una unica afectacion tributaria 10, 20 o 30`,
        );
      }
      const affectation = uniqueAffectations[0];
      const base = this.roundAtomicMoney(quantity * (unitPrice - unitDiscount));
      const baseEntries = declared(item, ['valor_venta', 'valorVenta']);
      if (baseEntries.length === 0) {
        throw new BadRequestException(`DIAN: la linea ${line} debe declarar su base de venta`);
      }
      assertMoney(baseEntries, base, line, 'base de venta');

      const vatEntries = declared(item, ['impuesto_igv', 'igv']);
      const vat = this.roundAtomicMoney(vatEntries[0]?.[1] ?? 0);
      assertMoney(vatEntries, vat, line, 'IVA');
      const vatRateEntries = declared(item, ['tasa_igv', 'tasaIgv']);
      const vatRate = vatRateEntries.length > 0
        ? percent(vatRateEntries[0][1])
        : (base > 0 ? vat * 100 / base : 0);
      for (const [field, value] of vatRateEntries) {
        if (Math.abs(percent(value) - vatRate) > 0.0001) {
          throw new BadRequestException(`DIAN: linea ${line}, ${field} es contradictoria`);
        }
      }
      const expectedVat = affectation === '10'
        ? this.roundAtomicMoney(base * vatRate / 100)
        : 0;
      if (affectation === '10' && Math.abs(vatRate - configuredVatRate) > 0.0001) {
        throw new BadRequestException(
          `DIAN: linea ${line}, la tasa de IVA ${vatRate.toFixed(4)}% no coincide con la configurada (${configuredVatRate.toFixed(4)}%)`,
        );
      }
      if (Math.abs(vat - expectedVat) > moneyTolerance + Number.EPSILON) {
        throw new BadRequestException(
          `DIAN: linea ${line}, IVA ${vat.toFixed(2)} no corresponde a base y tasa (${expectedVat.toFixed(2)})`,
        );
      }
      if (affectation !== '10' && vatRate > 0) {
        throw new BadRequestException(
          `DIAN: linea ${line}, una afectacion ${affectation} no puede declarar tasa de IVA positiva`,
        );
      }

      const incEntries = declared(item, ['impuesto_isc', 'impuestoInc', 'inc']);
      const inc = this.roundAtomicMoney(incEntries[0]?.[1] ?? 0);
      if (inc < 0) {
        throw new BadRequestException(`DIAN: linea ${line}, el INC no puede ser negativo`);
      }
      assertMoney(incEntries, inc, line, 'INC');
      const incRateEntries = declared(item, ['tasa_isc', 'tasa_inc', 'tasaInc']);
      const incRate = incRateEntries.length > 0
        ? percent(incRateEntries[0][1])
        : (base > 0 ? inc * 100 / base : 0);
      for (const [field, value] of incRateEntries) {
        if (Math.abs(percent(value) - incRate) > 0.0001) {
          throw new BadRequestException(`DIAN: linea ${line}, ${field} es contradictoria`);
        }
      }
      const expectedInc = this.roundAtomicMoney(base * incRate / 100);
      if (Math.abs(inc - expectedInc) > moneyTolerance + Number.EPSILON) {
        throw new BadRequestException(
          `DIAN: linea ${line}, INC ${inc.toFixed(2)} no corresponde a base y tasa (${expectedInc.toFixed(2)})`,
        );
      }

      const lineTotal = this.roundAtomicMoney(base + vat + inc);
      const totalEntries = declared(item, [
        'total_item', 'totalItem', 'total',
      ]);
      assertMoney(totalEntries, lineTotal, line, 'total');
      const unitGross = this.roundAtomicMoney(lineTotal / quantity);
      assertMoney(
        declared(item, ['precio_venta', 'precioVenta']),
        unitGross,
        line,
        'precio de venta unitario con tributos',
      );

      return {
        ...item,
        cantidad: quantity,
        precio_unitario: unitPrice,
        descuento_unitario: unitDiscount,
        valor_venta: base,
        impuesto_igv: vat,
        igv: vat,
        tasa_igv: vatRate,
        impuesto_isc: inc,
        tasa_isc: incRate,
        total_item: lineTotal,
        total: lineTotal,
        precio_venta: unitGross,
        afectacion_igv: affectation,
        tipo_afectacion_igv: affectation,
      };
    });
  }

  private normalizeDianPaymentForm(value: unknown): 'CONTADO' | 'CREDITO' {
    const raw = String(value ?? 'CONTADO').trim().toUpperCase();
    if (raw === '1' || raw === 'CONTADO') return 'CONTADO';
    if (raw === '2' || raw === 'CREDITO' || raw === 'CRÉDITO') return 'CREDITO';
    throw new BadRequestException('DIAN: la forma de pago debe ser CONTADO o CREDITO');
  }

  private normalizeDianPaymentMeans(
    value: unknown,
    paymentForm: 'CONTADO' | 'CREDITO',
  ): string {
    const raw = String(value ?? '').trim().toUpperCase();
    if (!raw) return paymentForm === 'CREDITO' ? '1' : '10';
    if (paymentForm === 'CREDITO' && ['2', 'CREDITO', 'CRÉDITO'].includes(raw)) return '1';
    if (/^\d{1,3}$/.test(raw) || raw === 'ZZZ') return raw;
    throw new BadRequestException(
      'DIAN: selecciona un medio de pago válido del catálogo 49 (1-3 dígitos o ZZZ)',
    );
  }

  private resolveDianCreditDueDate(
    emissionDate: string,
    paymentTermDays: number,
    dueDateValue: unknown,
  ): string {
    if (!Number.isSafeInteger(paymentTermDays) || paymentTermDays < 1) {
      throw new BadRequestException('DIAN: una venta a crédito requiere un plazo de pago positivo');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(emissionDate)) {
      throw new BadRequestException('DIAN: emisión y vencimiento deben usar fecha calendario YYYY-MM-DD');
    }
    const expectedDueDate = new Date(`${emissionDate}T00:00:00.000Z`);
    if (
      Number.isNaN(expectedDueDate.getTime())
      || expectedDueDate.toISOString().slice(0, 10) !== emissionDate
    ) {
      throw new BadRequestException('DIAN: fecha de emisión inválida');
    }
    expectedDueDate.setUTCDate(expectedDueDate.getUTCDate() + paymentTermDays);
    const expected = expectedDueDate.toISOString().slice(0, 10);
    const dueDate = String(dueDateValue ?? '').trim();
    if (!dueDate) return expected;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new BadRequestException('DIAN: emisión y vencimiento deben usar fecha calendario YYYY-MM-DD');
    }
    if (dueDate !== expected) {
      throw new BadRequestException(
        'DIAN: la fecha de vencimiento debe coincidir con el plazo de pago declarado',
      );
    }
    return dueDate;
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
        tasa_igv: Number(item.tasa_igv ?? item.tasaIgv ?? 0),
        tasa_isc: Number(item.tasa_isc ?? item.tasa_inc ?? item.tasaInc ?? 0),
        total_item: this.roundAtomicMoney(valorVenta + impuestoIgv + impuestoIsc),
        afectacion_igv: item.afectacion_igv ?? item.tipo_afectacion_igv ?? null,
      };
    });
  }

  private canonicalDianIntentText(value: unknown, upper = false): string {
    const normalized = String(value ?? '').normalize('NFKC').trim();
    return upper ? normalized.toUpperCase() : normalized;
  }

  private canonicalDianIntentNumber(value: unknown, field: string): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`DIAN: ${field} debe ser numérico para reservar la numeración`);
    }
    // Number#toString elimina diferencias cosméticas (1, 1.0, 1e0) sin
    // redondear cantidades o precios que sí llegan al XML fiscal.
    return Object.is(numeric, -0) ? '0' : numeric.toString();
  }

  private canonicalDianIntentMoney(value: unknown, field: string): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`DIAN: ${field} debe ser numérico para reservar la numeración`);
    }
    return numeric.toFixed(2);
  }

  private buildDianReservationIntentFingerprint(
    dto: CreateFacturaDto,
    tenantId: string,
    context: Awaited<ReturnType<CpeService['loadDianCreationContext']>>,
    totals: ReturnType<CpeService['recalculateTotals']>,
    emissionDate: string,
    dueDate: string,
    pedidoId?: string,
  ): string {
    const receiverIdentity = normalizeDianIdentity(
      context.receiver.documentoTipo,
      context.receiver.documentoNumero,
    );
    const profile = context.receiver.dianTaxProfile ?? {};
    const lines = this.construirDetallesAtomicos(dto).map((line) => ({
      order: Number(line.orden),
      orderDetailId: this.canonicalDianIntentText(line.pedido_detalle_id) || null,
      productId: this.canonicalDianIntentText(line.producto_id) || null,
      productCode: this.canonicalDianIntentText(line.codigo_producto),
      description: this.canonicalDianIntentText(line.descripcion),
      unitCode: this.canonicalDianIntentText(line.unidad_medida, true),
      quantity: this.canonicalDianIntentNumber(line.cantidad, 'la cantidad'),
      unitPrice: this.canonicalDianIntentNumber(line.precio_unitario, 'el precio unitario'),
      unitDiscount: this.canonicalDianIntentNumber(
        line.descuento_unitario,
        'el descuento unitario',
      ),
      lineExtension: this.canonicalDianIntentMoney(line.valor_venta, 'el valor de venta'),
      vatAmount: this.canonicalDianIntentMoney(line.impuesto_igv, 'el IVA de la línea'),
      vatRate: this.canonicalDianIntentNumber(line.tasa_igv, 'la tasa de IVA de la línea'),
      exciseAmount: this.canonicalDianIntentMoney(line.impuesto_isc, 'el INC de la línea'),
      exciseRate: this.canonicalDianIntentNumber(
        line.tasa_isc,
        'la tasa de INC de la línea',
      ),
      lineTotal: this.canonicalDianIntentMoney(line.total_item, 'el total de la línea'),
      taxAffectation: this.canonicalDianIntentText(line.afectacion_igv),
    }));
    const intent = {
      version: 1,
      tenantId,
      document: {
        type: this.canonicalDianIntentText(dto.tipo_documento, true),
        issueDate: emissionDate,
        dueDate,
        currency: this.canonicalDianIntentText(dto.moneda, true),
        orderId: this.canonicalDianIntentText(pedidoId) || null,
      },
      issuer: {
        taxId: this.canonicalDianIntentText(context.emisor.ruc),
        legalName: this.canonicalDianIntentText(context.emisor.razonSocial),
        address: this.canonicalDianIntentText(context.emisor.direccion),
        city: this.canonicalDianIntentText(context.emisor.ciudad),
        department: this.canonicalDianIntentText(context.emisor.departamento),
        daneCode: this.canonicalDianIntentText(context.emisor.codigoUbigeo),
        fiscalRegime: this.canonicalDianIntentText(context.emisor.regimenFiscal),
        taxpayerType: this.canonicalDianIntentText(context.emisor.tipoContribuyente),
        vatRate: this.canonicalDianIntentNumber(
          context.emisor.igvPorcentaje,
          'la tasa tributaria del emisor',
        ),
        certificateSha256: this.canonicalDianIntentText(
          context.emisor.certificateSha256,
          true,
        ),
        signingConfigSha256: this.canonicalDianIntentText(
          context.emisor.signingConfigSha256,
          true,
        ),
        resolutionNumber: this.canonicalDianIntentText(context.emisor.dianResolucionNumero),
        resolutionPrefix: this.canonicalDianIntentText(
          context.emisor.dianResolucionPrefijo,
          true,
        ),
        rangeFrom: context.emisor.dianResolucionDesde ?? null,
        rangeTo: context.emisor.dianResolucionHasta ?? null,
        validFrom: this.canonicalDianIntentText(context.emisor.dianResolucionFechaInicio) || null,
        validTo: this.canonicalDianIntentText(context.emisor.dianResolucionFechaFin) || null,
      },
      receiver: {
        customerId: this.canonicalDianIntentText(context.receiver.id),
        documentType: receiverIdentity.type,
        documentNumber: receiverIdentity.canonicalNumber,
        legalName: this.canonicalDianIntentText(context.receiver.razonSocial),
        address: this.canonicalDianIntentText(context.receiver.direccion),
        taxProfile: {
          profile: this.canonicalDianIntentText(profile.profile),
          taxLevelCode: this.canonicalDianIntentText(profile.taxLevelCode),
          taxLevelListName: this.canonicalDianIntentText(profile.taxLevelListName),
          taxSchemeId: this.canonicalDianIntentText(profile.taxSchemeId),
          taxSchemeName: this.canonicalDianIntentText(profile.taxSchemeName),
        },
      },
      payment: {
        condition: this.canonicalDianIntentText((dto as any).condicion_pago, true),
        means: this.canonicalDianIntentText((dto as any).medio_pago, true),
        termDays: this.canonicalDianIntentNumber(
          (dto as any).plazo_pago_dias ?? 0,
          'el plazo de pago',
        ),
        dueDate,
      },
      totals: {
        subtotal: this.canonicalDianIntentMoney(totals.subtotal, 'el subtotal'),
        taxable: this.canonicalDianIntentMoney(totals.gravadas, 'la base gravada'),
        exempt: this.canonicalDianIntentMoney(totals.exoneradas, 'la base exenta'),
        excluded: this.canonicalDianIntentMoney(totals.inafectas, 'la base excluida'),
        export: this.canonicalDianIntentMoney(totals.exportacion, 'la base de exportación'),
        vat: this.canonicalDianIntentMoney(totals.totalIgv, 'el IVA total'),
        excise: this.canonicalDianIntentMoney(totals.totalIsc, 'el INC total'),
        payable: this.canonicalDianIntentMoney(totals.total, 'el total pagadero'),
      },
      lines,
    };
    return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex');
  }

  /**
   * Huella del contrato público recibido por la creación directa. Se calcula
   * antes de consultar maestros/configuración para poder devolver un retry ya
   * completado sin volver a DIAN, y nunca contiene secretos del firmador.
   */
  private buildDirectDianRequestFingerprint(
    dto: CreateFacturaDto,
    tenantId: string,
  ): string {
    const itemValue = (item: any, aliases: string[]) => {
      for (const alias of aliases) {
        if (item?.[alias] !== undefined && item?.[alias] !== null) return item[alias];
      }
      return null;
    };
    const optionalNumber = (value: unknown, field: string): string | null =>
      value === undefined || value === null || value === ''
        ? null
        : this.canonicalDianIntentNumber(value, field);
    const items = Array.isArray(dto.items) ? dto.items.map((item: any, index) => ({
      order: index + 1,
      productId: this.canonicalDianIntentText(item.producto_id) || null,
      orderDetailId: this.canonicalDianIntentText(item.pedido_detalle_id) || null,
      code: this.canonicalDianIntentText(itemValue(item, ['codigo_producto', 'codigo'])),
      description: this.canonicalDianIntentText(item.descripcion),
      unit: this.canonicalDianIntentText(itemValue(item, ['unidad_medida', 'unidad']), true),
      quantity: optionalNumber(item.cantidad, `cantidad de la línea ${index + 1}`),
      unitPrice: optionalNumber(
        itemValue(item, ['precio_unitario', 'precioUnitario']),
        `precio unitario de la línea ${index + 1}`,
      ),
      unitDiscount: optionalNumber(
        itemValue(item, ['descuento_unitario', 'descuentoUnitario']) ?? 0,
        `descuento unitario de la línea ${index + 1}`,
      ),
      base: optionalNumber(
        itemValue(item, ['valor_venta', 'valorVenta']),
        `base de la línea ${index + 1}`,
      ),
      vat: optionalNumber(
        itemValue(item, ['impuesto_igv', 'igv']),
        `IVA de la línea ${index + 1}`,
      ),
      vatRate: optionalNumber(
        itemValue(item, ['tasa_igv', 'tasaIgv']),
        `tasa IVA de la línea ${index + 1}`,
      ),
      excise: optionalNumber(
        itemValue(item, ['impuesto_isc', 'impuestoInc', 'inc']),
        `INC de la línea ${index + 1}`,
      ),
      exciseRate: optionalNumber(
        itemValue(item, ['tasa_isc', 'tasa_inc', 'tasaInc']),
        `tasa INC de la línea ${index + 1}`,
      ),
      total: optionalNumber(
        itemValue(item, ['total_item', 'totalItem', 'total']),
        `total de la línea ${index + 1}`,
      ),
      unitGross: optionalNumber(
        itemValue(item, ['precio_venta', 'precioVenta']),
        `precio bruto de la línea ${index + 1}`,
      ),
      affectation: this.canonicalDianIntentText(
        itemValue(item, [
          'afectacion_igv', 'tipo_afectacion_igv', 'afectacionIgv', 'tipoAfectacionIgv',
        ]),
      ),
    })) : [];
    const intent = {
      version: 1,
      tenantId,
      type: this.canonicalDianIntentText(dto.tipo_documento, true),
      issueDate: this.canonicalDianIntentText((dto as any).fecha_emision),
      dueDate: this.canonicalDianIntentText((dto as any).fecha_vencimiento) || null,
      customerId: this.canonicalDianIntentText((dto as any).cliente_id) || null,
      issuer: {
        taxId: this.canonicalDianIntentText(dto.ruc_emisor),
        legalName: this.canonicalDianIntentText(dto.razon_social_emisor),
        address: this.canonicalDianIntentText((dto as any).direccion_emisor),
      },
      receiver: {
        type: this.canonicalDianIntentText(dto.tipo_documento_receptor, true),
        number: this.canonicalDianIntentText(dto.documento_receptor),
        legalName: this.canonicalDianIntentText(dto.razon_social_receptor),
        address: this.canonicalDianIntentText(dto.direccion_receptor),
      },
      currency: this.canonicalDianIntentText(dto.moneda, true),
      payment: {
        form: this.canonicalDianIntentText((dto as any).condicion_pago, true),
        means: this.canonicalDianIntentText((dto as any).medio_pago, true),
        termDays: optionalNumber((dto as any).plazo_pago_dias ?? 0, 'plazo de pago'),
      },
      declaredTotals: {
        taxable: optionalNumber(dto.total_gravadas, 'base gravada'),
        exempt: optionalNumber((dto as any).total_exoneradas, 'base exenta'),
        excluded: optionalNumber((dto as any).total_inafectas, 'base excluida'),
        export: optionalNumber((dto as any).total_exportacion, 'base exportación'),
        vat: optionalNumber(dto.total_igv, 'IVA total'),
        excise: optionalNumber((dto as any).total_isc, 'INC total'),
        payable: optionalNumber(dto.total_venta, 'total pagadero'),
      },
      items,
    };
    return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex');
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
    requireDianReservation = false,
  ): Promise<string | null> {
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
    const snapshotMetadata = snapshot?.metadata && typeof snapshot.metadata === 'object'
      && !Array.isArray(snapshot.metadata)
      ? snapshot.metadata
      : {};
    const numeroSnapshot = String(snapshot.numero ?? '').padStart(8, '0');
    const numeroDto = String((dto as any).numero ?? '').padStart(8, '0');
    const numeroFiscalEsperado = `${String(snapshot.serie ?? '').trim()}${Number(snapshot.numero)}`;
    const horaSnapshot = String(snapshot.hora_emision ?? '').trim();
    const horaMetadata = String(snapshotMetadata.dian_hora_emision ?? '').trim();
    const esReservaDian = Number(snapshotMetadata.dian_numbering_contract_version) === 530;
    if (
      error || !venta || String(venta.documento_id ?? '') !== documentoId ||
      String(snapshot.documento_id ?? '') !== documentoId ||
      !venta.accounting_event_id || !venta.atomic_result ||
      String(snapshot.serie ?? '').toUpperCase() !== String(dto.serie ?? '').toUpperCase() ||
      numeroSnapshot !== numeroDto ||
      Math.abs(Number(venta.total ?? 0) - Number(dto.total_venta ?? 0)) > 0.01 ||
      String(venta.cliente_documento ?? '').trim() !== String(dto.documento_receptor ?? '').trim() ||
      (requireDianReservation && (
        !esReservaDian
        || !String(snapshotMetadata.dian_number_reservation_id ?? '').trim()
        || String(snapshotMetadata.dian_prefijo_autorizado ?? '').trim().toUpperCase()
          !== String(snapshot.serie ?? '').trim().toUpperCase()
        || String(snapshotMetadata.numero_fiscal ?? '').trim() !== numeroFiscalEsperado
        || !/^\d{2}:\d{2}:\d{2}$/.test(horaSnapshot)
        || horaMetadata !== horaSnapshot
        || String(snapshotMetadata.dian_fecha_emision ?? '').slice(0, 10)
          !== String((dto as any).fecha_emision ?? '').slice(0, 10)
      ))
    ) {
      throw new BadRequestException(
        'El CPE POS no coincide con la venta y el documento reservados atómicamente',
      );
    }
    return requireDianReservation ? horaSnapshot : null;
  }

  private dianTaxCategoryForItem(
    item: Record<string, any>,
    index: number,
  ): 'GRAVADO' | 'EXENTO' | 'EXCLUIDO' {
    const declared = [
      item.afectacion_igv,
      item.tipo_afectacion_igv,
      item.afectacionIgv,
      item.tipoAfectacionIgv,
    ]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => String(value).trim());
    const unique = [...new Set(declared)];
    if (unique.length !== 1 || !['10', '20', '30'].includes(unique[0])) {
      throw new BadRequestException(
        `DIAN: el item ${index + 1} debe conservar una única afectación tributaria 10, 20 o 30`,
      );
    }
    const tax = Number(item.impuesto_igv ?? item.igv ?? 0);
    if (unique[0] !== '10' && Math.abs(tax) > 0.01) {
      throw new BadRequestException(
        `DIAN: el item ${index + 1} no puede declarar IVA positivo con afectación ${unique[0]}`,
      );
    }
    return unique[0] === '10' ? 'GRAVADO' : unique[0] === '20' ? 'EXENTO' : 'EXCLUIDO';
  }

  private async loadDianCreationContext(dto: CreateFacturaDto, tenantId: string) {
    const emisor = await this.getEmpresaEmisorInfoStrict(tenantId);
    if (!emisor.isDemo) {
      const invalidIssuerFields = [
        !String(emisor.direccion ?? '').trim(),
        !String(emisor.ciudad ?? '').trim(),
        !String(emisor.departamento ?? '').trim(),
        !/^\d{5}$/.test(String(emisor.codigoUbigeo ?? '').trim()),
        !['1', '2'].includes(String(emisor.tipoContribuyente ?? '').trim()),
        !String(emisor.regimenFiscal ?? '').trim(),
        !/^[0-9a-f]{64}$/i.test(String(emisor.certificateSha256 ?? '')),
        !/^[0-9a-f]{64}$/i.test(String(emisor.signingConfigSha256 ?? '')),
      ];
      if (invalidIssuerFields.some(Boolean)) {
        throw new BadRequestException(
          'DIAN: el emisor real no tiene domicilio, perfil tributario o identidad de firma completos',
        );
      }
    }
    const expectedIssuer = {
      taxId: String(emisor.ruc ?? '').trim(),
      name: String(emisor.razonSocial ?? '').trim(),
      currency: String(emisor.moneda ?? '').trim().toUpperCase(),
    };
    const actualIssuer = {
      taxId: String(dto.ruc_emisor ?? '').trim(),
      name: String(dto.razon_social_emisor ?? '').trim(),
      currency: String(dto.moneda ?? '').trim().toUpperCase(),
    };
    if (actualIssuer.taxId !== expectedIssuer.taxId
        || actualIssuer.name !== expectedIssuer.name
        || actualIssuer.currency !== expectedIssuer.currency) {
      throw new BadRequestException(
        'DIAN: el emisor del comprobante no coincide con la configuración fiscal vigente del tenant',
      );
    }
    const receiver = await this.loadColombiaReceiverMaster(
      tenantId,
      (dto as any).cliente_id,
    );
    const expected = {
      type: receiver.documentoTipo,
      number: receiver.documentoNumero,
      name: receiver.razonSocial,
      address: receiver.direccion,
    };
    const actual = {
      type: String(dto.tipo_documento_receptor ?? '').trim().toUpperCase(),
      number: String(dto.documento_receptor ?? '').trim(),
      name: String(dto.razon_social_receptor ?? '').trim(),
      address: String(dto.direccion_receptor ?? '').trim(),
    };
    let expectedIdentity: ReturnType<typeof normalizeDianIdentity>;
    let actualIdentity: ReturnType<typeof normalizeDianIdentity>;
    try {
      expectedIdentity = normalizeDianIdentity(expected.type, expected.number);
      actualIdentity = normalizeDianIdentity(actual.type, actual.number);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'DIAN: identidad del receptor inválida',
      );
    }
    if (actualIdentity.type !== expectedIdentity.type
        || actualIdentity.canonicalNumber !== expectedIdentity.canonicalNumber
        || actual.name !== expected.name
        || actual.address !== expected.address) {
      throw new BadRequestException(
        'DIAN: el receptor del comprobante no coincide con el cliente maestro del tenant',
      );
    }
    const profileSnapshot = (dto as any).dian_receptor_tax_profile;
    if (profileSnapshot !== undefined) {
      const canonicalProfile = (value: any) => ({
        profile: String(value?.profile ?? '').trim(),
        taxLevelCode: String(value?.taxLevelCode ?? '').trim(),
        taxLevelListName: String(value?.taxLevelListName ?? '').trim(),
        taxSchemeId: String(value?.taxSchemeId ?? '').trim(),
        taxSchemeName: String(value?.taxSchemeName ?? '').trim(),
      });
      const expectedProfile = canonicalProfile(receiver.dianTaxProfile);
      const actualProfile = canonicalProfile(profileSnapshot);
      if (JSON.stringify(actualProfile) !== JSON.stringify(expectedProfile)) {
        throw new BadRequestException(
          'DIAN: el perfil tributario congelado del receptor no coincide con el cliente maestro del tenant',
        );
      }
    }
    return { emisor, receiver };
  }

  private async generateSignedDianInvoice(
    dto: CreateFacturaDto,
    tenantId: string,
    context: Awaited<ReturnType<CpeService['loadDianCreationContext']>>,
    prevalidatedContext?: DianGenerationContext,
  ): Promise<{ xml: string; hash: string }> {
    const { emisor, receiver } = context;
    if (emisor.isDemo) {
      throw new BadRequestException(
        'DIAN: una demo no genera firma fiscal real; use únicamente la representación marcada sin validez',
      );
    }
    type DianInvoiceLine = DocumentoElectronico['items'][number] & {
      dianTaxes?: DianTaxInput[];
    };
    const items: DianInvoiceLine[] = dto.items.map((item: any, index) => {
      const value = Number(item.valor_venta ?? item.valorVenta ?? 0);
      const tax = Number(item.impuesto_igv ?? item.igv ?? 0);
      const excise = Number(item.impuesto_isc ?? 0);
      const category = this.dianTaxCategoryForItem(item, index);
      const vatRate = Number(item.tasa_igv ?? (value > 0 ? tax * 100 / value : 0));
      const exciseRate = Number(item.tasa_isc ?? (value > 0 ? excise * 100 / value : 0));
      const lineTaxes: DianTaxInput[] = [];
      if (category !== 'EXCLUIDO') {
        lineTaxes.push({
          id: '01',
          name: 'IVA',
          taxableAmount: value,
          amount: tax,
          percent: vatRate,
          categoryCode: category === 'EXENTO' ? '02' : '01',
        });
      }
      if (excise > 0) {
        lineTaxes.push({
          id: '04',
          name: 'INC',
          taxableAmount: value,
          amount: excise,
          percent: exciseRate,
          categoryCode: '01',
        });
      }
      const quantity = Number(item.cantidad);
      const unitPrice = Number(item.precio_unitario ?? item.precioUnitario ?? 0);
      return {
        descripcion: String(item.descripcion ?? '').trim(),
        cantidad: quantity,
        unidadMedida: String(item.unidad_medida ?? item.unidad ?? 'NIU').trim().toUpperCase(),
        precioUnitario: unitPrice,
        valorVenta: value,
        igv: tax,
        tasaIgv: vatRate / 100,
        codigoProducto: String(item.codigo_producto ?? item.codigo ?? `ITEM-${index + 1}`).trim(),
        dianTaxCategory: category,
        dianTaxes: lineTaxes.length > 0 ? lineTaxes : undefined,
      };
    });
    const headerTaxes = items.flatMap((item) => item.dianTaxes ?? []);
    const issueDate = String((dto as any).fecha_emision ?? '').trim();
    const issueTime = String((dto as any).hora_emision ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)
        || !/^\d{2}:\d{2}:\d{2}$/.test(issueTime)) {
      throw new BadRequestException('DIAN: la fecha y hora fiscal reservadas son invalidas');
    }
    const documento: DocumentoElectronico & { dianTaxes?: DianTaxInput[] } = {
      id: randomUUID(),
      tipoDocumento: '01',
      serie: String(dto.serie).trim().toUpperCase(),
      numero: String(dto.numero),
      // La hora viene de la reserva transaccional y se reutiliza en cada retry;
      // nunca se deriva del date-only ni del reloj de una segunda solicitud.
      fechaEmision: `${issueDate}T${issueTime}-05:00`,
      fechaVencimiento: (dto as any).fecha_vencimiento,
      emisor: {
        tipoDocumento: '31',
        numeroDocumento: emisor.ruc,
        razonSocial: emisor.razonSocial,
        direccion: emisor.direccion,
        ciudad: emisor.ciudad,
        departamento: emisor.departamento,
        codigoUbigeo: emisor.codigoUbigeo,
        codigoDepartamento: /^\d{5}$/.test(String(emisor.codigoUbigeo ?? ''))
          ? String(emisor.codigoUbigeo).slice(0, 2)
          : '',
        regimenFiscal: emisor.regimenFiscal,
        tipoContribuyente: emisor.tipoContribuyente,
      },
      receptor: {
        tipoDocumento: receiver.documentoTipo,
        numeroDocumento: receiver.documentoNumero,
        razonSocial: receiver.razonSocial,
        direccion: receiver.direccion,
        dianTaxProfile: receiver.dianTaxProfile as DianReceiverTaxProfile,
      },
      moneda: String(dto.moneda ?? 'COP').trim().toUpperCase(),
      subtotal: Number(dto.total_gravadas ?? 0)
        + Number((dto as any).total_exoneradas ?? 0)
        + Number((dto as any).total_inafectas ?? 0)
        + Number((dto as any).total_exportacion ?? 0),
      totalGravadas: Number(dto.total_gravadas ?? 0),
      totalExoneradas: Number((dto as any).total_exoneradas ?? 0),
      totalInafectas: Number((dto as any).total_inafectas ?? 0),
      totalImpuestos: Number(dto.total_igv ?? 0) + Number((dto as any).total_isc ?? 0),
      importeTotal: Number(dto.total_venta ?? 0),
      formaPago: String((dto as any).condicion_pago ?? '').trim(),
      plazoPagoDias: Number((dto as any).plazo_pago_dias ?? 0),
      medioPago: String((dto as any).medio_pago ?? '').trim(),
      fiscalContext: {
        isDemo: false,
        dianIssuerIdentity: {
          contractVersion: 529,
          taxId: emisor.ruc,
          certificateSha256: emisor.certificateSha256,
          signingConfigSha256: emisor.signingConfigSha256,
        },
      },
      ...(prevalidatedContext ? { dianContext: prevalidatedContext } : {}),
      dianTaxes: headerTaxes.length > 0 ? headerTaxes : undefined,
      items,
    };
    let xml: string;
    try {
      xml = await this.fiscalAdapter.generarYFirmarDocumentoSinTransmitir(
        documento,
        tenantId,
        'CO',
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error desconocido';
      throw new BadRequestException(`DIAN: no se pudo generar y firmar el UBL nativo: ${detail}`);
    }
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const signatures = parsed.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#',
      'Signature',
    );
    const uuids = Array.from(parsed.getElementsByTagNameNS(
      'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'UUID',
    ));
    const cufe = uuids.find((node) => node.getAttribute('schemeName') === 'CUFE-SHA384')
      ?.textContent?.trim() ?? '';
    if (parsed.documentElement?.localName !== 'Invoice'
        || parsed.documentElement?.namespaceURI
          !== 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
        || signatures.length !== 1
        || !/^[0-9a-f]{96}$/i.test(cufe)
        || !xml.includes('<cbc:ProfileID>')
        || !xml.includes('<cbc:CustomizationID>')
        || xml.includes('PE:SUNAT')) {
      throw new BadRequestException(
        'DIAN: la firma local no produjo una Invoice UBL 2.1/FEV 1.9 con CUFE y XMLDSig únicos',
      );
    }
    return {
      xml,
      hash: createHash('sha256').update(xml, 'utf8').digest('hex'),
    };
  }

  async create(
    createFacturaDto: CreateFacturaDto,
    tenantId: string,
    userId?: string,
    options?: {
      finalizarDocumentoPosReservado?: boolean;
      // Sólo lo establece la integración interna de pedidos después de crear
      // el lifecycle DIAN 531. Nunca se deriva del DTO público.
      pedidoFiscalOwnerId?: string;
    },
  ): Promise<FacturaDto> {
    try {
      const requestedType = String(createFacturaDto.tipo_documento ?? '').trim();
      const finalizaDocumentoPosReservado =
        options?.finalizarDocumentoPosReservado === true;
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
      const earlyIdempotencyKey = String(
        (createFacturaDto as any).idempotency_key ?? '',
      ).trim();
      const internalOrderKey = earlyIdempotencyKey.startsWith('ventas.cpe.factura:');
      const internalPosKey = earlyIdempotencyKey.startsWith('pos.cpe:');
      const internalDocumentKey = earlyIdempotencyKey.startsWith('doc.cpe:');
      const eligibleDirectRetry = Boolean(earlyIdempotencyKey
        && !finalizaDocumentoPosReservado
        && !options?.pedidoFiscalOwnerId
        && !internalOrderKey
        && !internalPosKey
        && !internalDocumentKey);
      const supabaseClient = this.supabaseService.getClient();
      const paisCodigo = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
      if (paisCodigo === 'CO' && requestedType !== '01') {
        throw new BadRequestException(
          'DIAN: la frontera POS/CPE sólo admite factura electrónica tipo 01',
        );
      }
      if (paisCodigo === 'CO' && eligibleDirectRetry) {
        // Sólo consulta la evidencia inmutable del CPE. Si ya está completo,
        // retorna antes de releer maestros, certificado o DIAN. Las claves de
        // pedido, POS y documento conservan sus lifecycles atómicos propios.
        const completedRetry = await this.findCompletedDirectDianCpe(
          tenantId,
          userId,
          earlyIdempotencyKey,
          requestedType,
          createFacturaDto,
        );
        if (completedRetry) return this.mapToDto(completedRetry);
      }
      let directRequestFingerprint: string | null = null;
      if (paisCodigo === 'CO'
          && eligibleDirectRetry) {
        directRequestFingerprint = this.buildDirectDianRequestFingerprint(
          createFacturaDto,
          tenantId,
        );
      }
      // El contexto DIAN se carga antes de decidir la numeración. Así cualquier
      // entrada al servicio (UI, pedido, documento o POS) comparte exactamente
      // la misma política y no sólo la ruta amigable de /cpe/comprobante.
      const dianCreationContext = paisCodigo === 'CO'
        ? await this.loadDianCreationContext(createFacturaDto, tenantId)
        : null;
      const isRealDianCreation = paisCodigo === 'CO'
        && dianCreationContext !== null
        && !dianCreationContext.emisor.isDemo;
      const isColombiaDemoCreation = paisCodigo === 'CO'
        && dianCreationContext?.emisor.isDemo === true;
      if (isColombiaDemoCreation) {
        // La resolución demo puede no declarar prefijo, igual que una
        // autorización DIAN válida. El escritor atómico heredado exige una
        // serie operativa no vacía, así que usamos una identidad inequívocamente
        // local: nunca se presenta como prefijo autorizado ni se transmite.
        (createFacturaDto as any).serie = this.resolveColombiaDemoSeries(
          dianCreationContext.emisor.dianResolucionPrefijo ?? '',
        );
      }
      if (dianCreationContext) {
        const canonicalReceiver = normalizeDianIdentity(
          dianCreationContext.receiver.documentoTipo,
          dianCreationContext.receiver.documentoNumero,
        );
        (createFacturaDto as any).tipo_documento_receptor = canonicalReceiver.type;
        (createFacturaDto as any).documento_receptor = canonicalReceiver.canonicalNumber;
      }
      const eventId = randomUUID();
      const emissionDate = this.resolveEmissionDate((createFacturaDto as any).fecha_emision);
      let issueTime = isRealDianCreation
        ? ''
        : this.resolveIssueTime((createFacturaDto as any).fecha_emision);
      let dueDate = this.resolveDueDate(emissionDate, (createFacturaDto as any).fecha_vencimiento);
      if (paisCodigo === 'CO') {
        const paymentForm = this.normalizeDianPaymentForm((createFacturaDto as any).condicion_pago);
        const paymentTermDays = Number((createFacturaDto as any).plazo_pago_dias ?? 0);
        const paymentMeans = this.normalizeDianPaymentMeans(
          (createFacturaDto as any).medio_pago,
          paymentForm,
        );
        (createFacturaDto as any).condicion_pago = paymentForm;
        (createFacturaDto as any).medio_pago = paymentMeans;
        (createFacturaDto as any).plazo_pago_dias = paymentTermDays;
        if (paymentForm === 'CREDITO') {
          dueDate = this.resolveDianCreditDueDate(
            emissionDate,
            paymentTermDays,
            (createFacturaDto as any).fecha_vencimiento,
          );
          (createFacturaDto as any).fecha_vencimiento = dueDate;
        }
        // No se reservan correlativos para payloads cuya ecuacion tributaria
        // no pueda reproducirse exactamente en el UBL DIAN.
        this.normalizeAndValidateDianLines(
          createFacturaDto,
          dianCreationContext?.emisor.igvPorcentaje,
        );
      }
      const totalesCalculados = this.recalculateTotals(createFacturaDto);
      const { subtotal, totalIgv, totalIsc, total, gravadas, exoneradas, inafectas, exportacion } =
        totalesCalculados;
      this.assertProvidedTotalsMatch(createFacturaDto, totalesCalculados);
      this.assertReceptorValido(createFacturaDto, paisCodigo);
      const providedIdempotencyKey = String(
        (createFacturaDto as any).idempotency_key ?? '',
      ).trim();
      const payloadPedidoId = String((createFacturaDto as any).pedido_id ?? '').trim();
      const pedidoFiscalOwnerId = String(options?.pedidoFiscalOwnerId ?? '').trim();
      if (paisCodigo === 'CO') {
        const reservedOrderPrefix = 'ventas.cpe.factura:';
        if (!pedidoFiscalOwnerId
            && (payloadPedidoId || providedIdempotencyKey.startsWith(reservedOrderPrefix))) {
          throw new BadRequestException(
            'DIAN: una factura de pedido sólo puede emitirse desde el flujo interno de pedidos',
          );
        }
        if (pedidoFiscalOwnerId) {
          const expectedOrderKey = `${reservedOrderPrefix}${tenantId}:${pedidoFiscalOwnerId}`;
          if (payloadPedidoId !== pedidoFiscalOwnerId
              || providedIdempotencyKey !== expectedOrderKey) {
            throw new BadRequestException(
              'DIAN: el pedido o la llave no coincide con la intención fiscal interna',
            );
          }
        }
      }
      if (isRealDianCreation) {
        if (!providedIdempotencyKey) {
          throw new BadRequestException(
            'DIAN: la emisión real exige una intención idempotente explícita',
          );
        }
      }
      const seriePrevalidacion = paisCodigo === 'CO' && dianCreationContext
        ? dianCreationContext.emisor.dianResolucionPrefijo
        : createFacturaDto.serie;
      this.assertSerieCoherenteConTipo(
        { ...createFacturaDto, serie: seriePrevalidacion } as CreateFacturaDto,
        paisCodigo,
      );
      this.assertFechaEmisionNoFutura(emissionDate, paisCodigo);
      const idempotencyKey = this.resolveIdempotencyKey(createFacturaDto, tenantId);
      if (finalizaDocumentoPosReservado) {
        const reservedPosIssueTime = await this.validarDocumentoPosReservado(
          createFacturaDto,
          tenantId,
          isRealDianCreation,
        );
        if (isRealDianCreation) {
          if (!reservedPosIssueTime) {
            throw new BadRequestException(
              'DIAN: el documento POS reservado no conserva su hora fiscal',
            );
          }
          issueTime = reservedPosIssueTime;
        }
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

      // 1. Validate certificate. Una demo CO nunca firma ni transmite: sólo
      // persiste un artefacto interno explícitamente no fiscal para alimentar
      // la representación A4. Todas las cuentas reales siguen fallando cerrado.
      if (!isColombiaDemoCreation) {
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

      let prevalidatedDianContext: DianGenerationContext | undefined;
      if (isRealDianCreation && !finalizaDocumentoPosReservado) {
        try {
          prevalidatedDianContext = await this.fiscalAdapter
            .prepararContextoDianFacturaAntesDeReserva({
              documentType: '01',
              series: String(dianCreationContext.emisor.dianResolucionPrefijo ?? '')
                .trim().toUpperCase(),
              issueDate: emissionDate,
              issuerIdentity: {
                contractVersion: 529,
                taxId: dianCreationContext.emisor.ruc,
                certificateSha256: dianCreationContext.emisor.certificateSha256,
                signingConfigSha256: dianCreationContext.emisor.signingConfigSha256,
              },
              taxes: { iva: totalIgv, inc: totalIsc, ica: 0 },
            }, tenantId, 'CO');
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'respuesta oficial inválida';
          throw new BadRequestException(
            `DIAN: no se pudo validar la autorización oficial antes de reservar: ${detail}`,
          );
        }
      }

      // La numeración autorizada se reserva sólo después de cerrar todos los
      // guards puros, de certificado, emisor, receptor, pago, topes y formato.
      // Una solicitud inválida nunca debe consumir un correlativo DIAN.
      if (isRealDianCreation && !finalizaDocumentoPosReservado) {
        const intentFingerprint = this.buildDianReservationIntentFingerprint(
          createFacturaDto,
          tenantId,
          dianCreationContext,
          totalesCalculados,
          emissionDate,
          dueDate,
          pedidoFiscalOwnerId || undefined,
        );
        const reservation = await this.reserveDianUiNumber(
          tenantId,
          userId,
          requestedType,
          emissionDate,
          providedIdempotencyKey,
          intentFingerprint,
          dianCreationContext.emisor,
          pedidoFiscalOwnerId || undefined,
        );
        // Serie y correlativo son datos de servidor. Incluso una llamada directa
        // a POST /cpe o un pedido que arrastre números antiguos queda normalizada
        // a la resolución vigente antes de firmar o persistir.
        (createFacturaDto as any).serie = reservation.prefijo;
        (createFacturaDto as any).numero = reservation.correlativo;
        issueTime = reservation.issueTime;
        (createFacturaDto as any).hora_emision = issueTime;
        const authorization = prevalidatedDianContext?.authorization;
        if (!authorization
            || authorization.prefix !== reservation.prefijo
            || reservation.correlativo < authorization.rangeFrom
            || reservation.correlativo > authorization.rangeTo) {
          throw new BadRequestException(
            'DIAN: la reserva local no coincide con la autorización oficial prevalidada',
          );
        }
      }

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

      let signedXml: string;
      let hash: string;
      if (isRealDianCreation) {
        // Una factura colombiana real nace como UBL DIAN nativo. No se guarda
        // un Invoice SUNAT transitorio bajo estado FIRMADO esperando que SEND
        // lo reemplace después.
        const signedDian = await this.generateSignedDianInvoice(
          createFacturaDto,
          tenantId,
          dianCreationContext,
          prevalidatedDianContext,
        );
        signedXml = signedDian.xml;
        hash = signedDian.hash;
      } else if (isColombiaDemoCreation) {
        // No se crea un UBL DIAN ni una firma sintética. Este XML de dominio
        // interno sólo permite cerrar el workflow demo y generar su A4 con
        // marca de agua; getSignedXml y el transporte rechazan este formato.
        const demoArtifact = this.generateColombiaDemoArtifact(createFacturaDto);
        signedXml = demoArtifact.xml;
        hash = demoArtifact.hash;
      } else {
        // PE/AR conservan su pipeline existente.
        const xmlSigner = await this.getXmlSigner(tenantId);
        const xmlContent = this.generateXmlContent({
          ...createFacturaDto,
          codigo_establecimiento: codigoEstablecimiento,
        } as CreateFacturaDto);
        signedXml = xmlSigner.signXml(xmlContent);
        hash = xmlSigner.generateHash(signedXml);
        if (!xmlSigner.validateSignatureStrict(signedXml)) {
          throw new BadRequestException('La firma XML generada no pudo validarse; no se persistió el CPE');
        }
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
        condicion_pago: (createFacturaDto as any).condicion_pago ?? 'CONTADO',
        medio_pago: (createFacturaDto as any).medio_pago ?? null,
        plazo_pago_dias: (createFacturaDto as any).plazo_pago_dias ?? 0,
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
        } : paisCodigo === 'CO' ? {
          ...(
            (createFacturaDto as any).metadata
            && typeof (createFacturaDto as any).metadata === 'object'
            && !Array.isArray((createFacturaDto as any).metadata)
              ? (createFacturaDto as any).metadata
              : {}
          ),
          pais: 'CO',
          dian_forma_pago: (createFacturaDto as any).condicion_pago ?? 'CONTADO',
          dian_medio_pago: (createFacturaDto as any).medio_pago,
          plazo_pago_dias: (createFacturaDto as any).plazo_pago_dias ?? 0,
          dian_is_demo: dianCreationContext?.emisor.isDemo === true,
          ...(isColombiaDemoCreation ? {
            dian_simulado: true,
            dian_fixture_source: 'ERP_DEMO_LOCAL_REPRESENTATION_V1',
            demo_artifact_format: 'ERP_DEMO_CPE_V1',
            demo_artifact_signed: false,
            demo_artifact_integrity: 'SHA-256',
            fiscal_delivery_eligible: false,
          } : {}),
          dian_receptor_tax_profile: dianCreationContext?.receiver.dianTaxProfile,
          dian_direccion_emisor: dianCreationContext?.emisor.direccion,
          dian_municipio_emisor: dianCreationContext?.emisor.ciudad,
          dian_departamento_emisor: dianCreationContext?.emisor.departamento,
          dian_codigo_dane_emisor: dianCreationContext?.emisor.codigoUbigeo,
          dian_codigo_departamento_emisor: /^\d{5}$/.test(
            String(dianCreationContext?.emisor.codigoUbigeo ?? ''),
          )
            ? String(dianCreationContext?.emisor.codigoUbigeo).slice(0, 2)
            : '',
          dian_regimen_fiscal: dianCreationContext?.emisor.regimenFiscal,
          dian_tipo_contribuyente: dianCreationContext?.emisor.tipoContribuyente,
          hora_emision: issueTime,
          ...(directRequestFingerprint
            ? { dian_direct_request_fingerprint: directRequestFingerprint }
            : {}),
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
        const monedaFuncional = paisCodigo === 'CO' ? 'COP' : paisCodigo === 'AR' ? 'ARS' : 'PEN';
        const tipoCambio = String(createFacturaDto.moneda ?? monedaFuncional).toUpperCase() === monedaFuncional
          ? 1
          : Number((createFacturaDto as any).tipo_cambio ?? 0);

        const pedidoId = pedidoFiscalOwnerId
          || (paisCodigo === 'CO' ? null : (createFacturaDto as any).pedido_id ?? null);
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
            ...(cpeData.metadata ?? {}),
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

  async createFromComprobantePayload(
    payload: any,
    tenantId: string,
    userId?: string,
    idempotencyKeyHeader?: string,
  ): Promise<FacturaDto> {
    const tipoDocumento = this.normalizeTipoDocumentoSunat(
      payload?.tipo_documento ?? payload?.tipoComprobante ?? payload?.tipo_comprobante,
    );
    const emisor = await this.getEmpresaEmisorInfoStrict(tenantId);
    const bodyIdempotencyKeys = [payload?.idempotency_key, payload?.idempotencyKey]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => String(value).trim());
    const distinctBodyKeys = [...new Set(bodyIdempotencyKeys)];
    if (distinctBodyKeys.length > 1) {
      throw new BadRequestException(
        'La intención idempotente del comprobante es contradictoria en el body',
      );
    }
    const bodyIdempotencyKey = distinctBodyKeys[0] ?? '';
    const headerIdempotencyKey = String(idempotencyKeyHeader ?? '').trim();
    if (headerIdempotencyKey && bodyIdempotencyKey && headerIdempotencyKey !== bodyIdempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key no coincide con la intención idempotente del comprobante',
      );
    }
    const providedIdempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;
    if (providedIdempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key no puede superar 200 caracteres');
    }
    const existingIntent = providedIdempotencyKey
      ? await this.findExistingCpeIntent(tenantId, providedIdempotencyKey)
      : null;
    const configuredSeries = emisor.pais === 'CO'
      ? String((emisor as any).dianResolucionPrefijo ?? '').trim().toUpperCase()
      : '';
    const localSeries = emisor.pais === 'CO' && emisor.isDemo
      ? this.resolveColombiaDemoSeries(configuredSeries)
      : configuredSeries;
    let serie = String(
      existingIntent?.serie
      ?? (emisor.pais === 'CO' ? localSeries : payload?.serie)
      ?? this.defaultSerieForTipo(tipoDocumento),
    ).trim().toUpperCase();
    let numero = existingIntent?.numero ?? 0;
    const clienteMaestro = emisor.pais === 'CO'
      ? await this.loadColombiaReceiverMaster(tenantId, payload?.cliente_id)
      : null;
    const documentoReceptor = String(
      clienteMaestro?.documentoNumero
      ?? payload?.documento_receptor
      ?? payload?.clienteRuc
      ?? payload?.clienteDocumento
      ?? '',
    ).trim();
    const tipoDocumentoReceptor = this.resolveTipoDocumentoReceptor(
      tipoDocumento,
      clienteMaestro?.documentoTipo
        ?? payload?.tipo_documento_receptor
        ?? payload?.clienteTipoDocumento,
      documentoReceptor,
      emisor.pais,
    );
    const razonSocialReceptor = String(
      clienteMaestro?.razonSocial
      ?? payload?.razon_social_receptor
      ?? payload?.clienteRazonSocial
      ?? payload?.clienteNombre
      ?? '',
    ).trim();
    if (!razonSocialReceptor) {
      throw new BadRequestException('El receptor del CPE requiere razón social o nombre');
    }

    const items = this.normalizeComprobanteItems(payload?.items);
    const basesPorAfectacion = items.reduce(
      (totals, item) => {
        const value = Number(item.valor_venta ?? 0);
        switch (categoriaDeAfectacion(item.afectacion_igv)) {
          case 'EXONERADO': totals.exoneradas += value; break;
          case 'INAFECTO': totals.inafectas += value; break;
          case 'EXPORTACION': totals.exportacion += value; break;
          default: totals.gravadas += value;
        }
        return totals;
      },
      { gravadas: 0, exoneradas: 0, inafectas: 0, exportacion: 0 },
    );
    const totalGravadas = this.roundMoney(
      payload?.total_gravadas ?? basesPorAfectacion.gravadas,
    );
    const totalExoneradas = this.roundMoney(
      payload?.total_exoneradas ?? payload?.totalExoneradas ?? basesPorAfectacion.exoneradas,
    );
    const totalInafectas = this.roundMoney(
      payload?.total_inafectas ?? payload?.totalInafectas ?? basesPorAfectacion.inafectas,
    );
    const totalExportacion = this.roundMoney(
      payload?.total_exportacion ?? payload?.totalExportacion ?? basesPorAfectacion.exportacion,
    );
    const totalIgv = this.roundMoney(
      payload?.total_igv ?? payload?.totalIgv ?? items.reduce((sum, item) => sum + item.igv, 0),
    );
    const totalVenta = this.roundMoney(
      payload?.total_venta
      ?? payload?.total
      ?? totalGravadas + totalExoneradas + totalInafectas + totalExportacion + totalIgv,
    );
    let condicionPago = String(
      payload?.condicion_pago ?? payload?.condicionPago ?? 'CONTADO',
    ).trim().toUpperCase();
    let medioPago = String(payload?.medio_pago ?? payload?.medioPago ?? '').trim();
    const plazoPagoDias = Number(payload?.plazo_pago_dias ?? payload?.plazoPagoDias ?? 0);
    const fechaEmision = String(
      payload?.fecha_emision ?? payload?.fechaEmision ?? '',
    ).trim();
    let fechaVencimiento = String(
      payload?.fecha_vencimiento ?? payload?.fechaVencimiento ?? '',
    ).trim();
    if (emisor.pais === 'CO') {
      const dianCondicionPago = this.normalizeDianPaymentForm(condicionPago);
      condicionPago = dianCondicionPago;
      medioPago = this.normalizeDianPaymentMeans(medioPago, dianCondicionPago);
      if (dianCondicionPago === 'CREDITO') {
        fechaVencimiento = this.resolveDianCreditDueDate(
          fechaEmision,
          plazoPagoDias,
          fechaVencimiento,
        );
      }
    }

    if (!existingIntent) {
      if (emisor.pais === 'CO' && !emisor.isDemo) {
        if (!userId || !providedIdempotencyKey) {
          throw new BadRequestException(
            'DIAN: la emisión exige actor e intención idempotente autenticados',
          );
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision)) {
          throw new BadRequestException('DIAN: la emisión exige fecha de emisión YYYY-MM-DD');
        }
        // La frontera UI sólo normaliza el payload. El consecutivo se reserva en
        // create(), después de certificado, emisor, receptor, pago y validación
        // documental. Reservarlo aquí consumía un número ante cualquier fallo
        // posterior de la misma solicitud visual.
        numero = 0;
      } else {
        numero = await this.resolveNumeroCpe(
          tenantId,
          tipoDocumento,
          serie,
          payload?.numero ?? payload?.correlativo,
        );
      }
    }

    const dto: CreateFacturaDto = {
      tipo_documento: tipoDocumento as any,
      serie,
      numero,
      ruc_emisor: emisor.ruc,
      razon_social_emisor: emisor.razonSocial,
      cliente_id: clienteMaestro?.id,
      tipo_documento_receptor: tipoDocumentoReceptor,
      documento_receptor: documentoReceptor,
      razon_social_receptor: razonSocialReceptor,
      direccion_receptor:
        clienteMaestro?.direccion
        ?? payload?.direccion_receptor
        ?? payload?.clienteDireccion
        ?? '',
      moneda: payload?.moneda || emisor.moneda,
      items,
      total_gravadas: totalGravadas,
      total_exoneradas: totalExoneradas,
      total_inafectas: totalInafectas,
      total_exportacion: totalExportacion,
      total_igv: totalIgv,
      total_venta: totalVenta,
      fecha_emision: fechaEmision || undefined,
      fecha_vencimiento: fechaVencimiento || undefined,
      condicion_pago: condicionPago,
      medio_pago: medioPago,
      plazo_pago_dias: plazoPagoDias,
      idempotency_key:
        providedIdempotencyKey ||
        `cpe.ui:${tenantId}:${tipoDocumento}:${serie}:${numero}`,
    } as CreateFacturaDto;

    if (clienteMaestro) {
      // Valor interno obtenido del maestro tenant-scoped. create() vuelve a leer
      // el maestro y exige igualdad antes de reservar, cerrando una modificación
      // concurrente del perfil tributario entre ambas capas.
      (dto as any).dian_receptor_tax_profile = clienteMaestro.dianTaxProfile;
    }

    return this.create(dto, tenantId, userId);
  }

  private async reserveDianUiNumber(
    tenantId: string,
    actorId: string,
    documentType: string,
    emissionDate: string,
    idempotencyKey: string,
    intentFingerprint: string,
    expectedIssuer: Awaited<ReturnType<CpeService['loadDianCreationContext']>>['emisor'],
    pedidoId?: string,
  ): Promise<{ prefijo: string; correlativo: number; issueTime: string }> {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'reservar_numeracion_dian_ui_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_tipo_documento: documentType,
        p_fecha_emision: emissionDate,
        p_idempotency_key: idempotencyKey,
        p_intent_fingerprint: intentFingerprint,
        p_pedido_id: pedidoId ?? null,
      },
    );
    if (error) {
      throw new BadRequestException(`DIAN: no se pudo reservar la numeración autorizada: ${error.message}`);
    }
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    const prefijo = String(result?.prefijo ?? '').trim().toUpperCase();
    const correlativo = Number(result?.correlativo);
    const reservedDate = String(result?.fecha_emision ?? '').slice(0, 10);
    const issueTime = String(result?.hora_emision ?? '').trim();
    const resolutionNumber = String(result?.resolucion_numero ?? '').trim();
    const rangeFrom = Number(result?.rango_desde);
    const rangeTo = Number(result?.rango_hasta);
    const validFrom = String(result?.vigencia_desde ?? '').slice(0, 10);
    const validTo = String(result?.vigencia_hasta ?? '').slice(0, 10);
    if (!/^[A-Z0-9]{0,4}$/.test(prefijo)
        || !Number.isSafeInteger(correlativo) || correlativo < 1
        || reservedDate !== emissionDate
        || !/^\d{2}:\d{2}:\d{2}$/.test(issueTime)
        || prefijo !== String(expectedIssuer.dianResolucionPrefijo ?? '').trim().toUpperCase()
        || resolutionNumber !== String(expectedIssuer.dianResolucionNumero ?? '').trim()
        || rangeFrom !== Number(expectedIssuer.dianResolucionDesde)
        || rangeTo !== Number(expectedIssuer.dianResolucionHasta)
        || validFrom !== String(expectedIssuer.dianResolucionFechaInicio ?? '').slice(0, 10)
        || validTo !== String(expectedIssuer.dianResolucionFechaFin ?? '').slice(0, 10)) {
      throw new BadRequestException('DIAN: la reserva devolvió una numeración inválida');
    }
    return { prefijo, correlativo, issueTime };
  }

  private async findExistingCpeIntent(tenantId: string, idempotencyKey: string): Promise<{
    serie: string;
    numero: number;
  } | null> {
    const queryResult = await this.supabaseService
      .getClient()
      .from('cpe')
      .select('serie,numero')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (!queryResult) return null;
    const { data, error } = queryResult;
    if (error) {
      throw new BadRequestException(`No se pudo reconciliar la intención de emisión: ${error.message}`);
    }
    if (!data) return null;
    const numero = Number((data as any).numero);
    if (!Number.isSafeInteger(numero) || numero < 1) {
      throw new BadRequestException('La intención existente conserva un correlativo inválido');
    }
    return { serie: String((data as any).serie ?? '').trim().toUpperCase(), numero };
  }

  private async findCompletedDirectDianCpe(
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    documentType: string,
    dto: CreateFacturaDto,
  ): Promise<Record<string, any> | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('cpe')
      .select([
        'id', 'tenant_id', 'tipo_documento', 'serie', 'numero', 'ruc_emisor',
        'razon_social_emisor', 'tipo_documento_receptor', 'documento_receptor',
        'razon_social_receptor', 'direccion_receptor', 'moneda', 'items',
        'total_gravadas', 'total_igv', 'total_venta', 'estado', 'hash',
        'hash_firma', 'xml_firmado', 'cdr_sunat', 'error_message', 'created_by',
        'metadata', 'documento_id', 'created_at', 'updated_at',
      ].join(','))
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `No se pudo reconciliar la intención DIAN completada: ${error.message}`,
      );
    }
    if (!data) return null;
    const row = data as Record<string, any>;
    // No cambia el lifecycle de PE/AR: sólo una fila marcada por el servidor
    // como Colombia entra a la reconciliación temprana DIAN.
    if (String(row.metadata?.pais ?? '').trim().toUpperCase() !== 'CO') return null;
    const requestFingerprint = this.buildDirectDianRequestFingerprint(dto, tenantId);
    const persistedHash = String(row.hash_firma ?? row.hash ?? '').trim();
    const persistedFingerprint = String(
      row.metadata?.dian_direct_request_fingerprint ?? '',
    ).trim().toLowerCase();
    // Filas antiguas o intenciones incompletas siguen por la reconciliación
    // transaccional normal; sólo se usa el atajo cuando existe evidencia
    // suficiente para demostrar que el CPE quedó finalizado por este contrato.
    if (!row.id
        || !String(row.xml_firmado ?? '').trim()
        || !/^[0-9a-f]{64}$/i.test(persistedHash)
        || !/^[0-9a-f]{64}$/i.test(persistedFingerprint)
        || !Number.isSafeInteger(Number(row.numero))
        || Number(row.numero) < 1) {
      return null;
    }
    if (String(row.created_by ?? '').trim() !== actorId
        || String(row.tipo_documento ?? '').trim() !== documentType
        || persistedFingerprint !== requestFingerprint.toLowerCase()) {
      throw new BadRequestException(
        'DIAN: la intención idempotente ya pertenece a otro actor o a un payload distinto',
      );
    }
    return { ...row, hash: persistedHash };
  }

  private async loadColombiaReceiverMaster(tenantId: string, clienteIdInput: unknown): Promise<{
    id: string;
    documentoTipo: string;
    documentoNumero: string;
    razonSocial: string;
    direccion: string;
    dianTaxProfile: Record<string, string>;
  }> {
    const clienteId = String(clienteIdInput ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clienteId)) {
      throw new BadRequestException('DIAN: selecciona un cliente maestro válido');
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('clientes')
      .select([
        'id', 'documento_tipo', 'documento_numero', 'numero_documento', 'ruc',
        'razon_social', 'nombre', 'direccion', 'dian_perfil_fiscal',
        'dian_responsabilidad_fiscal', 'dian_responsabilidad_list_name',
        'dian_tributo_id', 'dian_tributo_nombre',
      ].join(','))
      .eq('tenant_id', tenantId)
      .eq('id', clienteId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(`DIAN: no se pudo leer el cliente maestro: ${error.message}`);
    }
    if (!data) throw new BadRequestException('DIAN: el cliente no existe dentro de esta empresa');

    const row = data as Record<string, any>;
    const documentoTipo = String(row.documento_tipo ?? '').trim().toUpperCase();
    const documentoNumero = String(
      row.documento_numero ?? row.numero_documento ?? row.ruc ?? '',
    ).trim();
    try {
      normalizeDianIdentity(documentoTipo, documentoNumero);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'DIAN: identidad del cliente inválida',
      );
    }
    const razonSocial = String(row.razon_social ?? row.nombre ?? '').trim();
    if (!razonSocial) throw new BadRequestException('DIAN: el cliente maestro no tiene razón social o nombre');

    const profile = {
      profile: String(row.dian_perfil_fiscal ?? '').trim(),
      taxLevelCode: String(row.dian_responsabilidad_fiscal ?? '').trim(),
      taxLevelListName: String(row.dian_responsabilidad_list_name ?? '').trim(),
      taxSchemeId: String(row.dian_tributo_id ?? '').trim(),
      taxSchemeName: String(row.dian_tributo_nombre ?? '').trim(),
    };
    const serialized = Object.values(profile).join('|');
    const validProfile = serialized === 'CONSUMIDOR_FINAL|R-99-PN|49|ZY|No causa'
      || serialized === 'ADQUIRIENTE_NIT_B2B|O-99|04|01|IVA';
    if (!validProfile || (profile.profile === 'ADQUIRIENTE_NIT_B2B' && documentoTipo !== 'NIT')) {
      throw new BadRequestException('DIAN: el cliente maestro no tiene un perfil tributario coherente');
    }
    return {
      id: clienteId,
      documentoTipo,
      documentoNumero,
      razonSocial,
      direccion: String(row.direccion ?? '').trim(),
      dianTaxProfile: profile,
    };
  }

  async getColombiaReceiver(tenantId: string, clienteId: string) {
    const receiver = await this.loadColombiaReceiverMaster(tenantId, clienteId);
    return {
      id: receiver.id,
      documento_tipo: receiver.documentoTipo,
      documento_numero: receiver.documentoNumero,
      razon_social: receiver.razonSocial,
      direccion: receiver.direccion,
      dian_perfil_fiscal: receiver.dianTaxProfile.profile,
      dian_responsabilidad_fiscal: receiver.dianTaxProfile.taxLevelCode,
      dian_responsabilidad_list_name: receiver.dianTaxProfile.taxLevelListName,
      dian_tributo_id: receiver.dianTaxProfile.taxSchemeId,
      dian_tributo_nombre: receiver.dianTaxProfile.taxSchemeName,
    };
  }

  async listColombiaReceivers(tenantId: string, searchInput?: string, limitInput?: string) {
    const country = (await this.fiscalAdapter.obtenerCodigoPais(tenantId)).toUpperCase();
    if (country !== 'CO') {
      throw new BadRequestException('El catálogo fiscal de receptores DIAN sólo está disponible en Colombia');
    }
    const limit = Math.min(Math.max(Number.parseInt(String(limitInput ?? '50'), 10) || 50, 1), 100);
    let query = this.supabaseService
      .getClient()
      .from('clientes')
      .select([
        'id', 'documento_tipo', 'documento_numero', 'numero_documento', 'ruc',
        'razon_social', 'nombre', 'nombre_comercial', 'direccion', 'dian_perfil_fiscal',
        'dian_responsabilidad_fiscal', 'dian_responsabilidad_list_name',
        'dian_tributo_id', 'dian_tributo_nombre',
      ].join(','))
      .eq('tenant_id', tenantId)
      .not('dian_perfil_fiscal', 'is', null)
      .order('razon_social', { ascending: true })
      .limit(limit);
    const rawSearch = String(searchInput ?? '')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s.-]/gu, '')
      .trim()
      .slice(0, 80);
    if (rawSearch) {
      const pattern = `%${rawSearch}%`;
      query = query.or([
        `razon_social.ilike.${pattern}`,
        `nombre.ilike.${pattern}`,
        `nombre_comercial.ilike.${pattern}`,
        `ruc.ilike.${pattern}`,
      ].join(','));
    }
    const { data, error } = await query;
    if (error) throw new BadRequestException(`No se pudieron listar los receptores DIAN: ${error.message}`);
    return {
      data: (data ?? []).map((row: any) => ({
        id: row.id,
        documento_tipo: row.documento_tipo,
        documento_numero: String(row.documento_numero ?? row.numero_documento ?? row.ruc ?? ''),
        razon_social: String(row.razon_social ?? row.nombre ?? '').trim(),
        nombre_comercial: row.nombre_comercial,
        direccion: row.direccion,
        dian_perfil_fiscal: row.dian_perfil_fiscal,
        dian_responsabilidad_fiscal: row.dian_responsabilidad_fiscal,
        dian_responsabilidad_list_name: row.dian_responsabilidad_list_name,
        dian_tributo_id: row.dian_tributo_id,
        dian_tributo_nombre: row.dian_tributo_nombre,
      })),
      pagination: { page: 1, limit, total: (data ?? []).length, totalPages: 1 },
    };
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
    const items = documento.detalles.map((detalle, index) => {
      const afectacionIgv = String(
        detalle.afectacion_igv
        ?? detalle.tipo_afectacion_igv
        ?? detalle.metadata?.afectacion_igv
        ?? '10',
      ).trim();
      return {
        codigo: detalle.codigo_producto ?? `ITEM-${index + 1}`,
        descripcion: detalle.descripcion,
        cantidad: detalle.cantidad,
        precio_unitario: detalle.precio_unitario,
        valor_venta: detalle.valor_venta,
        igv: detalle.impuesto_igv,
        total: detalle.total_item,
        unidad: detalle.unidad_medida ?? 'NIU',
        tipo_afectacion_igv: afectacionIgv,
        afectacion_igv: afectacionIgv,
        producto_id: detalle.producto_id ?? undefined,
      };
    });
    const bases = items.reduce(
      (totals, item) => {
        const value = Number(item.valor_venta ?? 0);
        switch (categoriaDeAfectacion(item.afectacion_igv)) {
          case 'EXONERADO': totals.exoneradas += value; break;
          case 'INAFECTO': totals.inafectas += value; break;
          case 'EXPORTACION': totals.exportacion += value; break;
          default: totals.gravadas += value;
        }
        return totals;
      },
      { gravadas: 0, exoneradas: 0, inafectas: 0, exportacion: 0 },
    );
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
      total_gravadas: this.roundMoney(bases.gravadas),
      total_exoneradas: this.roundMoney(bases.exoneradas),
      total_inafectas: this.roundMoney(bases.inafectas),
      total_exportacion: this.roundMoney(bases.exportacion),
      total_igv: documento.impuesto_igv,
      total_venta: documento.total,
      items,
      idempotency_key: `doc.cpe:${documento.id}`,
      condicion_pago: 'CONTADO',
      medio_pago: '10',
      plazo_pago_dias: 0,
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

async firmarNotaDianReferenciada(
    cpeData: Record<string, any>,
    tenantId: string,
  ): Promise<string> {
    return this.deliveryService.firmarNotaDianReferenciada(cpeData, tenantId);
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

  private generateColombiaDemoArtifact(
    factura: CreateFacturaDto,
  ): { xml: string; hash: string } {
    const canonicalPayload = {
      version: 1,
      country: 'CO',
      authority: 'DIAN',
      fiscalValidity: 'NONE',
      documentType: String(factura.tipo_documento ?? ''),
      series: String(factura.serie ?? ''),
      number: Number(factura.numero ?? 0),
      issueDate: String((factura as any).fecha_emision ?? ''),
      currency: String(factura.moneda ?? 'COP').trim().toUpperCase(),
      issuerTaxId: String(factura.ruc_emisor ?? ''),
      receiverDocument: String(factura.documento_receptor ?? ''),
      taxable: Number(factura.total_gravadas ?? 0),
      exempt: Number((factura as any).total_exoneradas ?? 0),
      excluded: Number((factura as any).total_inafectas ?? 0),
      taxes: Number(factura.total_igv ?? 0),
      payable: Number(factura.total_venta ?? 0),
      items: (factura.items ?? []).map((item: any) => ({
        code: String(item.codigo ?? item.producto_id ?? ''),
        description: String(item.descripcion ?? ''),
        quantity: Number(item.cantidad ?? 0),
        unitPrice: Number(item.precio_unitario ?? item.precioUnitario ?? 0),
        lineValue: Number(item.valor_venta ?? item.valorVenta ?? 0),
        vat: Number(item.impuesto_igv ?? item.igv ?? 0),
        affectation: String(item.tipo_afectacion_igv ?? item.afectacion_igv ?? ''),
      })),
    };
    const payload = Buffer.from(JSON.stringify(canonicalPayload), 'utf8').toString('base64');
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<DemoCpe xmlns="urn:erp-suite:demo:cpe:1" country="CO" authority="DIAN" fiscalValidity="NONE">',
      '<Notice>MUESTRA DEMO SIN TRANSMISION NI VALIDEZ DIAN</Notice>',
      `<CanonicalPayload encoding="base64-json">${payload}</CanonicalPayload>`,
      '</DemoCpe>',
    ].join('');
    return {
      xml,
      hash: createHash('sha256').update(xml, 'utf8').digest('hex'),
    };
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

private resolveColombiaDemoSeries(configuredPrefix: unknown): string {
    return String(configuredPrefix ?? '').trim().toUpperCase() || 'DEMO';
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
