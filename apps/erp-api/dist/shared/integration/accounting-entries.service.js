"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingEntriesService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
const event_bus_service_1 = require("../events/event-bus.service");
let AccountingEntriesService = class AccountingEntriesService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.cuentasCache = new Map();
        this.initializeCuentasCache();
        this.initializeEventListeners();
    }
    async initializeCuentasCache() {
        try {
            const { data: cuentas, error } = await this.supabase
                .getClient()
                .from('plan_cuentas')
                .select('id, codigo, nombre')
                .eq('acepta_movimiento', true);
            if (error)
                throw error;
            cuentas?.forEach((cuenta) => {
                this.cuentasCache.set(cuenta.codigo, cuenta.id);
            });
            console.log(`✅ Cache de cuentas inicializado: ${this.cuentasCache.size} cuentas`);
        }
        catch (error) {
            console.error('❌ Error inicializando cache de cuentas:', error);
        }
    }
    async getCuentaId(codigo) {
        if (this.cuentasCache.has(codigo)) {
            return this.cuentasCache.get(codigo);
        }
        const { data: cuenta, error } = await this.supabase
            .getClient()
            .from('plan_cuentas')
            .select('id')
            .eq('codigo', codigo)
            .eq('acepta_movimiento', true)
            .single();
        if (error || !cuenta) {
            throw new Error(`Cuenta ${codigo} no encontrada o no acepta movimientos`);
        }
        this.cuentasCache.set(codigo, cuenta.id);
        return cuenta.id;
    }
    initializeEventListeners() {
        console.log('🎧 [AccountingEntriesService] Registrando listeners de eventos...');
        this.eventBus.onVentaProcessed(async (event) => {
            const data = event.data;
            console.log(`📊 [Contabilidad] Procesando asiento de venta: ${data.ventaId}`);
            const asientoId = await this.procesarAsientoVenta(data);
            if (asientoId)
                console.log(`✅ [Contabilidad] Asiento de venta creado: ${asientoId}`);
        });
        this.eventBus.onCompraEntregada(async (event) => {
            const data = event.data;
            console.log(`📊 [Contabilidad] Procesando asiento de compra: ${data.ordenId}`);
            const asientoId = await this.procesarAsientoCompra(data);
            if (asientoId)
                console.log(`✅ [Contabilidad] Asiento de compra creado: ${asientoId}`);
        });
        this.eventBus.onMovimientoStock(async (event) => {
            const data = event.data;
            console.log(`📊 [Contabilidad] Procesando asiento de movimiento stock: ${data.productoId}`);
            const asientoId = await this.procesarAsientoMovimientoStock(data);
            if (asientoId)
                console.log(`✅ [Contabilidad] Asiento de movimiento stock creado: ${asientoId}`);
        });
        this.eventBus.onGastoRegistrado(async (event) => {
            const data = event.data;
            console.log(`📊 [Contabilidad] Procesando asiento de gasto: ${data.gastoId}`);
            const asientoId = await this.procesarAsientoGasto(data);
            if (asientoId)
                console.log(`✅ [Contabilidad] Asiento de gasto creado: ${asientoId}`);
        });
        this.eventBus.onPagoFactura(async (event) => {
            const data = event.data;
            console.log(`📊 [Contabilidad] Procesando asiento de pago factura: ${data.facturaId}`);
            const asientoId = await this.procesarAsientoPagoFactura(data);
            if (asientoId)
                console.log(`✅ [Contabilidad] Asiento de pago factura creado: ${asientoId}`);
        });
    }
    async procesarAsientoVenta(venta) {
        try {
            const costoVentas = await this.calcularCostoVentas(venta.items);
            const asiento = {
                fecha: new Date().toISOString().split('T')[0],
                concepto: `Venta Ticket ${venta.numeroTicket}`,
                referencia: venta.ventaId,
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
        }
        catch (error) {
            console.error('❌ Error procesando asiento de venta:', error);
            return null;
        }
    }
    async procesarAsientoCompra(compra) {
        try {
            const asiento = {
                fecha: new Date().toISOString().split('T')[0],
                concepto: `Compra Orden ${compra.numeroOrden}`,
                referencia: compra.ordenId,
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
        }
        catch (error) {
            console.error('❌ Error procesando asiento de compra:', error);
            return null;
        }
    }
    async procesarAsientoMovimientoStock(movimiento) {
        try {
            let asiento;
            switch (movimiento.tipoMovimiento) {
                case 'ENTRADA':
                    asiento = {
                        fecha: new Date().toISOString().split('T')[0],
                        concepto: `Entrada de stock - ${movimiento.motivo}`,
                        referencia: movimiento.productoId,
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
        }
        catch (error) {
            console.error('❌ Error procesando asiento de movimiento stock:', error);
            return null;
        }
    }
    async procesarAsientoPagoFactura(pago) {
        try {
            const cuentaEfectivo = pago.metodoPago === 'efectivo' ? '101' : '104';
            const nombreCuentaEfectivo = pago.metodoPago === 'efectivo' ? 'Caja' : 'Cuentas Corrientes';
            const asiento = {
                fecha: new Date().toISOString().split('T')[0],
                concepto: `Pago de factura ${pago.numeroFactura}`,
                referencia: pago.facturaId,
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
        }
        catch (error) {
            console.error('❌ Error procesando asiento de pago factura:', error);
            return null;
        }
    }
    async procesarAsientoGasto(gasto) {
        try {
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
            const monto = Number(gasto.monto ?? 0);
            const conceptoTxt = `Gasto ${gasto.categoria ?? ''}${gasto.descripcion ? ' — ' + gasto.descripcion : ''}`.trim();
            const asiento = {
                fecha: new Date().toISOString().split('T')[0],
                concepto: conceptoTxt,
                referencia: gasto.gastoId ?? null,
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
        }
        catch (error) {
            console.error('❌ Error procesando asiento de gasto:', error);
            return null;
        }
    }
    async calcularCostoVentas(items) {
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
                }
                else {
                    costoTotal += item.precio * 0.7 * item.cantidad;
                }
            }
            catch {
                costoTotal += item.precio * 0.7 * item.cantidad;
            }
        }
        return costoTotal;
    }
    async guardarAsientoContable(asiento) {
        const { data: ultimoAsiento } = await this.supabase
            .getClient()
            .from('asientos_contables')
            .select('numero_asiento')
            .order('numero_asiento', { ascending: false })
            .limit(1)
            .single();
        const numeroAsiento = (ultimoAsiento?.numero_asiento || 0) + 1;
        const totalDebe = asiento.detalles.reduce((s, d) => s + d.debe, 0);
        const totalHaber = asiento.detalles.reduce((s, d) => s + d.haber, 0);
        if (Math.abs(totalDebe - totalHaber) > 0.01) {
            throw new Error(`Asiento desbalanceado: Debe=${totalDebe}, Haber=${totalHaber}`);
        }
        const { data: asientoCreado, error: errorAsiento } = await this.supabase
            .getClient()
            .from('asientos_contables')
            .insert({
            numero_asiento: numeroAsiento,
            fecha: asiento.fecha,
            concepto: asiento.concepto,
            referencia: asiento.referencia,
            total_debe: totalDebe,
            total_haber: totalHaber,
            estado: 'CONFIRMADO',
        })
            .select('id')
            .single();
        if (errorAsiento)
            throw errorAsiento;
        const detallesParaInsertar = asiento.detalles.map((d) => ({
            asiento_id: asientoCreado.id,
            cuenta_id: d.cuentaId,
            debe: d.debe,
            haber: d.haber,
            concepto: d.descripcion,
        }));
        const { error: errorDetalles } = await this.supabase
            .getClient()
            .from('detalle_asientos')
            .insert(detallesParaInsertar);
        if (errorDetalles)
            throw errorDetalles;
        console.log(`✅ Asiento contable creado: ${numeroAsiento} (ID: ${asientoCreado.id})`);
        return asientoCreado.id;
    }
    async getPlanCuentas() {
        const { data, error } = await this.supabase
            .getClient()
            .from('plan_cuentas')
            .select('*')
            .order('codigo');
        if (error)
            throw error;
        return data;
    }
    async getAsientosContables(filtros = {}) {
        const { fechaDesde, fechaHasta, estado } = filtros;
        let query = this.supabase
            .getClient()
            .from('asientos_contables')
            .select(`
        *,
        detalle_asientos(
          *,
          plan_cuentas(
            codigo,
            nombre
          )
        )
      `)
            .order('fecha', { ascending: false })
            .order('numero_asiento', { ascending: false });
        if (fechaDesde)
            query = query.gte('fecha', fechaDesde);
        if (fechaHasta)
            query = query.lte('fecha', fechaHasta);
        if (estado)
            query = query.eq('estado', estado);
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    }
};
exports.AccountingEntriesService = AccountingEntriesService;
exports.AccountingEntriesService = AccountingEntriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], AccountingEntriesService);
//# sourceMappingURL=accounting-entries.service.js.map