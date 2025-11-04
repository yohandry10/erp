import { Injectable, Logger } from '@nestjs/common';
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

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly periodosService: PeriodosService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.initializeCuentasCache();
    this.initializeEventListeners();
  }

  // 🔓 Hacerla pública para poder llamarla desde app.module.ts
  async initializeCuentasCache(): Promise<void> {
    try {
      const context = this.tenantContext.getContext();
      const tenantId = context?.tenantId ?? null;
      if (!tenantId) {
        // HARDENING: evitamos inicializar cache global sin tenant para no mezclar planes contables.
        this.logger.warn('⚠️ [AccountingEntries] Cache de cuentas no inicializado: tenant ausente.');
        return;
      }

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

    const cacheKey = `${tenantId}:${codigo}`;
    if (this.cuentasCache.has(cacheKey)) {
      return this.cuentasCache.get(cacheKey)!;
    }

    const { data: cuenta, error } = await this.supabase
      .getClient()
      .from('plan_cuentas')
      .select('id')
      .eq('codigo', codigo)
      .eq('acepta_movimiento', true)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !cuenta) {
      throw new Error(`Cuenta ${codigo} no encontrada o no acepta movimientos`);
    }

    this.cuentasCache.set(cacheKey, cuenta.id);
    return cuenta.id;
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

  private initializeEventListeners() {
    this.logger.log('🎧 [AccountingEntriesService] Registrando listeners de eventos...');

    this.eventBus.onVentaProcessed(async (event: ERPEvent) => {
      const data = event.data as VentaProcessedEvent;
      await this.runInTenantContext(data.tenantId, async () => {
        this.logger.log(`📊 [Contabilidad] Procesando asiento de venta: ${data.ventaId}`);
        const asientoId = await this.procesarAsientoVenta(data);
        if (asientoId) this.logger.log(`✅ [Contabilidad] Asiento de venta creado: ${asientoId}`);
      });
    });

    this.eventBus.onCompraEntregada(async (event: ERPEvent) => {
      const data = event.data as CompraEntregadaEvent;
      await this.runInTenantContext(data.tenantId, async () => {
        this.logger.log(`📊 [Contabilidad] Procesando asiento de compra: ${data.ordenId}`);
        const asientoId = await this.procesarAsientoCompra(data);
        if (asientoId) this.logger.log(`✅ [Contabilidad] Asiento de compra creado: ${asientoId}`);
      });
    });

    this.eventBus.onMovimientoStock(async (event: ERPEvent) => {
      const data = event.data as MovimientoStockEvent;
      await this.runInTenantContext((data as any)?.tenantId, async () => {
        this.logger.log(`📊 [Contabilidad] Procesando asiento de movimiento stock: ${data.productoId}`);
        const asientoId = await this.procesarAsientoMovimientoStock(data);
        if (asientoId) this.logger.log(`✅ [Contabilidad] Asiento de movimiento stock creado: ${asientoId}`);
      });
    });

    this.eventBus.onGastoRegistrado(async (event: ERPEvent) => {
      const data = event.data as GastoRegistradoEvent;
      await this.runInTenantContext((data as any)?.tenantId, async () => {
        this.logger.log(`📊 [Contabilidad] Procesando asiento de gasto: ${data.gastoId}`);
        const asientoId = await this.procesarAsientoGasto(data);
        if (asientoId) this.logger.log(`✅ [Contabilidad] Asiento de gasto creado: ${asientoId}`);
      });
    });

    this.eventBus.onPagoFactura(async (event: ERPEvent) => {
      const data = event.data as PagoFacturaEvent;
      await this.runInTenantContext(data.tenantId, async () => {
        this.logger.log(`📊 [Contabilidad] Procesando asiento de pago factura: ${data.facturaId}`);
        const asientoId = await this.procesarAsientoPagoFactura(data);
        if (asientoId) this.logger.log(`✅ [Contabilidad] Asiento de pago factura creado: ${asientoId}`);
      });
    });
  }

  async procesarAsientoVenta(venta: VentaProcessedEvent): Promise<string | null> {
    try {
      const costoVentas = await this.calcularCostoVentas(venta.items);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString().split('T')[0],
        concepto: `Venta Ticket ${venta.numeroTicket}`,
        referencia: venta.ventaId,
        sourceEventId: venta.eventId,
        detalles: [
          {
            cuentaId: await this.getCuentaId(venta.metodoPago === 'efectivo' ? '101' : '104'),
            cuentaCodigo: venta.metodoPago === 'efectivo' ? '101' : '104',
            cuentaNombre: venta.metodoPago === 'efectivo' ? 'Caja' : 'Cuentas Corrientes',
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
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de venta:', error);
      return null;
    }
  }

  async procesarAsientoCompra(compra: CompraEntregadaEvent): Promise<string | null> {
    try {
      const asiento: AsientoContable = {
        fecha: new Date().toISOString().split('T')[0],
        concepto: `Compra Orden ${compra.numeroOrden}`,
        referencia: compra.ordenId,
        sourceEventId: compra.eventId,
        detalles: [
          {
            cuentaId: await this.getCuentaId('201'),
            cuentaCodigo: '201',
            cuentaNombre: 'Mercaderías Manufacturadas',
            debe: compra.total,
            haber: 0,
            descripcion: `Compra mercaderías ${compra.numeroOrden}`,
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
      };

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
          asiento = {
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
          };
          break;

        case 'SALIDA':
          asiento = {
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
          };
          break;

        case 'AJUSTE': {
          const valorAjuste = movimiento.valor;
          const esAjustePositivo = movimiento.cantidad > 0;

          asiento = {
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
          };
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

      const asiento: AsientoContable = {
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
      };

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

      const asiento: AsientoContable = {
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
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error procesando asiento de gasto:', error);
      return null;
    }
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

        if (!error && producto) {
          costoTotal += (producto.precio_compra || 0) * item.cantidad;
        } else {
          costoTotal += item.precio * 0.7 * item.cantidad; // fallback 70%
        }
      } catch {
        costoTotal += item.precio * 0.7 * item.cantidad;
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
      const { data: asientoExistente, error: errorExistente } = await client
        .from('asientos_contables')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('source_event_id', asiento.sourceEventId)
        .maybeSingle();

      if (errorExistente) {
        throw errorExistente;
      }

      if (asientoExistente?.id) {
        this.logger.warn(
          `⚠️ [AccountingEntries] Asiento ya registrado para evento ${asiento.sourceEventId} (tenant ${tenantId}).`,
        );
        return asientoExistente.id;
      }
    }

    const { data: ultimoAsiento } = await client
      .from('asientos_contables')
      .select('numero_asiento')
      .eq('tenant_id', tenantId)
      .order('numero_asiento', { ascending: false })
      .limit(1)
      .maybeSingle();

    const numeroAsiento = (ultimoAsiento?.numero_asiento || 0) + 1;

    const totalDebe = asiento.detalles.reduce((s, d) => s + d.debe, 0);
    const totalHaber = asiento.detalles.reduce((s, d) => s + d.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new Error(`Asiento desbalanceado: Debe=${totalDebe}, Haber=${totalHaber}`);
    }

    const { data: asientoCreado, error: errorAsiento } = await client
      .from('asientos_contables')
      .insert({
        tenant_id: tenantId, // HARDENING: cada asiento queda ligado al tenant autenticado.
        numero_asiento: numeroAsiento,
        fecha: asiento.fecha,
        concepto: asiento.concepto,
        referencia: asiento.referencia,
        total_debe: totalDebe,
        total_haber: totalHaber,
        estado: 'CONFIRMADO',
        source_event_id: asiento.sourceEventId ?? null,
      })
      .select('id')
      .single();

    if (errorAsiento) throw errorAsiento;

    const detallesParaInsertar = asiento.detalles.map((d) => ({
      asiento_id: asientoCreado.id,
      cuenta_id: d.cuentaId,
      debe: d.debe,
      haber: d.haber,
      concepto: d.descripcion,
    }));

    const { error: errorDetalles } = await client
      .from('detalle_asientos')
      .insert(detallesParaInsertar);

    if (errorDetalles) throw errorDetalles;

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
}
