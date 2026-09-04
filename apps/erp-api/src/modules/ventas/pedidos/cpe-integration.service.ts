import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CpeService } from '../../cpe/cpe.service';
import { ValidationService } from '../../validations/validation.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { AFECTACION_IGV, calcularDesgloseIgv, esGravado } from '../../../shared/utils/igv-afectacion.util';
import { CondicionPago, CreateFacturaDto, TipoDocumento, ItemFacturaDto } from '@erp-suite/dtos';
import { PedidoVenta, PedidoDetalle } from './entities';
import { IntegrationAlertsService } from '../../notifications/integration-alerts.service';
import { fechaHoyDelTenant } from '../../../shared/utils/fecha-tenant.util';
import { fechaHoyEnPais } from '../../../shared/utils/fecha-peru.util';
import { normalizeDianIdentity } from '../../fiscal/colombia/dian-document.util';
import {
  DIAN_PAYMENT_INTENT_KEY,
  DIAN_PAYMENT_SNAPSHOT_KEY,
} from './pedido-payment.util';
import {
  isFiscalDemoRepresentation,
  resolveHistoricalCpeCountry,
} from '../../cpe/historical-cpe-country.util';

interface DianPedidoPaymentSnapshot {
  condicionPago: CondicionPago;
  medioPago: string;
  plazoPagoDias: number;
  fechaEmision: string;
  fechaVencimiento: string;
}

interface DianFiscalProductSnapshot {
  id?: string;
  codigo?: string | null;
  afectacion_igv?: string | null;
}

interface DianFiscalOrderSnapshot {
  version: number;
  sha256: string;
  pedido: PedidoVenta;
  detalle: PedidoDetalle[];
  cliente: Record<string, unknown>;
  empresa: Record<string, unknown>;
  productos: Record<string, DianFiscalProductSnapshot>;
  tasa_impuesto: number | string;
  payment_snapshot: Record<string, unknown>;
}

type PedidoDianFacturable = PedidoVenta & {
  detalle: PedidoDetalle[];
  __dianFiscalSnapshot?: DianFiscalOrderSnapshot;
};

/**
 * CPEIntegrationService
 * Servicio para integrar el módulo de Pedidos con el módulo CPE
 * Requirements: 10.2, 10.3, 10.6, 10.7, 15.3, 15.5, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10
 */
@Injectable()
export class CPEIntegrationService {
  private readonly logger = new Logger(CPEIntegrationService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly cpeService: CpeService,
    private readonly validationService: ValidationService,
    private readonly integrationAlerts: IntegrationAlertsService,
    private readonly taxCalculator: TaxCalculatorService,
  ) {}

  /**
   * Conserva el snapshot de pago que ya venga congelado en el pedido. La tabla
   * comercial no tiene columnas dedicadas para esos datos, pero sí `metadata`;
   * por compatibilidad también se aceptan propiedades directas al hidratar un
   * pedido legado. Dos fuentes distintas nunca pueden contradecirse.
   */
  private resolverPagoDianPedido(pedido: PedidoVenta): DianPedidoPaymentSnapshot {
    const condicion = this.resolverValorPedido(
      pedido,
      ['condicion_pago', 'condicionPago', 'dian_forma_pago'],
      (valor) => this.normalizarCondicionPagoDian(valor),
      'condición de pago',
    );
    const medio = this.resolverValorPedido(
      pedido,
      ['medio_pago', 'medioPago', 'dian_medio_pago'],
      (valor) => this.normalizarMedioPagoDian(valor),
      'medio de pago',
    );
    const plazo = this.resolverValorPedido(
      pedido,
      ['plazo_pago_dias', 'plazoPagoDias'],
      (valor) => this.normalizarPlazoPagoDian(valor),
      'plazo de pago',
    );
    const fechaEmision = this.resolverValorPedido(
      pedido,
      ['fecha_emision', 'fechaEmision'],
      (valor) => this.normalizarFechaCalendarioDian(valor, 'emisión'),
      'fecha de emisión',
    ) ?? fechaHoyEnPais('CO');
    const fechaVencimiento = this.resolverValorPedido(
      pedido,
      ['fecha_vencimiento', 'fechaVencimiento'],
      (valor) => this.normalizarFechaCalendarioDian(valor, 'vencimiento'),
      'fecha de vencimiento',
    );

    const tieneDetallePago = medio !== undefined || plazo !== undefined || fechaVencimiento !== undefined;
    if (condicion === undefined && tieneDetallePago) {
      throw new BadRequestException({
        message:
          'DIAN: el pedido tiene medio, plazo o vencimiento, pero no declara si la venta es CONTADO o CREDITO',
        code: 'PEDIDO_DIAN_PAYMENT_INCOMPLETE',
      });
    }

    // Sin snapshot explícito se usa la única semántica que no crea una deuda:
    // contado, código 10 y vencimiento el mismo día calendario de Colombia.
    const condicionPago = condicion ?? CondicionPago.CONTADO;
    if (condicionPago === CondicionPago.CONTADO) {
      const plazoPagoDias = plazo ?? 0;
      const vencimiento = fechaVencimiento ?? fechaEmision;
      if (plazoPagoDias !== 0 || vencimiento !== fechaEmision) {
        throw new BadRequestException({
          message:
            'DIAN: un pedido al contado debe tener plazo 0 y vencimiento igual a la fecha de emisión',
          code: 'PEDIDO_DIAN_PAYMENT_INCONSISTENT',
        });
      }
      return {
        condicionPago,
        medioPago: medio ?? '10',
        plazoPagoDias,
        fechaEmision,
        fechaVencimiento: vencimiento,
      };
    }

    if (plazo === undefined && fechaVencimiento === undefined) {
      throw new BadRequestException({
        message: 'DIAN: un pedido a crédito requiere plazo o fecha de vencimiento explícitos',
        code: 'PEDIDO_DIAN_PAYMENT_INCOMPLETE',
      });
    }

    const diasPorFecha = fechaVencimiento === undefined
      ? undefined
      : this.diasEntreFechasCalendario(fechaEmision, fechaVencimiento);
    const plazoPagoDias = plazo ?? diasPorFecha!;
    if (plazoPagoDias < 1 || (diasPorFecha !== undefined && diasPorFecha !== plazoPagoDias)) {
      throw new BadRequestException({
        message:
          'DIAN: el plazo de crédito debe ser positivo y coincidir exactamente con la fecha de vencimiento',
        code: 'PEDIDO_DIAN_PAYMENT_INCONSISTENT',
      });
    }

    return {
      condicionPago,
      // Código 1 es el medio DIAN «no definido» cuando el crédito no declara
      // otro código del catálogo 49; no inventa efectivo ni transferencia.
      medioPago: medio ?? '1',
      plazoPagoDias,
      fechaEmision,
      fechaVencimiento: fechaVencimiento
        ?? this.sumarDiasCalendario(fechaEmision, plazoPagoDias),
    };
  }

  private resolverValorPedido<T>(
    pedido: PedidoVenta,
    claves: string[],
    normalizar: (valor: unknown) => T,
    etiqueta: string,
  ): T | undefined {
    const metadata = pedido.metadata && typeof pedido.metadata === 'object'
      ? pedido.metadata
      : {};
    const intent = metadata[DIAN_PAYMENT_INTENT_KEY];
    const snapshot = metadata[DIAN_PAYMENT_SNAPSHOT_KEY];
    const fuentesAnidadas = [snapshot, intent].filter(
      (valor): valor is Record<string, unknown> => Boolean(valor) && typeof valor === 'object',
    );
    const valores = [
      ...claves.map((clave) => (pedido as unknown as Record<string, unknown>)[clave]),
      ...claves.map((clave) => metadata[clave]),
      ...fuentesAnidadas.flatMap((fuente) => claves.map((clave) => fuente[clave])),
    ].filter((valor) => valor !== undefined && valor !== null && String(valor).trim() !== '');

    if (valores.length === 0) return undefined;
    const normalizados = valores.map(normalizar);
    const primero = JSON.stringify(normalizados[0]);
    if (normalizados.some((valor) => JSON.stringify(valor) !== primero)) {
      throw new BadRequestException({
        message: `DIAN: el pedido contiene valores contradictorios para ${etiqueta}`,
        code: 'PEDIDO_DIAN_PAYMENT_CONFLICT',
      });
    }
    return normalizados[0];
  }

  private normalizarCondicionPagoDian(valor: unknown): CondicionPago {
    const normalizado = String(valor).trim().toUpperCase();
    if (normalizado === '1' || normalizado === 'CONTADO') return CondicionPago.CONTADO;
    if (['2', 'CREDITO', 'CRÉDITO'].includes(normalizado)) return CondicionPago.CREDITO;
    throw new BadRequestException({
      message: 'DIAN: la condición del pedido debe ser CONTADO o CREDITO',
      code: 'PEDIDO_DIAN_PAYMENT_INVALID',
    });
  }

  private normalizarMedioPagoDian(valor: unknown): string {
    const normalizado = String(valor).trim().toUpperCase();
    if (/^\d{1,3}$/.test(normalizado) || normalizado === 'ZZZ') return normalizado;
    throw new BadRequestException({
      message: 'DIAN: el medio del pedido debe ser un código de 1 a 3 dígitos o ZZZ',
      code: 'PEDIDO_DIAN_PAYMENT_INVALID',
    });
  }

  private normalizarPlazoPagoDian(valor: unknown): number {
    const normalizado = Number(valor);
    if (Number.isSafeInteger(normalizado) && normalizado >= 0) return normalizado;
    throw new BadRequestException({
      message: 'DIAN: el plazo del pedido debe ser un número entero no negativo',
      code: 'PEDIDO_DIAN_PAYMENT_INVALID',
    });
  }

  private normalizarFechaCalendarioDian(valor: unknown, etiqueta: string): string {
    const normalizado = String(valor).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizado)) {
      throw new BadRequestException({
        message: `DIAN: la fecha de ${etiqueta} del pedido debe usar YYYY-MM-DD`,
        code: 'PEDIDO_DIAN_PAYMENT_INVALID',
      });
    }
    const fecha = new Date(`${normalizado}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== normalizado) {
      throw new BadRequestException({
        message: `DIAN: la fecha de ${etiqueta} del pedido no existe en el calendario`,
        code: 'PEDIDO_DIAN_PAYMENT_INVALID',
      });
    }
    return normalizado;
  }

  private diasEntreFechasCalendario(desde: string, hasta: string): number {
    return Math.trunc(
      (Date.parse(`${hasta}T00:00:00.000Z`) - Date.parse(`${desde}T00:00:00.000Z`))
        / 86_400_000,
    );
  }

  private sumarDiasCalendario(fecha: string, dias: number): string {
    const resultado = new Date(`${fecha}T00:00:00.000Z`);
    resultado.setUTCDate(resultado.getUTCDate() + dias);
    return resultado.toISOString().slice(0, 10);
  }

  private llaveFiscalDianPedido(
    pedidoId: string,
    tenantId: string,
    idempotencyKey?: string,
  ): string {
    const canonical = `ventas.cpe.factura:${tenantId}:${pedidoId}`;
    const provided = String(idempotencyKey ?? '').trim();
    if (provided && provided !== canonical) {
      throw new BadRequestException({
        message: 'DIAN: la llave idempotente del pedido debe ser su identidad fiscal canónica',
        code: 'PEDIDO_DIAN_IDEMPOTENCY_KEY_INVALID',
      });
    }
    return canonical;
  }

  private async consumirSnapshotDianPedido(
    pedidoId: string,
    tenantId: string,
    idempotencyKey: string,
    cpeId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase.getClient().rpc(
      'consumir_snapshot_dian_pedido_tx_531',
      {
        p_tenant_id: tenantId,
        p_pedido_id: pedidoId,
        p_idempotency_key: idempotencyKey,
        p_cpe_id: cpeId,
      },
    );
    if (error || data?.state !== 'CONSUMED') {
      throw new BadRequestException({
        message: error?.message || 'No se pudo confirmar el consumo del snapshot fiscal DIAN',
        code: 'PEDIDO_DIAN_LIFECYCLE_CONSUME_FAILED',
      });
    }
  }

  private async abortarSnapshotDianPedidoSeguro(
    pedidoId: string,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase.getClient().rpc(
        'abortar_snapshot_dian_pedido_tx_531',
        {
          p_tenant_id: tenantId,
          p_pedido_id: pedidoId,
          p_idempotency_key: idempotencyKey,
          p_reason: 'API_CPE_CREATE_FAILED',
        },
      );
      if (error) {
        this.logger.warn(
          `No se pudo evaluar el release del snapshot DIAN del pedido ${pedidoId}: ${error.message}`,
        );
      } else if (data?.state === 'PREPARED' && data?.released === false) {
        this.logger.warn(
          `Snapshot DIAN del pedido ${pedidoId} permanece PREPARED: ya existe evidencia fiscal`,
        );
      }
    } catch (lifecycleError) {
      // El fallo de limpieza nunca reemplaza el error original de emisión. El
      // estado conservador es mantener PREPARED para un retry idempotente.
      this.logger.warn(
        `No se pudo evaluar el release del snapshot DIAN del pedido ${pedidoId}`,
        lifecycleError,
      );
    }
  }

  /**
   * Congela la fecha calendario colombiana y la forma de pago antes de que el
   * writer reserve el consecutivo DIAN. El CAS sobre `updated_at` evita que dos
   * emisores congelen intenciones distintas; un retry reutiliza exactamente el
   * mismo snapshot aunque ya haya cruzado la medianoche en Bogotá.
   */
  private async congelarPagoDianPedido(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
    idempotencyKey?: string,
  ): Promise<{
    pedido: PedidoDianFacturable;
    cliente: Record<string, unknown>;
    empresaConfig: Record<string, unknown>;
  }> {
    const key = this.llaveFiscalDianPedido(pedido.id, tenantId, idempotencyKey);
    if (!key) {
      throw new BadRequestException({
        message: 'DIAN: la facturación del pedido requiere una llave idempotente estable',
        code: 'PEDIDO_DIAN_IDEMPOTENCY_REQUIRED',
      });
    }

    const { data, error } = await this.supabase.getClient().rpc(
      'congelar_pago_dian_pedido_tx_531',
      {
        p_tenant_id: tenantId,
        p_pedido_id: pedido.id,
        p_idempotency_key: key,
      },
    );
    if (error || !data?.metadata || !data?.fiscal_snapshot) {
      throw new BadRequestException({
        message: error?.message || 'No se pudo congelar el snapshot fiscal del pedido',
        code: 'PEDIDO_DIAN_PAYMENT_FREEZE_FAILED',
      });
    }
    const persistedMetadata = data.metadata as Record<string, unknown>;
    const fiscalSnapshot = data.fiscal_snapshot as DianFiscalOrderSnapshot;
    const canonicalSnapshot = String(data.fiscal_snapshot_canonical ?? '');
    let canonicalPayload: unknown;
    try {
      canonicalPayload = JSON.parse(canonicalSnapshot);
    } catch {
      canonicalPayload = null;
    }
    const snapshotPayload = fiscalSnapshot && typeof fiscalSnapshot === 'object'
      ? { ...fiscalSnapshot } as Record<string, unknown>
      : {};
    delete snapshotPayload.sha256;
    const snapshotHash = canonicalSnapshot
      ? createHash('sha256').update(canonicalSnapshot, 'utf8').digest('hex')
      : '';
    const pedidoCanonico = fiscalSnapshot?.pedido;
    const detalleCanonico = fiscalSnapshot?.detalle;
    const clienteCanonico = fiscalSnapshot?.cliente;
    const empresaCanonica = fiscalSnapshot?.empresa;
    if (
      fiscalSnapshot?.version !== 1
      || !/^[0-9a-f]{64}$/.test(String(fiscalSnapshot?.sha256 ?? ''))
      || snapshotHash !== fiscalSnapshot?.sha256
      || !isDeepStrictEqual(canonicalPayload, snapshotPayload)
      || !isDeepStrictEqual(
        persistedMetadata[DIAN_PAYMENT_SNAPSHOT_KEY],
        fiscalSnapshot?.payment_snapshot,
      )
      || pedidoCanonico?.id !== pedido.id
      || pedidoCanonico?.tenant_id !== tenantId
      || !Array.isArray(detalleCanonico)
      || detalleCanonico.length === 0
      || !clienteCanonico
      || !empresaCanonica
      || !fiscalSnapshot.payment_snapshot
      || typeof fiscalSnapshot.payment_snapshot !== 'object'
      || !fiscalSnapshot.productos
      || typeof fiscalSnapshot.productos !== 'object'
    ) {
      throw new BadRequestException({
        message: 'DIAN: el snapshot fiscal canónico del pedido es inválido o incompleto',
        code: 'PEDIDO_DIAN_FISCAL_SNAPSHOT_INVALID',
      });
    }

    return {
      pedido: {
        ...pedidoCanonico,
        // A partir de aquí el resolvedor sólo puede ver los términos de pago
        // incluidos en el payload hash-bound. Intención y claves directas de
        // metadata no vuelven a competir como fuentes durante la emisión.
        metadata: {
          [DIAN_PAYMENT_SNAPSHOT_KEY]: fiscalSnapshot.payment_snapshot,
        },
        detalle: detalleCanonico,
        __dianFiscalSnapshot: fiscalSnapshot,
      },
      cliente: clienteCanonico,
      empresaConfig: empresaCanonica,
    };
  }

  /**
   * Genera una factura desde un pedido
   * Requirements: 10.2, 10.3, 10.6, 10.7
   */
  async generarFacturaDesdePedido(
    pedido: PedidoVenta & { detalle: PedidoDetalle[] },
    tenantId: string,
    idempotencyKey?: string,
    userId?: string,
  ): Promise<{
    factura_id: string;
    estado: string;
    warnings?: string[];
    is_demo_representation?: boolean;
    serie?: string;
    numero?: number;
    moneda?: string;
    fecha_emision?: string;
    total: number;
    documento_id?: string | null;
    cpe_id?: string;
    fiscal_authority?: 'SUNAT' | 'ARCA' | 'DIAN';
  }> {
    this.logger.log(`Generando factura desde pedido ${pedido.id}`);

    const startedAt = Date.now();
    let dianLifecycleKey: string | null = null;
    let dianSnapshotPrepared = false;

    try {
      // 1. Determinar primero país y modalidad. Una demo CO/AR produce sólo una
      // representación local marcada sin validez fiscal; no debe fingir una
      // firma usando el certificado sintético peruano ni exigir un PFX real.
      let empresaConfig = await this.obtenerEmpresaConfig(tenantId);
      const paisConfigurado = String(empresaConfig.pais ?? '').trim().toUpperCase();
      const esDemoLocalSinFirma = empresaConfig.is_demo === true
        && ['CO', 'AR'].includes(paisConfigurado);

      // 2. Toda cuenta real y las demos fuera de CO/AR conservan el guard de
      // certificado vigente. El bypass es exacto para representaciones locales.
      if (!esDemoLocalSinFirma) {
        const certificateValidation = await this.validationService.validateCertificate(tenantId);
        if (!certificateValidation.isValid) {
          this.logger.error(`Certificado inválido para tenant ${tenantId}: ${certificateValidation.errors.join(', ')}`);
          throw new BadRequestException({
            message: 'No se puede generar factura: Certificado digital inválido o vencido',
            code: 'CERT_VALIDATION_FAILED',
            errors: certificateValidation.errors,
          });
        }

        // Log warnings del certificado (ej: próximo a vencer)
        if (certificateValidation.warnings.length > 0) {
          this.logger.warn(`Advertencias del certificado: ${certificateValidation.warnings.join(', ')}`);
        }
      }

      // 3. Determinar el adaptador fiscal. En Colombia el RPC retorna el corte
      // canónico completo tomado bajo locks; ningún dato precargado del pedido,
      // sus líneas o el cliente vuelve a participar en la emisión.
      let pedidoFacturable: PedidoDianFacturable = pedido;
      let cliente: Record<string, unknown>;
      if (String(empresaConfig.pais ?? '').trim().toUpperCase() === 'CO') {
        dianLifecycleKey = this.llaveFiscalDianPedido(
          pedido.id,
          tenantId,
          idempotencyKey,
        );
        const congelado = await this.congelarPagoDianPedido(
          pedido,
          tenantId,
          dianLifecycleKey,
        );
        dianSnapshotPrepared = true;
        pedidoFacturable = congelado.pedido;
        cliente = congelado.cliente;
        empresaConfig = congelado.empresaConfig;
      } else {
        cliente = await this.obtenerCliente(pedido.cliente_id, tenantId);
      }

      // 3. El límite se valida sobre el detalle canónico, no sobre el DTO que
      // pudo quedar obsoleto mientras la solicitud esperaba el lock fiscal.
      if (pedidoFacturable.detalle.length > 999) {
        throw new BadRequestException({
          message: 'No se puede generar factura: El pedido supera el límite de 999 ítems permitidos por SUNAT',
          code: 'MAX_ITEMS_EXCEEDED',
          details: {
            items_count: pedidoFacturable.detalle.length,
            max_allowed: 999,
          },
        });
      }

      // 4. Mapear datos de pedido a formato CPE (Requirement 10.2)
      const facturaData = await this.mapearPedidoACPE(pedidoFacturable, cliente, empresaConfig);

      // HARDENING: dedupe de reintentos (ventas→CPE) con una llave estable por pedido.
      const cpeIdempotencyKey = dianLifecycleKey
        ?? (idempotencyKey ? String(idempotencyKey).trim() : null);
      const mappedIdempotencyKey = String(
        (facturaData as any).idempotency_key ?? '',
      ).trim();
      if (
        dianLifecycleKey
        && mappedIdempotencyKey
        && mappedIdempotencyKey !== dianLifecycleKey
      ) {
        throw new BadRequestException({
          message: 'DIAN: la llave del CPE no coincide con la intención fiscal congelada',
          code: 'PEDIDO_DIAN_IDEMPOTENCY_CONFLICT',
        });
      }
      if (cpeIdempotencyKey) {
        (facturaData as any).idempotency_key = cpeIdempotencyKey;
      }

      // 6. Llamar a CPEService para generar XML/UBL 2.1, QR, hash, PDF (Requirement 10.3, 19.8)
      this.logger.log('Llamando a CPEService para crear factura');
      const factura = await this.cpeService.create(
        facturaData,
        tenantId,
        userId,
        dianLifecycleKey
          ? { pedidoFiscalOwnerId: pedido.id }
          : undefined,
      );
      // `CpeService.create` devuelve el DTO público, que deliberadamente no
      // expone `issuer_snapshot` ni `metadata`; además `cpe.pais` es nullable.
      // Por eso la procedencia y el modo demo/real se vuelven a leer desde la
      // fila ya persistida, siempre bajo el mismo tenant. Usar empresa_config
      // aquí reetiquetaría comprobantes históricos después de una conversión.
      const facturaPersistida = await this.obtenerCpePersistidoParaRespuesta(
        factura?.id,
        tenantId,
      );
      const documentoId = facturaPersistida.documento_id
        ?? (factura as any).documento_id
        ?? (factura as any).documentoId
        ?? null;

      if (dianSnapshotPrepared && dianLifecycleKey) {
        await this.consumirSnapshotDianPedido(
          pedido.id,
          tenantId,
          dianLifecycleKey,
          facturaPersistida.id,
        );
      }

      this.logger.log(`✅ Factura generada exitosamente: ${facturaPersistida.id}`);

      // El modo del comprobante es histórico e inmutable. No se vuelve a
      // inferir desde empresa_config porque el tenant puede convertirse de demo
      // a real entre el freeze y esta respuesta (o antes de un reintento).
      const paisFiscalPersistido = resolveHistoricalCpeCountry(facturaPersistida);
      const autoridadFiscalPersistida = paisFiscalPersistido === 'AR'
        ? 'ARCA'
        : paisFiscalPersistido === 'CO'
          ? 'DIAN'
          : 'SUNAT';
      const esRepresentacionDemoLocal = isFiscalDemoRepresentation(
        facturaPersistida,
      );

      // 7. Manejar respuestas de SUNAT (Requirement 10.7, 19.9, 19.10)
      const resultado = this.procesarRespuestaFiscal(
        facturaPersistida,
        paisFiscalPersistido,
        esRepresentacionDemoLocal,
      );

      const durationMs = Date.now() - startedAt;

      await this.registrarExitoIntegracion({
        pedidoId: pedido.id,
        tenantId,
        facturaId: facturaPersistida.id,
        durationMs,
        responseSummary: {
          serie: facturaPersistida.serie ?? factura.serie ?? facturaData.serie,
          numero: facturaPersistida.numero ?? factura.numero ?? facturaData.numero,
          estado: resultado.estado,
          is_demo_representation: esRepresentacionDemoLocal,
        },
      });

      return {
        factura_id: facturaPersistida.id,
        cpe_id: facturaPersistida.id,
        estado: resultado.estado,
        warnings: resultado.warnings,
        is_demo_representation: esRepresentacionDemoLocal,
        fiscal_authority: autoridadFiscalPersistida,
        serie: facturaPersistida.serie ?? factura.serie ?? facturaData.serie,
        numero: facturaPersistida.numero ?? factura.numero ?? facturaData.numero,
        moneda: facturaPersistida.moneda ?? factura.moneda ?? facturaData.moneda ?? 'PEN',
        // Fecha fiscal: si el writer no la devolvió, se toma la del contribuyente y
        // no la de UTC, que pasadas las 19:00 de Lima sería el día siguiente.
        fecha_emision: facturaPersistida.fecha_emision
          ?? (factura as any).fecha_emision
          ?? await fechaHoyDelTenant(this.supabase.getClient(), tenantId),
        total: facturaPersistida.total_venta ?? factura.total_venta ?? facturaData.total_venta,
        documento_id: documentoId,
      };
    } catch (error) {
      this.logger.error(`Error generando factura desde pedido ${pedido.id}:`, error);
      const durationMs = Date.now() - startedAt;

      if (dianSnapshotPrepared && dianLifecycleKey) {
        await this.abortarSnapshotDianPedidoSeguro(
          pedido.id,
          tenantId,
          dianLifecycleKey,
        );
      }

      // Registrar error para reintentos (Requirement 19.10)
      await this.registrarErrorIntegracion({
        pedidoId: pedido.id,
        tenantId,
        errorMessage: error?.message ?? 'Error desconocido generando factura',
        durationMs,
      });
      
      throw error;
    }
  }

  /**
   * Mapea datos del pedido al formato CPE
   * Requirements: 10.2, 15.3
   */
  private async mapearPedidoACPE(
    pedido: PedidoDianFacturable,
    cliente: any,
    empresaConfig: any,
  ): Promise<CreateFacturaDto> {
    const fiscalSnapshot = pedido.__dianFiscalSnapshot;
    const tasaIgv = fiscalSnapshot
      ? Number(fiscalSnapshot.tasa_impuesto)
      : await this.taxCalculator.getTasaIgv(pedido.tenant_id);
    if (!Number.isFinite(tasaIgv) || tasaIgv < 0 || tasaIgv > 1) {
      throw new BadRequestException({
        message: 'DIAN: el snapshot fiscal contiene una tasa tributaria inválida',
        code: 'PEDIDO_DIAN_FISCAL_SNAPSHOT_INVALID',
      });
    }

    // La afectación del IGV vive en el producto (SUNAT Catálogo 07): sin ella,
    // una factura con bienes exonerados cobraría IGV que no corresponde.
    const productoIds = pedido.detalle.map((item) => item.producto_id);
    const countryCode = String(empresaConfig.pais ?? '').trim().toUpperCase();
    const exigeAfectacionExplicita = countryCode === 'CO' && empresaConfig.is_demo !== true;
    let afectacionPorProducto: Map<string, string>;
    let costoPorProducto: Map<string, number>;
    if (fiscalSnapshot) {
      afectacionPorProducto = new Map<string, string>();
      costoPorProducto = new Map<string, number>();
      const faltantes: string[] = [];
      for (const productoId of Array.from(new Set(productoIds))) {
        const perfil = fiscalSnapshot.productos[productoId];
        const afectacion = String(perfil?.afectacion_igv ?? '').trim();
        if (!perfil || !afectacion) {
          faltantes.push(productoId);
          continue;
        }
        afectacionPorProducto.set(productoId, afectacion);
      }
      if (exigeAfectacionExplicita && faltantes.length > 0) {
        throw new BadRequestException({
          message: 'DIAN: el snapshot fiscal no contiene todos los perfiles tributarios',
          code: 'PEDIDO_DIAN_TAX_PROFILE_INCOMPLETE',
          details: { producto_ids: faltantes },
        });
      }
    } else {
      [afectacionPorProducto, costoPorProducto] = await Promise.all([
        this.obtenerAfectacionPorProducto(
          pedido.tenant_id,
          productoIds,
          exigeAfectacionExplicita,
        ),
        this.obtenerCostoPorProducto(pedido.tenant_id, productoIds),
      ]);
    }

    // Mapear items del pedido a items de factura
    const items: ItemFacturaDto[] = pedido.detalle.map((item) => {
      const cantidad = Number(item.cantidad ?? 0);
      const precioUnitario = Number(item.precio_unitario ?? 0);
      const valorVenta = Number(item.subtotal ?? cantidad * precioUnitario);
      const afectacion = afectacionPorProducto.get(item.producto_id) ?? AFECTACION_IGV.GRAVADO;
      const igv = esGravado(afectacion) ? valorVenta * tasaIgv : 0;
      // ItemFacturaDto conserva precio_venta como precio unitario con tributos;
      // el total de linea se deriva de valorVenta + igv.
      const precioVenta = cantidad > 0 ? (valorVenta + igv) / cantidad : 0;

      return {
        pedido_detalle_id: item.id,
        producto_id: item.producto_id,
        codigo: item.producto_id.substring(0, 8), // Código simplificado
        descripcion: item.descripcion,
        cantidad,
        unidad: 'NIU', // Unidad por defecto (SUNAT)
        precio_unitario: precioUnitario,
        valor_venta: valorVenta,
        igv,
        precio_venta: precioVenta,
        tipo_afectacion_igv: afectacion,
      } as ItemFacturaDto;
    });

    const desgloseIgv = calcularDesgloseIgv(
      pedido.detalle.map((item) => ({
        baseImponible: Number(
          item.subtotal ?? Number(item.cantidad ?? 0) * Number(item.precio_unitario ?? 0),
        ),
        afectacionIgv: afectacionPorProducto.get(item.producto_id),
      })),
      tasaIgv,
    );

    const numeroDocumentoCliente = this.resolverDocumentoCliente(cliente);

    if (!numeroDocumentoCliente) {
      throw new BadRequestException({
        message: 'El cliente seleccionado no tiene un documento tributario configurado',
        code: 'CLIENTE_SIN_DOCUMENTO',
      });
    }

    const dianIdentity = countryCode === 'CO'
      ? normalizeDianIdentity(cliente.documento_tipo, numeroDocumentoCliente)
      : null;
    const tipoDocumentoReceptor = dianIdentity?.type
      ?? this.mapearTipoDocumentoSunat(cliente.documento_tipo);
    const razonSocialCliente = cliente.razon_social || cliente.nombre_comercial;

    const esRucValido = tipoDocumentoReceptor === '6' && /^\d{11}$/.test(numeroDocumentoCliente);
    if (countryCode !== 'CO' && tipoDocumentoReceptor === '6' && !esRucValido) {
      throw new BadRequestException({
        message: 'El cliente marcado como RUC debe tener 11 dígitos para emitir factura',
        code: 'CLIENTE_RUC_INVALIDO',
      });
    }

    // SUNAT: la factura (01) exige receptor RUC; consumidores con DNI, CE,
    // pasaporte u otro documento reciben boleta (03). El pedido no debe forzar
    // una factura sólo por provenir del flujo comercial.
    const tipoDocumentoCpe = countryCode === 'CO'
      ? TipoDocumento.FACTURA
      : esRucValido
        ? TipoDocumento.FACTURA
        : TipoDocumento.BOLETA;
    const { serie, numero } = countryCode === 'CO' && empresaConfig.is_demo !== true
      ? {
          // Esos valores son únicamente un placeholder interno: CpeService los
          // reemplaza obligatoriamente por la reserva DIAN asociada a la clave
          // estable del pedido antes de firmar o persistir.
          serie: String(empresaConfig.dian_resolucion_prefijo ?? '').trim().toUpperCase(),
          numero: 0,
        }
      : await this.obtenerSerieYNumero(pedido.tenant_id, tipoDocumentoCpe);

    if (!razonSocialCliente) {
      throw new BadRequestException({
        message: 'El cliente no tiene una razón social configurada',
        code: 'CLIENTE_SIN_RAZON_SOCIAL',
      });
    }

    // La moneda va impresa en el comprobante: suponer soles cuando falta la
    // configuración emitiría un documento argentino o colombiano en PEN. Es la
    // misma decisión que ya se tomó en TaxCalculatorService y en fiscal-adapter.
    const monedaEmision = String(empresaConfig.moneda_defecto || '').trim().toUpperCase();
    if (!monedaEmision) {
      throw new BadRequestException(
        'La empresa no tiene moneda configurada; no se emite el comprobante con una supuesta.',
      );
    }

    const pagoDian = countryCode === 'CO'
      ? this.resolverPagoDianPedido(pedido)
      : null;

    // Construir DTO de factura
    const facturaDto: CreateFacturaDto = {
      serie: serie,
      numero: numero,
      tipo_documento: tipoDocumentoCpe,
      ruc_emisor: empresaConfig.ruc,
      razon_social_emisor: empresaConfig.razon_social,
      tipo_documento_receptor: tipoDocumentoReceptor,
      documento_receptor: dianIdentity?.canonicalNumber ?? numeroDocumentoCliente,
      razon_social_receptor: razonSocialCliente,
      // Sin dirección se envía vacío, no un texto inventado: el campo es opcional
      // en el contrato y «DIRECCIÓN NO REGISTRADA» viajaba dentro del comprobante
      // como si fuese el domicilio del cliente.
      direccion_receptor: String(cliente.direccion || '').trim(),
      moneda: monedaEmision,
      items: items,
      // Bases separadas por afectación; el IGV se recalcula sobre lo gravado en
      // lugar de arrastrar el total del pedido, que asumía todo gravado.
      total_gravadas: desgloseIgv.gravadas,
      total_exoneradas: desgloseIgv.exoneradas,
      total_inafectas: desgloseIgv.inafectas,
      total_exportacion: desgloseIgv.exportacion,
      total_igv: desgloseIgv.igv,
      total_venta: desgloseIgv.total,
      // Colombia conserva el snapshot comercial cuando existe. Si el pedido no
      // declara pago, el resolvedor usa contado sin crear una deuda ficticia.
      condicion_pago: pagoDian?.condicionPago ?? CondicionPago.CREDITO,
      pedido_id: pedido.id,
    };

    if (pagoDian) {
      facturaDto.fecha_emision = pagoDian.fechaEmision;
      facturaDto.fecha_vencimiento = pagoDian.fechaVencimiento;
      (facturaDto as any).medio_pago = pagoDian.medioPago;
      (facturaDto as any).plazo_pago_dias = pagoDian.plazoPagoDias;
    }

    // En Colombia el writer transaccional facturar_pedido_venta_tx relee y
    // calcula el costo autoritativo bajo lock. No lo copiamos al snapshot del
    // pedido porque ese metadata también es visible para el rol vendedor.
    if (countryCode !== 'CO') {
      (facturaDto as any).costo_ventas = Number(
        pedido.detalle
          .reduce(
            (sum, item) =>
              sum + Number(costoPorProducto.get(item.producto_id) ?? 0) * Number(item.cantidad ?? 0),
            0,
          )
          .toFixed(2),
      );
    }
    (facturaDto as any).cliente_id = pedido.cliente_id;
    if (countryCode === 'CO') {
      // El perfil forma parte del snapshot hash-bound de 531. Se transporta de
      // manera explícita para que CpeService pueda detectar una edición
      // concurrente del maestro antes de reservar o firmar el comprobante.
      (facturaDto as any).dian_receptor_tax_profile = {
        profile: String(cliente.dian_perfil_fiscal ?? '').trim(),
        taxLevelCode: String(cliente.dian_responsabilidad_fiscal ?? '').trim(),
        taxLevelListName: String(cliente.dian_responsabilidad_list_name ?? '').trim(),
        taxSchemeId: String(cliente.dian_tributo_id ?? '').trim(),
        taxSchemeName: String(cliente.dian_tributo_nombre ?? '').trim(),
      };
    }

    return facturaDto;
  }

  /**
   * Devuelve la afectación del IGV de cada producto del pedido. Ante un producto
   * sin dato se asume gravado, que es el caso mayoritario y no subdeclara IGV.
   */
  private async obtenerAfectacionPorProducto(
    tenantId: string,
    productoIds: string[],
    exigeAfectacionExplicita = false,
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set((productoIds ?? []).filter(Boolean)));
    const afectaciones = new Map<string, string>();
    if (ids.length === 0) return afectaciones;

    // Nunca debe impedir emitir: si la consulta falla, cada ítem cae al default
    // gravado, que es el comportamiento previo y no subdeclara IGV.
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('productos')
        .select('id, afectacion_igv')
        .eq('tenant_id', tenantId)
        .in('id', ids);

      if (error) {
        if (exigeAfectacionExplicita) {
          throw new BadRequestException({
            message: 'DIAN: no se pudo verificar la afectación tributaria de los productos',
            code: 'PEDIDO_DIAN_TAX_PROFILE_UNAVAILABLE',
          });
        }
        this.logger.warn(
          `No se pudo leer la afectación IGV de los productos del pedido: ${error.message}`,
        );
        return afectaciones;
      }

      for (const producto of data ?? []) {
        if (producto.afectacion_igv !== null && producto.afectacion_igv !== undefined) {
          afectaciones.set(producto.id, String(producto.afectacion_igv));
        }
      }

      if (exigeAfectacionExplicita) {
        const faltantes = ids.filter((id) => !afectaciones.has(id));
        if (faltantes.length > 0) {
          throw new BadRequestException({
            message: 'DIAN: todos los productos requieren afectación tributaria explícita',
            code: 'PEDIDO_DIAN_TAX_PROFILE_INCOMPLETE',
            details: { producto_ids: faltantes },
          });
        }
      }
    } catch (error) {
      if (exigeAfectacionExplicita) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException({
          message: 'DIAN: no se pudo verificar la afectación tributaria de los productos',
          code: 'PEDIDO_DIAN_TAX_PROFILE_UNAVAILABLE',
        });
      }
      this.logger.warn(
        `No se pudo leer la afectación IGV de los productos del pedido: ${(error as Error)?.message}`,
      );
    }

    return afectaciones;
  }

  /**
   * Resuelve el costo real desde el catálogo porque pedidos_venta_detalle no
   * persiste costo_unitario. `costo` puede venir en cero en datos migrados, por
   * lo que precio_compra es el fallback operativo usado también por POS.
   */
  private async obtenerCostoPorProducto(
    tenantId: string,
    productoIds: string[],
  ): Promise<Map<string, number>> {
    const ids = Array.from(new Set((productoIds ?? []).filter(Boolean)));
    const costos = new Map<string, number>();
    if (ids.length === 0) return costos;

    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('productos')
        .select('id, costo, precio_compra')
        .eq('tenant_id', tenantId)
        .in('id', ids);

      if (error) {
        this.logger.warn(`No se pudo leer el costo de los productos del pedido: ${error.message}`);
        return costos;
      }

      for (const producto of data ?? []) {
        const costo = Number(producto.costo ?? 0);
        const precioCompra = Number(producto.precio_compra ?? 0);
        costos.set(producto.id, costo > 0 ? costo : Math.max(precioCompra, 0));
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el costo de los productos del pedido: ${(error as Error)?.message}`,
      );
    }

    return costos;
  }

  /**
   * Procesa la respuesta de SUNAT
   * Requirements: 10.7, 19.9, 19.10
   */
  private procesarRespuestaFiscal(
    factura: any,
    countryCode = 'PE',
    isDemo = false,
  ): { estado: string; warnings: string[] } {
    const warnings: string[] = [];
    const authority = countryCode === 'CO' ? 'DIAN' : countryCode === 'AR' ? 'ARCA' : 'SUNAT';

    if (isDemo) {
      warnings.push(`Comprobante demo generado localmente: muestra sin transmisión ni validez ${authority}`);
      this.logger.log(`Factura demo ${factura.id} generada sin transmisión ${authority}`);
      return { estado: factura.estado, warnings };
    }

    // Estados posibles: FIRMADO, ENVIADO, ACEPTADO, RECHAZADO
    switch (factura.estado) {
      case 'ACEPTADO':
        this.logger.log(`✅ Factura ${factura.id} aceptada por ${authority}`);
        return { estado: 'ACEPTADO', warnings };

      case 'FIRMADO':
        warnings.push(`La factura fue firmada pero debe ser enviada manualmente a ${authority} desde el módulo CPE`);
        this.logger.warn(`⚠️ Factura ${factura.id} firmada, pendiente de envío a ${authority}`);
        return { estado: 'FIRMADO', warnings };

      case 'ENVIADO':
        warnings.push(`La factura fue enviada a ${authority} y está pendiente de respuesta`);
        this.logger.log(`📤 Factura ${factura.id} enviada a ${authority}, esperando respuesta`);
        return { estado: 'ENVIADO', warnings };

      case 'RECHAZADO':
        this.logger.error(`❌ Factura ${factura.id} rechazada por ${authority}: ${factura.error_message}`);
        throw new BadRequestException({
          message: `La factura fue rechazada por ${authority}`,
          code: 'FACTURA_RECHAZADA',
          details: {
            error_fiscal: factura.error_message,
            ...(authority === 'SUNAT' ? { error_sunat: factura.error_message } : {}),
          },
        });

      default:
        warnings.push(`Estado desconocido: ${factura.estado}`);
        return { estado: factura.estado, warnings };
    }
  }

  /**
   * Rehidrata la procedencia fiscal inmutable que el DTO público omite. La
   * doble condición evita que un cliente service-role pueda resolver por error
   * un CPE homónimo de otro tenant. Toda ausencia o contradicción falla cerrada
   * antes de comunicar al flujo comercial que la factura quedó generada.
   */
  private async obtenerCpePersistidoParaRespuesta(
    cpeIdInput: unknown,
    tenantId: string,
  ): Promise<Record<string, any>> {
    const cpeId = String(cpeIdInput ?? '').trim();
    if (!cpeId) {
      throw new BadRequestException({
        message: 'No se pudo confirmar el comprobante fiscal persistido',
        code: 'CPE_PERSISTED_PROVENANCE_UNAVAILABLE',
      });
    }

    const { data, error } = await this.supabase.getClient()
      .from('cpe')
      .select([
        'id', 'tenant_id', 'documento_id', 'estado', 'estado_sunat',
        'sunat_status', 'error_message', 'pais', 'simulated_origin',
        'issuer_snapshot', 'metadata', 'serie', 'numero', 'moneda',
        'fecha_emision', 'total_venta',
      ].join(','))
      .eq('id', cpeId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data
        || String((data as any).id ?? '') !== cpeId
        || String((data as any).tenant_id ?? '') !== tenantId) {
      if (error) {
        this.logger.error(
          `No se pudo releer la procedencia del CPE ${cpeId} en tenant ${tenantId}: ${error.message}`,
        );
      }
      throw new BadRequestException({
        message: 'No se pudo confirmar la procedencia fiscal del comprobante persistido',
        code: 'CPE_PERSISTED_PROVENANCE_UNAVAILABLE',
      });
    }

    if (typeof (data as any).simulated_origin !== 'boolean') {
      throw new BadRequestException({
        message: 'El comprobante persistido no conserva una modalidad fiscal verificable',
        code: 'CPE_PERSISTED_PROVENANCE_INVALID',
      });
    }

    try {
      // Valida país soportado y contradicciones snapshot/cpe.pais ahora, no
      // después de devolver un éxito ambiguo al módulo de Pedidos.
      resolveHistoricalCpeCountry(data as Record<string, any>);
    } catch (cause) {
      this.logger.error(
        `Procedencia fiscal inválida en CPE ${cpeId}: ${(cause as Error)?.message ?? 'error desconocido'}`,
      );
      throw new BadRequestException({
        message: 'El comprobante persistido no conserva una procedencia fiscal verificable',
        code: 'CPE_PERSISTED_PROVENANCE_INVALID',
      });
    }

    return data as Record<string, any>;
  }

  /**
   * Obtiene datos del cliente
   */
  private async obtenerCliente(clienteId: string, tenantId: string): Promise<any> {
    const { data: cliente, error } = await this.supabase.getClient()
      .from('clientes')
      .select(
        `
          id,
          tenant_id,
          tipo,
          documento_tipo,
          documento_numero:numero_documento,
          ruc,
          codigo,
          razon_social,
          direccion,
          email,
          limite_credito,
          permite_morosidad
        `,
      )
      .eq('id', clienteId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !cliente) {
      throw new BadRequestException('Cliente no encontrado');
    }

    return cliente;
  }

  private resolverDocumentoCliente(cliente: any): string | null {
    const candidatos = [
      cliente?.documento_numero,
      cliente?.numero_documento,
      cliente?.ruc,
      cliente?.codigo,
      cliente?.documento,
    ];

    for (const candidato of candidatos) {
      const documento = candidato?.toString().trim();
      if (documento) {
        return documento;
      }
    }

    return null;
  }

  private mapearTipoDocumentoSunat(tipo?: string | null): string {
    if (!tipo) {
      return '0';
    }

    const normalizado = tipo.toString().trim().toUpperCase();

    // Si ya viene con código SUNAT (numérico) lo respetamos
    if (/^\d+$/.test(normalizado) && normalizado.length <= 2) {
      return normalizado;
    }

    const map: Record<string, string> = {
      RUC: '6',
      DNI: '1',
      CE: '4',
      CARNET_EXTRANJERIA: '4',
      PASAPORTE: '7',
      PTP: '4',
    };

    return map[normalizado] ?? '0';
  }

  /**
   * Obtiene configuración de la empresa
   */
  private async obtenerEmpresaConfig(tenantId: string): Promise<any> {
    const { data: config, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('ruc, razon_social, serie_factura, serie_boleta, moneda_defecto, pais, pais_id, is_demo, dian_resolucion_prefijo')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !config) {
      throw new BadRequestException('Configuración de empresa no encontrada');
    }

    if (!config.ruc || !config.razon_social) {
      throw new BadRequestException({
        message: 'Configuración de empresa incompleta',
        code: 'RUC_VALIDATION_FAILED',
        details: {
          missing_fields: [
            !config.ruc && 'ruc',
            !config.razon_social && 'razon_social',
          ].filter(Boolean),
        },
      });
    }

    return config;
  }

  /**
   * Obtiene serie y número de factura
   */
  private async obtenerSerieYNumero(
    tenantId: string,
    tipoDocumento: TipoDocumento.FACTURA | TipoDocumento.BOLETA = TipoDocumento.FACTURA,
  ): Promise<{ serie: string; numero: number }> {
    const esBoleta = tipoDocumento === TipoDocumento.BOLETA;
    const serieField = esBoleta ? 'serie_boleta' : 'serie_factura';
    const { data: config, error } = await this.supabase.getClient()
      .from('empresa_config')
      .select('serie_factura, serie_boleta')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !config) {
      throw new BadRequestException('No se pudo obtener la serie de factura');
    }

    const serie = config[serieField] || (esBoleta ? 'B001' : 'F001');
    const { data: correlativoData, error: correlativoError } = await this.supabase
      .getClient()
      .rpc('obtener_siguiente_numero_documento', {
        p_tenant_id: tenantId,
        p_tipo_documento: tipoDocumento,
        p_serie: serie,
      });

    if (correlativoError) {
      throw new BadRequestException(
        `No se pudo obtener el correlativo de ${esBoleta ? 'boleta' : 'factura'}: ${correlativoError.message}`,
      );
    }

    const numero = Number(Array.isArray(correlativoData) ? correlativoData[0] : correlativoData);
    if (!Number.isFinite(numero) || numero <= 0) {
      throw new BadRequestException(
        `Correlativo fiscal inválido para ${tipoDocumento}-${serie}: ${JSON.stringify(correlativoData)}`,
      );
    }

    return { serie, numero: Math.trunc(numero) };
  }

  private async registrarExitoIntegracion(options: {
    pedidoId: string;
    tenantId: string;
    facturaId: string | null;
    durationMs: number;
    responseSummary?: Record<string, unknown>;
  }): Promise<void> {
    const { pedidoId, tenantId, facturaId, durationMs, responseSummary } = options;

    await this.integrationAlerts.recordSuccess({
      tenantId,
      servicio: 'CPE',
      operacion: 'GENERAR_FACTURA',
      correlacionId: pedidoId,
      correlacionTipo: 'PEDIDO',
      statusCode: 200,
      durationMs,
      responseSummary: responseSummary ?? null,
      metadata: facturaId ? { factura_id: facturaId } : null,
    });
  }

  /**
   * Registra errores de integración para auditoría y reintentos
   * Requirements: 19.10
   */
  private async registrarErrorIntegracion(options: {
    pedidoId: string;
    tenantId: string;
    errorMessage: string;
    durationMs: number;
  }): Promise<void> {
    const { pedidoId, tenantId, errorMessage, durationMs } = options;

    await this.integrationAlerts.recordError({
      tenantId,
      servicio: 'CPE',
      operacion: 'GENERAR_FACTURA',
      correlacionId: pedidoId,
      correlacionTipo: 'PEDIDO',
      errorMessage,
      durationMs,
      metadata: {
        source: 'CPEIntegrationService',
      },
    });
  }
}
