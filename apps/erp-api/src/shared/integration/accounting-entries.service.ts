import { Injectable, Logger } from '@nestjs/common';
import { Buffer } from 'buffer';
import Decimal from 'decimal.js';
import { SupabaseService } from '../supabase/supabase.service';
import {
  EventBusService,
  ERPEvent,
  VentaProcessedEvent,
  MovimientoStockEvent,
  CompraEntregadaEvent,
  PagoFacturaEvent,
  GastoRegistradoEvent,
} from '../events/event-bus.service';
import { AsientoContable } from './accounting.interfaces';
import { PeriodosService } from '../../modules/contabilidad/services/periodos.service';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class AccountingEntriesService {
  // HARDENING: usamos Logger para centralizar trazas y Map por tenant para evitar fugas.
  private readonly logger = new Logger(AccountingEntriesService.name);
  private cuentasCache: Map<string, string> = new Map();
  private cuentasLoaded: Set<string> = new Set(); // tenants con cache inicializado
  private readonly cuentaFallbacks: Record<string, string[]> = {
    '101': ['10'],
    '104': ['10'],
    '121': ['12', '10'],
    '201': ['20'],
    '401': ['40'],
    '421': ['42'],
    '601': ['6011-DEMO'],
    '691': ['69'],
    '701': ['7011-DEMO', '70'],
    '791': ['79'],
  };

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly periodosService: PeriodosService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // 🔓 Inicializa cache por tenant solo si no está cargado
  private async initializeCuentasCache(tenantId: string): Promise<void> {
    if (!tenantId || this.cuentasLoaded.has(tenantId)) {
      return;
    }

    try {
      const { data: cuentas, error } = await this.supabase
        .getClient()
        .from('plan_cuentas')
        .select('id, codigo, nombre')
        .eq('acepta_movimiento', true)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      cuentas?.forEach((cuenta: any) => {
        const cacheKey = `${tenantId}:${cuenta.codigo}`;
        this.cuentasCache.set(cacheKey, cuenta.id);
      });

      this.logger.log(
        `✅ [AccountingEntries] Cache de cuentas inicializado para tenant ${tenantId}: ${cuentas?.length ?? 0} cuentas`,
      );
      this.cuentasLoaded.add(tenantId);
    } catch (error) {
      this.logger.error('❌ [AccountingEntries] Error inicializando cache de cuentas:', error);
    }
  }

  private async getCuentaId(codigo: string): Promise<string> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: prevenir lecturas de cuentas sin tenant contextual.
      throw new Error('Tenant requerido para resolver cuentas contables');
    }

    // Asegurar cache cargado para el tenant actual
    await this.initializeCuentasCache(tenantId);

    const codesToTry = [codigo, ...(this.cuentaFallbacks[codigo] ?? [])];
    let lastError: Error | null = null;

    for (const currentCode of codesToTry) {
      const cacheKey = `${tenantId}:${currentCode}`;
      if (this.cuentasCache.has(cacheKey)) {
        const cuentaId = this.cuentasCache.get(cacheKey)!;
        if (currentCode !== codigo) {
          this.cuentasCache.set(`${tenantId}:${codigo}`, cuentaId);
        }
        return cuentaId;
      }

      const { data: cuenta, error } = await this.supabase
        .getClient()
        .from('plan_cuentas')
        .select('id, acepta_movimiento')
        .eq('codigo', currentCode)
        .eq('acepta_movimiento', true)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error && error.code && error.code !== 'PGRST116') {
        lastError = new Error(`Cuenta ${currentCode} no disponible: ${error.message}`);
        continue;
      }

      if (cuenta?.id) {
        const cacheKeyCurrent = `${tenantId}:${currentCode}`;
        this.cuentasCache.set(cacheKeyCurrent, cuenta.id);
        if (currentCode !== codigo) {
          this.logger.warn(
            `⚠️ [AccountingEntries] Cuenta ${codigo} no existe para el tenant ${tenantId}; usando ${currentCode} como fallback.`,
          );
          this.cuentasCache.set(`${tenantId}:${codigo}`, cuenta.id);
        }
        return cuenta.id;
      }
    }

    throw lastError ?? new Error(`Cuenta ${codigo} no encontrada o no acepta movimientos`);
  }

  private async runInTenantContext<T>(tenantId: string | null | undefined, callback: () => Promise<T>): Promise<T | null> {
    if (!tenantId) {
      this.logger.warn('⚠️ [AccountingEntries] Evento recibido sin tenantId. Se omite procesamiento.');
      return null;
    }

    return await this.tenantContext.run(
      {
        tenantId,
        userId: null,
        supabaseAccessToken: null,
        isSuperAdmin: false,
      },
      async () => {
        await this.supabase.prepareTenantContext();
        return callback();
      },
    );
  }

  async procesarAsientoVenta(venta: VentaProcessedEvent): Promise<string | null> {
    try {
      const costoVentas = await this.calcularCostoVentas(venta.items);

      const cuentaCobro = this.resolveCuentaCobro(venta.metodoPago);

      const asiento: AsientoContable = this.normalizeAsiento({
        fecha: new Date().toISOString().split('T')[0],
        concepto: `Venta Ticket ${venta.numeroTicket}`,
        referencia: venta.ventaId,
        sourceEventId: venta.eventId,
        detalles: [
          {
            cuentaId: await this.getCuentaId(cuentaCobro.codigo),
            cuentaCodigo: cuentaCobro.codigo,
            cuentaNombre: cuentaCobro.nombre,
            debe: venta.total,
            haber: 0,
            descripcion: `Cobro venta ${venta.numeroTicket}`,
          },
          {
            cuentaId: await this.getCuentaId('701'),
            cuentaCodigo: '701',
            cuentaNombre: 'Mercaderías',
            debe: 0,
            haber: venta.subtotal,
            descripcion: `Venta mercaderías ${venta.numeroTicket}`,
          },
          {
            cuentaId: await this.getCuentaId('401'),
            cuentaCodigo: '401',
            cuentaNombre: 'Impuesto General a las Ventas',
            debe: 0,
            haber: venta.impuestos,
            descripcion: `IGV venta ${venta.numeroTicket}`,
          },
          {
            cuentaId: await this.getCuentaId('201'),
            cuentaCodigo: '201',
            cuentaNombre: 'Mercaderías',
            debe: 0,
            haber: costoVentas,
            descripcion: `Salida inventario ${venta.numeroTicket}`,
          },
          {
            cuentaId: await this.getCuentaId('691'),
            cuentaCodigo: '691',
            cuentaNombre: 'Costo de Ventas',
            debe: costoVentas,
            haber: 0,
            descripcion: `Costo de ventas ${venta.numeroTicket}`,
          },
        ],
      });

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de venta:', error);
      return null;
    }
  }

  async procesarAsientoCompra(compra: CompraEntregadaEvent): Promise<string | null> {
    try {
      // Separar base gravada e IGV crédito fiscal (cuenta 401) — Decimal.js para precision
      const totalDec = new Decimal(compra.total);
      const baseGravada = compra.subtotal || totalDec.div(1.18).toDecimalPlaces(2).toNumber();
      const igvCredito = compra.igv || new Decimal(compra.total).minus(baseGravada).toDecimalPlaces(2).toNumber();

      const asiento: AsientoContable = this.normalizeAsiento({
        fecha: new Date().toISOString().split('T')[0],
        concepto: `Compra Orden ${compra.numeroOrden}`,
        referencia: compra.ordenId,
        sourceEventId: compra.eventId,
        detalles: [
          {
            cuentaId: await this.getCuentaId('601'),
            cuentaCodigo: '601',
            cuentaNombre: 'Compra de Mercaderías',
            debe: Number(baseGravada.toFixed(2)),
            haber: 0,
            descripcion: `Compra mercaderías ${compra.numeroOrden}`,
          },
          {
            cuentaId: await this.getCuentaId('401'),
            cuentaCodigo: '401',
            cuentaNombre: 'IGV - Crédito Fiscal',
            debe: Number(igvCredito.toFixed(2)),
            haber: 0,
            descripcion: `IGV crédito fiscal compra ${compra.numeroOrden}`,
          },
          {
            cuentaId: await this.getCuentaId('421'),
            cuentaCodigo: '421',
            cuentaNombre: 'Facturas por Pagar',
            debe: 0,
            haber: compra.total,
            descripcion: `Factura por pagar ${compra.numeroOrden}`,
          },
        ],
      });

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      this.logger.error('❌ Error procesando asiento de compra', error as Error);
      return null;
    }
  }

  async procesarAsientoMovimientoStock(movimiento: MovimientoStockEvent): Promise<string | null> {
    try {
      let asiento: AsientoContable;

      switch (movimiento.tipoMovimiento) {
        case 'ENTRADA':
          asiento = this.normalizeAsiento({
            fecha: new Date().toISOString().split('T')[0],
            concepto: `Entrada de stock - ${movimiento.motivo}`,
            referencia: movimiento.productoId,
            sourceEventId: (movimiento as any).eventId ?? undefined,
            detalles: [
              {
                cuentaId: await this.getCuentaId('201'),
                cuentaCodigo: '201',
                cuentaNombre: 'Mercaderías',
                debe: movimiento.valor,
                haber: 0,
                descripcion: `Entrada stock ${movimiento.productoId}`,
              },
              {
                cuentaId: await this.getCuentaId('791'),
                cuentaCodigo: '791',
                cuentaNombre: 'Cargas Imputables a Cuenta de Costos',
                debe: 0,
                haber: movimiento.valor,
                descripcion: `Contrapartida entrada stock ${movimiento.productoId}`,
              },
            ],
          });
          break;

        case 'SALIDA':
          asiento = this.normalizeAsiento({
            fecha: new Date().toISOString().split('T')[0],
            concepto: `Salida de stock - ${movimiento.motivo}`,
            referencia: movimiento.productoId,
            sourceEventId: (movimiento as any).eventId ?? undefined,
            detalles: [
              {
                cuentaId: await this.getCuentaId('691'),
                cuentaCodigo: '691',
                cuentaNombre: 'Costo de Ventas',
                debe: movimiento.valor,
                haber: 0,
                descripcion: `Costo salida stock ${movimiento.productoId}`,
              },
              {
                cuentaId: await this.getCuentaId('201'),
                cuentaCodigo: '201',
                cuentaNombre: 'Mercaderías',
                debe: 0,
                haber: movimiento.valor,
                descripcion: `Salida stock ${movimiento.productoId}`,
              },
            ],
          });
          break;

        case 'AJUSTE': {
          const valorAjuste = movimiento.valor;
          const esAjustePositivo = movimiento.cantidad > 0;

          asiento = this.normalizeAsiento({
            fecha: new Date().toISOString().split('T')[0],
            concepto: `Ajuste de inventario - ${movimiento.motivo}`,
            referencia: movimiento.productoId,
            sourceEventId: (movimiento as any).eventId ?? undefined,
            detalles: [
              {
                cuentaId: await this.getCuentaId('201'),
                cuentaCodigo: '201',
                cuentaNombre: 'Mercaderías',
                debe: esAjustePositivo ? Math.abs(valorAjuste) : 0,
                haber: esAjustePositivo ? 0 : Math.abs(valorAjuste),
                descripcion: `Ajuste inventario ${movimiento.productoId}`,
              },
              {
                cuentaId: await this.getCuentaId('659'),
                cuentaCodigo: '659',
                cuentaNombre: 'Otras Cargas de Gestión',
                debe: esAjustePositivo ? 0 : Math.abs(valorAjuste),
                haber: esAjustePositivo ? Math.abs(valorAjuste) : 0,
                descripcion: `Contrapartida ajuste ${movimiento.productoId}`,
              },
            ],
          });
          break;
        }

        default:
          console.warn(`⚠️ Tipo de movimiento no reconocido: ${movimiento.tipoMovimiento}`);
          return null;
      }

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de movimiento stock:', error);
      return null;
    }
  }

  async procesarAsientoPagoFactura(pago: PagoFacturaEvent): Promise<string | null> {
    try {
      const cuentaEfectivo = pago.metodoPago === 'efectivo' ? '101' : '104';
      const nombreCuentaEfectivo = pago.metodoPago === 'efectivo' ? 'Caja' : 'Cuentas Corrientes';

      const asiento: AsientoContable = this.normalizeAsiento({
        fecha: new Date().toISOString().split('T')[0],
        concepto: `Pago de factura ${pago.numeroFactura}`,
        referencia: pago.facturaId,
        sourceEventId: pago.eventId,
        detalles: [
          {
            cuentaId: await this.getCuentaId('421'),
            cuentaCodigo: '421',
            cuentaNombre: 'Facturas por Pagar',
            debe: pago.montoPagado,
            haber: 0,
            descripcion: `Cancelación factura ${pago.numeroFactura}`,
          },
          {
            cuentaId: await this.getCuentaId(cuentaEfectivo),
            cuentaCodigo: cuentaEfectivo,
            cuentaNombre: nombreCuentaEfectivo,
            debe: 0,
            haber: pago.montoPagado,
            descripcion: `Pago ${pago.metodoPago} factura ${pago.numeroFactura}`,
          },
        ],
      });

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de pago factura:', error);
      return null;
    }
  }

  async procesarAsientoGasto(gasto: GastoRegistradoEvent): Promise<string | null> {
    try {
      // Cuenta de gasto por categoría
      let cuentaGasto = '631';
      let nombreCuentaGasto = 'Gastos de Administración';

      switch (gasto.categoria?.toLowerCase()) {
        case 'produccion':
        case 'manufactura':
          cuentaGasto = '621';
          nombreCuentaGasto = 'Gastos de Producción';
          break;
        case 'ventas':
        case 'comercial':
          cuentaGasto = '641';
          nombreCuentaGasto = 'Gastos de Ventas';
          break;
        case 'financiero':
        case 'interes':
          cuentaGasto = '671';
          nombreCuentaGasto = 'Gastos Financieros';
          break;
      }

      // Contrapartida por método de pago
      let cuentaContra = '421';
      let nombreContra = 'Facturas por Pagar';
      switch (gasto.metodoPago?.toLowerCase?.()) {
        case 'efectivo':
        case 'caja':
          cuentaContra = '101';
          nombreContra = 'Caja';
          break;
        case 'banco':
        case 'transferencia':
        case 'cheque':
          cuentaContra = '104';
          nombreContra = 'Cuentas Corrientes';
          break;
      }

      // ✅ Solo usamos campos que existen: monto, categoria, descripcion, gastoId
      const monto = Number(gasto.monto ?? 0);
      const conceptoTxt = `Gasto ${gasto.categoria ?? ''}${gasto.descripcion ? ' — ' + gasto.descripcion : ''}`.trim();

      const asiento: AsientoContable = this.normalizeAsiento({
        fecha: new Date().toISOString().split('T')[0],
        concepto: conceptoTxt,
        referencia: (gasto.gastoId as any) ?? null,
        sourceEventId: (gasto as any)?.eventId ?? undefined,
        detalles: [
          {
            cuentaId: await this.getCuentaId(cuentaGasto),
            cuentaCodigo: cuentaGasto,
            cuentaNombre: nombreCuentaGasto,
            debe: monto,
            haber: 0,
            descripcion: gasto.descripcion ?? 'Registro de gasto',
          },
          {
            cuentaId: await this.getCuentaId(cuentaContra),
            cuentaCodigo: cuentaContra,
            cuentaNombre: nombreContra,
            debe: 0,
            haber: monto,
            descripcion: 'Contrapartida del gasto',
          },
        ],
      });

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de gasto:', error);
      return null;
    }
  }

  private resolveCuentaCobro(metodoPago?: string): { codigo: string; nombre: string } {
    const normalized = metodoPago?.toLowerCase?.() ?? 'efectivo';

    if (normalized === 'efectivo' || normalized === 'cash') {
      return { codigo: '101', nombre: 'Caja' };
    }

    if (normalized === 'credito' || normalized === 'crédito' || normalized === 'credit') {
      return { codigo: '121', nombre: 'Cuentas por Cobrar Comerciales' };
    }

    return { codigo: '104', nombre: 'Cuentas Corrientes' };
  }

  private async calcularCostoVentas(items: any[]): Promise<number> {
    let costoTotal = 0;

    for (const item of items) {
      try {
        const { data: producto, error } = await this.supabase
          .getClient()
          .from('productos')
          .select('precio_compra')
          .eq('id', item.productoId)
          .single();

        if (!error && producto && producto.precio_compra) {
          costoTotal += producto.precio_compra * item.cantidad;
        } else {
          const estimado = item.precio * 0.7 * item.cantidad;
          costoTotal += estimado;
          this.logger.warn(
            `COGS_ESTIMATED producto=${item.productoId} usando 70% precio venta (${estimado.toFixed(2)}). ` +
            `Actualice precio_compra del producto para cálculo real.`,
          );
        }
      } catch {
        const estimado = item.precio * 0.7 * item.cantidad;
        costoTotal += estimado;
        this.logger.warn(
          `COGS_ESTIMATED producto=${item.productoId} usando 70% precio venta (${estimado.toFixed(2)}) por error de consulta.`,
        );
      }
    }

    return costoTotal;
  }

  private async guardarAsientoContable(asiento: AsientoContable): Promise<string> {
    // ✅ VALIDAR PERÍODO CONTABLE ABIERTO
    const fechaAsiento = new Date(asiento.fecha);
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: bloqueamos creación de asientos si el tenant no está en el contexto.
      this.logger.error('❌ [AccountingEntries] Intento de crear asiento sin tenant.');
      throw new Error('Tenant requerido para registrar asientos contables');
    }

    try {
      await this.periodosService.validarPeriodoAbierto(tenantId, fechaAsiento);
    } catch (error) {
      this.logger.error('❌ [AccountingEntries] Error validando período:', error);
      throw error;
    }

    const client = this.supabase.getClient();

    if (asiento.sourceEventId) {
      const { data: asientosExistentes, error: errorExistente } = await client
        .from('asientos_contables')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('source_event_id', asiento.sourceEventId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (errorExistente) {
        throw errorExistente;
      }

      const asientoExistente = Array.isArray(asientosExistentes) ? asientosExistentes[0] : asientosExistentes;
      if (asientoExistente?.id) {
        this.logger.warn(
          `⚠️ [AccountingEntries] Asiento ya registrado para evento ${asiento.sourceEventId} (tenant ${tenantId}).`,
        );
        return asientoExistente.id;
      }
    }

    const totalDebe = asiento.detalles.reduce((s, d) => s + d.debe, 0);
    const totalHaber = asiento.detalles.reduce((s, d) => s + d.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new Error(`Asiento desbalanceado: Debe=${totalDebe}, Haber=${totalHaber}`);
    }

    let numeroAsiento: string | number | null = null;
    let asientoCreado: { id: string } | null = null;

    const conceptoClampSequence = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
    let ultimoConceptoFinal: string | null = asiento.concepto;
    let ultimaReferenciaFinal: string | null = asiento.referencia ?? null;

    for (let intento = 0; intento < conceptoClampSequence.length; intento++) {
      const { data: ultimoAsiento } = await client
        .from('asientos_contables')
        .select('numero_asiento')
        .eq('tenant_id', tenantId)
        .order('numero_asiento', { ascending: false })
        .limit(1)
        .maybeSingle();

      numeroAsiento = (ultimoAsiento?.numero_asiento || 0) + 1;

      const clampLength = conceptoClampSequence[intento];
      const conceptoFinal = this.clampText(asiento.concepto, clampLength);
      const referenciaFinal = asiento.referencia ? this.clampText(asiento.referencia, clampLength) : null;
      ultimoConceptoFinal = conceptoFinal;
      ultimaReferenciaFinal = referenciaFinal;
      const { data, error } = await client
        .from('asientos_contables')
        .insert({
          tenant_id: tenantId, // HARDENING: cada asiento queda ligado al tenant autenticado.
          numero_asiento: numeroAsiento,
          fecha: asiento.fecha,
          concepto: conceptoFinal,
          referencia: referenciaFinal,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'CONFIRMADO',
          source_event_id: asiento.sourceEventId ?? null,
        })
        .select('id')
        .single();

      if (!error && data) {
        asientoCreado = data as { id: string };
        break;
      }

      if (error?.code === '23505') {
        this.logger.warn(
          `⚠️ [AccountingEntries] Número de asiento duplicado (${numeroAsiento}) para tenant ${tenantId}. Reintentando...`,
        );
        continue;
      }
      if (error?.code === '22001') {
        const conceptoStats = this.getTextMetrics(conceptoFinal);
        const referenciaStats = this.getTextMetrics(referenciaFinal);
        if (intento < conceptoClampSequence.length - 1) {
          this.logger.warn(
            `⚠️ [AccountingEntries] Texto excede límite permitido. Intento ${
              intento + 1
            }, clamp=${clampLength}, concepto=${conceptoStats.bytes}b/${conceptoStats.chars}c, referencia=${referenciaStats.bytes}b/${referenciaStats.chars}c (tenant ${tenantId}).`,
          );
          continue;
        }
        this.logger.error(
          `❌ [AccountingEntries] No se pudo truncar concepto/referencia por debajo del límite tras ${conceptoClampSequence.length} intentos (tenant ${tenantId}, clamp=${clampLength}, concepto=${conceptoStats.bytes}b/${conceptoStats.chars}c, referencia=${referenciaStats.bytes}b/${referenciaStats.chars}c).`,
          error,
        );
        throw error;
      }

      if (error) throw error;
    }

    if (!asientoCreado || numeroAsiento === null) {
      // Fallback absoluto: usar un identificador monotónico único (timestamp + random) para eliminar colisiones extremas
      const fallbackNumero = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, '0')}`;
      this.logger.warn(
        `⚠️ [AccountingEntries] Usando fallback para numero_asiento único ${fallbackNumero} (tenant ${tenantId})`,
      );

      const { data: dataFallback, error: errorFallback } = await client
        .from('asientos_contables')
        .insert({
          tenant_id: tenantId,
          numero_asiento: fallbackNumero,
          fecha: asiento.fecha,
          concepto: ultimoConceptoFinal ? ultimoConceptoFinal : asiento.concepto,
          referencia: ultimaReferenciaFinal,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'CONFIRMADO',
          source_event_id: asiento.sourceEventId ?? null,
        })
        .select('id')
        .single();

      if (!errorFallback && dataFallback) {
        asientoCreado = dataFallback as { id: string };
        numeroAsiento = fallbackNumero as any;
      } else {
        throw new Error('No se pudo generar un número de asiento único después de varios intentos');
      }
    }

    const asientoId = asientoCreado.id;
    let detallesInsertados = false;
    const detalleClampSequence = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
    for (let intentoDetalle = 0; intentoDetalle < detalleClampSequence.length && !detallesInsertados; intentoDetalle++) {
      const detalleClamp = detalleClampSequence[intentoDetalle];
      const detallesParaInsertar = asiento.detalles.map((d) => ({
        asiento_id: asientoId,
        cuenta_id: d.cuentaId,
        debe: d.debe,
        haber: d.haber,
        concepto: this.clampText(d.descripcion, detalleClamp),
      }));

      const { error: errorDetalles } = await client
        .from('detalle_asientos')
        .insert(detallesParaInsertar);

      if (!errorDetalles) {
        detallesInsertados = true;
        break;
      }

      if (errorDetalles?.code === '22001' && intentoDetalle < detalleClampSequence.length - 1) {
        const detalleMetrics = detallesParaInsertar
          .map((detalle, index) => {
            const stats = this.getTextMetrics(detalle.concepto);
            return `#${index + 1}:${stats.bytes}b/${stats.chars}c`;
          })
          .join(', ');
        this.logger.warn(
          `⚠️ [AccountingEntries] Conceptos de detalle exceden límite. Reintentando con truncado adicional (tenant ${tenantId}, intento ${intentoDetalle + 1}, clamp=${detalleClamp}, metrics=${detalleMetrics}).`,
        );
        continue;
      }

      if (errorDetalles?.code === '22001' && intentoDetalle === detalleClampSequence.length - 1) {
        const detalleMetrics = detallesParaInsertar
          .map((detalle, index) => {
            const stats = this.getTextMetrics(detalle.concepto);
            return `#${index + 1}:${stats.bytes}b/${stats.chars}c`;
          })
          .join(', ');
        this.logger.error(
          `❌ [AccountingEntries] Conceptos de detalle siguen excediendo el límite después de varios intentos (tenant ${tenantId}, clamp=${detalleClamp}, metrics=${detalleMetrics}).`,
          errorDetalles,
        );
      }

      throw errorDetalles;
    }

    this.logger.log(`✅ [AccountingEntries] Asiento ${numeroAsiento} creado para tenant ${tenantId} (ID: ${asientoCreado.id})`);
    return asientoCreado.id;
  }

  // Métodos utilitarios públicos
  async getPlanCuentas() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: evitamos exponer plan contable sin tenant.
      throw new Error('Tenant requerido para consultar plan de cuentas');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('plan_cuentas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('codigo');
    if (error) throw error;
    return data;
  }

  async getAsientosContables(filtros: any = {}) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // HARDENING: consultas contables requieren tenant explícito.
      throw new Error('Tenant requerido para listar asientos contables');
    }

    const { fechaDesde, fechaHasta, estado } = filtros;

    let query = this.supabase
      .getClient()
      .from('asientos_contables')
      .select(
        `
        *,
        detalle_asientos(
          *,
          plan_cuentas(
            codigo,
            nombre
          )
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .order('fecha', { ascending: false })
      .order('numero_asiento', { ascending: false });

    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  private clampText(value: string | null | undefined, maxLength: number): string {
    if (!value) {
      return '';
    }

    // Normalizar espacios y eliminar saltos de línea que puedan generar bytes extra
    let normalized = value.toString().replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }

    // Si ya está dentro del límite de bytes UTF-8, retornamos
    if (Buffer.byteLength(normalized, 'utf8') <= maxLength) {
      return normalized;
    }

    // Reducir carácter por carácter hasta que el tamaño en bytes sea <= maxLength
    let end = normalized.length;
    while (end > 0 && Buffer.byteLength(normalized.slice(0, end), 'utf8') > maxLength) {
      end--;
    }

    return normalized.slice(0, end);
  }

  private getTextMetrics(value: string | null | undefined): { chars: number; bytes: number } {
    const normalized = value ?? '';
    return {
      chars: normalized.length,
      bytes: Buffer.byteLength(normalized, 'utf8'),
    };
  }

  private normalizeAsiento(asiento: AsientoContable): AsientoContable {
    const concepto = this.formatShortText(asiento.concepto, 48) || 'MOVIMIENTO';
    const referenciaRaw = this.formatShortText(asiento.referencia ?? '', 40);
    const referencia = referenciaRaw ? referenciaRaw : null;

    const detalles = asiento.detalles.map((detalle, index) => ({
      ...detalle,
      descripcion:
        this.formatShortText(detalle.descripcion ?? `Detalle ${index + 1}`, 48) ||
        `Detalle ${index + 1}`,
    }));

    return {
      ...asiento,
      concepto,
      referencia,
      detalles,
    };
  }

  private formatShortText(value: string | null | undefined, maxChars: number): string {
    if (!value) {
      return '';
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }

    if (maxChars <= 3) {
      return normalized.slice(0, maxChars);
    }

    return `${normalized.slice(0, maxChars - 3)}...`;
  }
}
