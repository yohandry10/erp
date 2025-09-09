"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountingIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
const event_bus_service_1 = require("../events/event-bus.service");
let AccountingIntegrationService = class AccountingIntegrationService {
    constructor(supabase, eventBus) {
        this.supabase = supabase;
        this.eventBus = eventBus;
        this.initializeEventListeners();
    }
    initializeEventListeners() {
        console.log('📚 [Contabilidad] Inicializando listeners de eventos...');
        this.eventBus.onVentaProcessed(async (event) => {
            console.log('📚 [Contabilidad] Procesando venta para asientos contables...');
            await this.procesarAsientoVenta(event.data);
        });
        this.eventBus.onMovimientoStock(async (event) => {
            console.log('📚 [Contabilidad] Procesando movimiento de stock...');
            await this.procesarAsientoMovimientoStock(event.data);
        });
        this.eventBus.onCompraEntregada(async (event) => {
            console.log('📚 [Contabilidad] Procesando compra entregada para asientos contables...');
            await this.procesarAsientoCompra(event.data);
        });
        this.eventBus.onPlanillaCalculada(async (event) => {
            console.log('📚 [Contabilidad] Procesando planilla calculada para asientos contables...');
            await this.procesarAsientoPlanilla(event.data);
        });
        this.eventBus.onPlanillaPagada(async (event) => {
            console.log('📚 [Contabilidad] Procesando pago de planilla para asientos contables...');
            await this.procesarAsientoPagoPlanilla(event.data);
        });
        this.eventBus.onPagoFactura(async (event) => {
            console.log('📚 [Contabilidad] Procesando pago de factura para asientos contables...');
            await this.procesarAsientoPagoFactura(event.data);
        });
        this.eventBus.onGastoRegistrado(async (event) => {
            console.log('📚 [Contabilidad] Procesando gasto registrado para asientos contables...');
            if (event.data.requiereAsiento) {
                await this.procesarAsientoGasto(event.data);
            }
        });
    }
    async procesarAsientoVenta(venta) {
        try {
            console.log(`📚 Generando asiento contable para venta ${venta.numeroTicket}`);
            const costoVentas = await this.calcularCostoVentas(venta.items);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Venta ${venta.numeroTicket} - ${venta.clienteNombre}`,
                referencia: venta.ventaId,
                detalles: [
                    {
                        cuentaId: 'cuenta-caja',
                        cuentaCodigo: venta.metodoPago === 'EFECTIVO' ? '101' : '102',
                        cuentaNombre: venta.metodoPago === 'EFECTIVO' ? 'Caja' : 'Banco',
                        debe: venta.total,
                        haber: 0,
                        descripcion: `Ingreso por venta ${venta.numeroTicket}`
                    },
                    {
                        cuentaId: 'cuenta-ventas',
                        cuentaCodigo: '701',
                        cuentaNombre: 'Ventas',
                        debe: 0,
                        haber: venta.subtotal,
                        descripcion: `Venta de mercadería ${venta.numeroTicket}`
                    },
                    {
                        cuentaId: 'cuenta-igv',
                        cuentaCodigo: '401',
                        cuentaNombre: 'IGV por Pagar',
                        debe: 0,
                        haber: venta.impuestos,
                        descripcion: `IGV de venta ${venta.numeroTicket}`
                    },
                    {
                        cuentaId: 'cuenta-costo-ventas',
                        cuentaCodigo: '691',
                        cuentaNombre: 'Costo de Ventas',
                        debe: costoVentas,
                        haber: 0,
                        descripcion: `Costo de mercadería vendida ${venta.numeroTicket}`
                    },
                    {
                        cuentaId: 'cuenta-inventario',
                        cuentaCodigo: '201',
                        cuentaNombre: 'Inventario',
                        debe: 0,
                        haber: costoVentas,
                        descripcion: `Salida de inventario por venta ${venta.numeroTicket}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de venta:', error);
            return null;
        }
    }
    async procesarAsientoCompra(compra) {
        try {
            console.log(`📚 Generando asiento para compra: ${compra.numeroOrden}`);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Compra de mercaderías - ${compra.numeroOrden}`,
                referencia: `${compra.numeroOrden} - ${compra.proveedorNombre}`,
                detalles: [
                    {
                        cuentaId: 'cuenta-inventario',
                        cuentaCodigo: '201',
                        cuentaNombre: 'Inventario',
                        debe: compra.total,
                        haber: 0,
                        descripcion: `Compra a ${compra.proveedorNombre}`
                    },
                    {
                        cuentaId: 'cuenta-cuentas-por-pagar',
                        cuentaCodigo: '421',
                        cuentaNombre: 'Facturas por Pagar',
                        debe: 0,
                        haber: compra.total,
                        descripcion: `Deuda con ${compra.proveedorNombre}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de compra:', error);
            return null;
        }
    }
    async procesarAsientoMovimientoStock(movimiento) {
        try {
            console.log(`📚 Generando asiento para movimiento de stock: ${movimiento.tipoMovimiento}`);
            let asiento;
            switch (movimiento.tipoMovimiento) {
                case 'ENTRADA':
                    asiento = {
                        fecha: new Date().toISOString(),
                        concepto: `Entrada de inventario - ${movimiento.motivo}`,
                        referencia: movimiento.productoId,
                        detalles: [
                            {
                                cuentaId: 'cuenta-inventario',
                                cuentaCodigo: '201',
                                cuentaNombre: 'Inventario',
                                debe: movimiento.valor,
                                haber: 0,
                                descripcion: `Entrada de ${movimiento.cantidad} unidades`
                            },
                            {
                                cuentaId: 'cuenta-compras',
                                cuentaCodigo: '601',
                                cuentaNombre: 'Compras',
                                debe: 0,
                                haber: movimiento.valor,
                                descripcion: movimiento.motivo
                            }
                        ]
                    };
                    break;
                case 'AJUSTE':
                    const esAjustePositivo = movimiento.cantidad > 0;
                    asiento = {
                        fecha: new Date().toISOString(),
                        concepto: `Ajuste de inventario - ${movimiento.motivo}`,
                        referencia: movimiento.productoId,
                        detalles: [
                            {
                                cuentaId: 'cuenta-inventario',
                                cuentaCodigo: '201',
                                cuentaNombre: 'Inventario',
                                debe: esAjustePositivo ? movimiento.valor : 0,
                                haber: esAjustePositivo ? 0 : movimiento.valor,
                                descripcion: `Ajuste de ${movimiento.cantidad} unidades`
                            },
                            {
                                cuentaId: 'cuenta-ajustes',
                                cuentaCodigo: '659',
                                cuentaNombre: 'Otras Cargas de Gestión',
                                debe: esAjustePositivo ? 0 : movimiento.valor,
                                haber: esAjustePositivo ? movimiento.valor : 0,
                                descripcion: movimiento.motivo
                            }
                        ]
                    };
                    break;
                default:
                    console.log('📚 Movimiento SALIDA ya manejado en venta');
                    return null;
            }
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de movimiento:', error);
            return null;
        }
    }
    async calcularCostoVentas(items) {
        let costoTotal = 0;
        for (const item of items) {
            try {
                const { data: producto } = await this.supabase.getClient()
                    .from('productos')
                    .select('precio')
                    .eq('codigo', item.productoId)
                    .single();
                if (producto) {
                    const costoUnitario = parseFloat(producto.precio) * 0.7;
                    costoTotal += costoUnitario * item.cantidad;
                }
                else {
                    costoTotal += item.precio * 0.7 * item.cantidad;
                }
            }
            catch (error) {
                console.warn(`⚠️ No se pudo obtener costo de ${item.productoId}:`, error);
                costoTotal += item.precio * 0.7 * item.cantidad;
            }
        }
        return costoTotal;
    }
    async guardarAsientoContable(asiento) {
        try {
            const numeroAsiento = `AST-${Date.now()}`;
            const totalDebe = asiento.detalles.reduce((sum, det) => sum + det.debe, 0);
            const totalHaber = asiento.detalles.reduce((sum, det) => sum + det.haber, 0);
            if (Math.abs(totalDebe - totalHaber) > 0.01) {
                throw new Error(`Asiento descuadrado: Debe=${totalDebe}, Haber=${totalHaber}`);
            }
            const { data: asientoGuardado, error: asientoError } = await this.supabase.getClient()
                .from('asientos_contables')
                .insert({
                numero_asiento: numeroAsiento,
                fecha: asiento.fecha,
                concepto: asiento.concepto,
                referencia: asiento.referencia,
                total_debe: totalDebe,
                total_haber: totalHaber,
                estado: 'CONTABILIZADO',
                usuario_id: 'system',
                created_at: new Date().toISOString()
            })
                .select()
                .single();
            if (asientoError)
                throw asientoError;
            const detallesParaGuardar = asiento.detalles.map(detalle => ({
                asiento_id: asientoGuardado.id,
                cuenta_id: detalle.cuentaId,
                debe: detalle.debe,
                haber: detalle.haber,
                concepto: detalle.descripcion,
                created_at: new Date().toISOString()
            }));
            const { error: detallesError } = await this.supabase.getClient()
                .from('detalle_asientos')
                .insert(detallesParaGuardar);
            if (detallesError)
                throw detallesError;
            console.log(`✅ Asiento contable creado: ${numeroAsiento}`);
            return asientoGuardado.id;
        }
        catch (error) {
            console.error('❌ Error guardando asiento contable:', error);
            throw error;
        }
    }
    async getPlanCuentas() {
        try {
            const { data, error } = await this.supabase.getClient()
                .from('plan_cuentas')
                .select('*')
                .order('codigo');
            if (error)
                throw error;
            return data || [];
        }
        catch (error) {
            console.error('❌ Error obteniendo plan de cuentas:', error);
            return [];
        }
    }
    async getAsientosContables(filtros = {}) {
        try {
            let query = this.supabase.getClient()
                .from('asientos_contables')
                .select(`
          *,
          detalle_asientos (
            cuenta_id,
            debe,
            haber,
            concepto
          )
        `)
                .order('created_at', { ascending: false });
            if (filtros.fechaDesde) {
                query = query.gte('fecha', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('fecha', filtros.fechaHasta);
            }
            const { data, error } = await query.limit(50);
            if (error)
                throw error;
            return data || [];
        }
        catch (error) {
            console.error('❌ Error obteniendo asientos contables:', error);
            return [];
        }
    }
    async getLibroMayorPorCuenta(cuentaCodigo, filtros = {}) {
        try {
            console.log(`📊 Obteniendo movimientos para cuenta: ${cuentaCodigo}`);
            const { data: cuenta, error: cuentaError } = await this.supabase.getClient()
                .from('plan_cuentas')
                .select('*')
                .eq('codigo', cuentaCodigo)
                .single();
            if (cuentaError || !cuenta) {
                throw new Error(`Cuenta ${cuentaCodigo} no encontrada`);
            }
            let query = this.supabase.getClient()
                .from('detalle_asientos')
                .select(`
          *,
          asientos_contables!inner (
            numero_asiento,
            fecha,
            concepto,
            referencia
          )
        `)
                .eq('cuenta_id', cuentaCodigo)
                .order('created_at', { ascending: true });
            if (filtros.fechaDesde) {
                query = query.gte('asientos_contables.fecha', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('asientos_contables.fecha', filtros.fechaHasta);
            }
            const { data: movimientos, error: movError } = await query;
            if (movError)
                throw movError;
            let saldoAcumulado = 0;
            const movimientosConSaldo = (movimientos || []).map(mov => {
                const movimiento = mov.debe - mov.haber;
                saldoAcumulado += movimiento;
                return {
                    fecha: mov.asientos_contables.fecha,
                    numeroAsiento: mov.asientos_contables.numero_asiento,
                    concepto: mov.asientos_contables.concepto,
                    referencia: mov.asientos_contables.referencia,
                    descripcion: mov.descripcion,
                    debe: mov.debe,
                    haber: mov.haber,
                    saldo: saldoAcumulado
                };
            });
            const totalDebe = movimientosConSaldo.reduce((sum, mov) => sum + mov.debe, 0);
            const totalHaber = movimientosConSaldo.reduce((sum, mov) => sum + mov.haber, 0);
            return {
                cuenta: {
                    codigo: cuenta.codigo,
                    nombre: cuenta.nombre,
                    tipo: cuenta.tipo,
                    naturaleza: cuenta.naturaleza
                },
                periodo: filtros.fechaDesde && filtros.fechaHasta
                    ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
                    : 'Todos los registros',
                movimientos: movimientosConSaldo,
                resumen: {
                    totalMovimientos: movimientosConSaldo.length,
                    totalDebe: totalDebe,
                    totalHaber: totalHaber,
                    saldoFinal: totalDebe - totalHaber
                }
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo Libro Mayor por cuenta:', error);
            throw error;
        }
    }
    async getLibroMayorCompleto(filtros = {}) {
        try {
            console.log('📊 Generando Libro Mayor completo...');
            let query = this.supabase.getClient()
                .from('detalle_asientos')
                .select(`
          cuenta_id,
          debe,
          haber,
          concepto,
          asientos_contables!inner (
            fecha,
            numero_asiento,
            concepto
          )
        `)
                .order('cuenta_id', { ascending: true });
            if (filtros.fechaDesde) {
                query = query.gte('asientos_contables.fecha', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('asientos_contables.fecha', filtros.fechaHasta);
            }
            const { data: movimientos, error } = await query;
            if (error)
                throw error;
            const cuentasAgrupadas = (movimientos || []).reduce((acc, mov) => {
                const codigo = mov.cuenta_id;
                if (!acc[codigo]) {
                    acc[codigo] = {
                        codigo: codigo,
                        nombre: `Cuenta ${codigo}`,
                        totalDebe: 0,
                        totalHaber: 0,
                        cantidadMovimientos: 0
                    };
                }
                acc[codigo].totalDebe += mov.debe;
                acc[codigo].totalHaber += mov.haber;
                acc[codigo].cantidadMovimientos++;
                return acc;
            }, {});
            const libroMayorCompleto = Object.values(cuentasAgrupadas).map((cuenta) => ({
                ...cuenta,
                saldo: cuenta.totalDebe - cuenta.totalHaber
            }));
            return {
                periodo: filtros.fechaDesde && filtros.fechaHasta
                    ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
                    : 'Todos los registros',
                totalCuentas: libroMayorCompleto.length,
                cuentas: libroMayorCompleto
            };
        }
        catch (error) {
            console.error('❌ Error generando Libro Mayor completo:', error);
            throw error;
        }
    }
    async getRegistroVentas(filtros = {}) {
        try {
            console.log('📝 Obteniendo datos de CPE para Registro de Ventas...');
            let query = this.supabase.getClient()
                .from('cpe')
                .select('*')
                .in('estado', ['ACEPTADO', 'ENVIADO'])
                .order('created_at', { ascending: true });
            if (filtros.fechaDesde) {
                query = query.gte('created_at', filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query = query.lte('created_at', filtros.fechaHasta);
            }
            if (filtros.tipoComprobante) {
                query = query.eq('tipo_comprobante', filtros.tipoComprobante);
            }
            const { data: ventas, error } = await query;
            if (error)
                throw error;
            const registroVentas = (ventas || []).map(venta => ({
                fechaEmision: venta.created_at,
                tipoComprobante: this.getTipoComprobanteTexto(venta.tipo_comprobante),
                serieNumero: `${venta.serie}-${venta.numero.toString().padStart(8, '0')}`,
                tipoDocumentoCliente: venta.cliente_tipo_documento || '6',
                numeroDocumentoCliente: venta.cliente_numero_documento,
                razonSocialCliente: venta.cliente_razon_social,
                valorFacturadoExportacion: 0,
                baseImponibleOperacionGravada: this.calcularBaseImponible(venta),
                descuentoBaseImponible: 0,
                igv: this.calcularIGV(venta),
                descuentoIGV: 0,
                baseImponibleOperacionGratuitaGravada: 0,
                igvOperacionGratuita: 0,
                baseImponibleOperacionExonerada: 0,
                baseImponibleOperacionInafecta: 0,
                isc: 0,
                baseImponibleArrozPilado: 0,
                ivapArrozPilado: 0,
                otrosTributos: 0,
                totalComprobante: venta.total,
                moneda: venta.moneda || 'PEN',
                fechaVencimiento: venta.fecha_vencimiento || venta.created_at,
                estadoSunat: venta.estado_sunat || venta.estado,
                id: venta.id,
                created_at: venta.created_at
            }));
            const resumen = registroVentas.reduce((acc, venta) => {
                acc.cantidadComprobantes++;
                acc.baseImponible += venta.baseImponibleOperacionGravada;
                acc.igv += venta.igv;
                acc.total += venta.totalComprobante;
                const tipo = venta.tipoComprobante;
                if (!acc.porTipo[tipo])
                    acc.porTipo[tipo] = { cantidad: 0, total: 0 };
                acc.porTipo[tipo].cantidad++;
                acc.porTipo[tipo].total += venta.totalComprobante;
                return acc;
            }, {
                cantidadComprobantes: 0,
                baseImponible: 0,
                igv: 0,
                total: 0,
                porTipo: {}
            });
            return {
                periodo: filtros.fechaDesde && filtros.fechaHasta
                    ? `${filtros.fechaDesde} al ${filtros.fechaHasta}`
                    : 'Todos los registros',
                resumen: resumen,
                ventas: registroVentas
            };
        }
        catch (error) {
            console.error('❌ Error obteniendo Registro de Ventas:', error);
            throw error;
        }
    }
    getTipoComprobanteTexto(codigo) {
        const tipos = {
            '01': 'FACTURA',
            '03': 'BOLETA DE VENTA',
            '07': 'NOTA DE CRÉDITO',
            '08': 'NOTA DE DÉBITO'
        };
        return tipos[codigo] || codigo;
    }
    calcularBaseImponible(venta) {
        if (venta.incluye_igv) {
            return venta.total / 1.18;
        }
        return venta.subtotal || (venta.total - this.calcularIGV(venta));
    }
    calcularIGV(venta) {
        if (venta.igv !== undefined) {
            return venta.igv;
        }
        const baseImponible = this.calcularBaseImponible(venta);
        return baseImponible * 0.18;
    }
    async procesarAsientoPlanilla(planilla) {
        try {
            console.log(`📚 Generando asiento contable para planilla ${planilla.periodo}`);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Planilla de sueldos ${planilla.periodo}`,
                referencia: `PLANILLA-${planilla.planillaId}`,
                detalles: [
                    {
                        cuentaId: 'cuenta-sueldos',
                        cuentaCodigo: '621',
                        cuentaNombre: 'Remuneraciones',
                        debe: planilla.totalIngresos,
                        haber: 0,
                        descripcion: `Sueldos y salarios ${planilla.periodo}`
                    },
                    {
                        cuentaId: 'cuenta-contribuciones',
                        cuentaCodigo: '627',
                        cuentaNombre: 'Seguridad y Previsión Social',
                        debe: planilla.totalAportes,
                        haber: 0,
                        descripcion: `ESSALUD y aportes empleador ${planilla.periodo}`
                    },
                    {
                        cuentaId: 'cuenta-sueldos-por-pagar',
                        cuentaCodigo: '411',
                        cuentaNombre: 'Remuneraciones por Pagar',
                        debe: 0,
                        haber: planilla.totalNeto,
                        descripcion: `Neto a pagar empleados ${planilla.periodo}`
                    },
                    {
                        cuentaId: 'cuenta-tributos-pensiones',
                        cuentaCodigo: '403',
                        cuentaNombre: 'Instituciones Públicas',
                        debe: 0,
                        haber: planilla.totalDescuentos,
                        descripcion: `AFP/ONP y descuentos ${planilla.periodo}`
                    },
                    {
                        cuentaId: 'cuenta-essalud',
                        cuentaCodigo: '407',
                        cuentaNombre: 'Administradoras de Fondos',
                        debe: 0,
                        haber: planilla.totalAportes,
                        descripcion: `ESSALUD por pagar ${planilla.periodo}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de planilla:', error);
            return null;
        }
    }
    async procesarAsientoPagoPlanilla(pago) {
        try {
            console.log(`📚 Generando asiento de pago de planilla ${pago.periodo}`);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Pago planilla ${pago.periodo}`,
                referencia: `PAGO-PLANILLA-${pago.planillaId}`,
                detalles: [
                    {
                        cuentaId: 'cuenta-sueldos-por-pagar',
                        cuentaCodigo: '411',
                        cuentaNombre: 'Remuneraciones por Pagar',
                        debe: pago.totalPagado,
                        haber: 0,
                        descripcion: `Cancelación sueldos ${pago.periodo}`
                    },
                    {
                        cuentaId: pago.metodoPago === 'efectivo' ? 'cuenta-caja' : 'cuenta-bancos',
                        cuentaCodigo: pago.metodoPago === 'efectivo' ? '101' : '104',
                        cuentaNombre: pago.metodoPago === 'efectivo' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
                        debe: 0,
                        haber: pago.totalPagado,
                        descripcion: `Pago planilla por ${pago.metodoPago} ${pago.periodo}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de pago de planilla:', error);
            return null;
        }
    }
    async procesarAsientoPagoFactura(pago) {
        try {
            console.log(`📚 Generando asiento de cobro de factura ${pago.numeroFactura}`);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Cobro factura ${pago.numeroFactura}`,
                referencia: `COBRO-${pago.facturaId}`,
                detalles: [
                    {
                        cuentaId: pago.metodoPago === 'EFECTIVO' ? 'cuenta-caja' : 'cuenta-bancos',
                        cuentaCodigo: pago.metodoPago === 'EFECTIVO' ? '101' : '104',
                        cuentaNombre: pago.metodoPago === 'EFECTIVO' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
                        debe: pago.montoPagado,
                        haber: 0,
                        descripcion: `Cobro factura ${pago.numeroFactura} por ${pago.metodoPago}`
                    },
                    {
                        cuentaId: 'cuenta-clientes',
                        cuentaCodigo: '122',
                        cuentaNombre: 'Cuentas por Cobrar Comerciales - Terceros',
                        debe: 0,
                        haber: pago.montoPagado,
                        descripcion: `Cobro cliente factura ${pago.numeroFactura}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de cobro de factura:', error);
            return null;
        }
    }
    async procesarAsientoGasto(gasto) {
        try {
            console.log(`📚 Generando asiento de gasto: ${gasto.concepto}`);
            const cuentaGasto = this.determinarCuentaGasto(gasto.categoria);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Gasto: ${gasto.concepto}`,
                referencia: `GASTO-${gasto.gastoId}`,
                detalles: [
                    {
                        cuentaId: cuentaGasto.id,
                        cuentaCodigo: cuentaGasto.codigo,
                        cuentaNombre: cuentaGasto.nombre,
                        debe: gasto.monto,
                        haber: 0,
                        descripcion: gasto.concepto
                    },
                    {
                        cuentaId: gasto.metodoPago === 'EFECTIVO' ? 'cuenta-caja' :
                            gasto.metodoPago === 'TRANSFERENCIA' ? 'cuenta-bancos' : 'cuenta-proveedores',
                        cuentaCodigo: gasto.metodoPago === 'EFECTIVO' ? '101' :
                            gasto.metodoPago === 'TRANSFERENCIA' ? '104' : '421',
                        cuentaNombre: gasto.metodoPago === 'EFECTIVO' ? 'Caja' :
                            gasto.metodoPago === 'TRANSFERENCIA' ? 'Cuentas Corrientes en Instituciones Financieras' : 'Facturas por Pagar',
                        debe: 0,
                        haber: gasto.monto,
                        descripcion: `Pago ${gasto.concepto} ${gasto.proveedor ? 'a ' + gasto.proveedor : ''}`
                    }
                ]
            };
            return await this.guardarAsientoContable(asiento);
        }
        catch (error) {
            console.error('❌ Error generando asiento de gasto:', error);
            return null;
        }
    }
    determinarCuentaGasto(categoria) {
        const categoriasGasto = {
            'SUMINISTROS': { id: 'cuenta-suministros', codigo: '609', nombre: 'Otros Gastos de Gestión' },
            'SERVICIOS': { id: 'cuenta-servicios', codigo: '634', nombre: 'Servicios de Gestión' },
            'TRANSPORTE': { id: 'cuenta-transporte', codigo: '635', nombre: 'Transporte' },
            'PUBLICIDAD': { id: 'cuenta-publicidad', codigo: '637', nombre: 'Publicidad, Publicaciones, Relaciones Públicas' },
            'MANTENIMIENTO': { id: 'cuenta-mantenimiento', codigo: '655', nombre: 'Mantenimiento y Reparaciones' },
            'ALQUILER': { id: 'cuenta-alquiler', codigo: '656', nombre: 'Alquiler' },
            'OTROS': { id: 'cuenta-otros-gastos', codigo: '659', nombre: 'Otros Gastos de Gestión' }
        };
        return categoriasGasto[categoria] || categoriasGasto['OTROS'];
    }
};
exports.AccountingIntegrationService = AccountingIntegrationService;
exports.AccountingIntegrationService = AccountingIntegrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService,
        event_bus_service_1.EventBusService])
], AccountingIntegrationService);
