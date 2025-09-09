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
            // Calcular costo de ventas
            const costoVentas = await this.calcularCostoVentas(venta.items);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Venta ${venta.numeroTicket} - ${venta.clienteNombre}`,
                referencia: venta.ventaId,
                detalles: [
                    // DEBE: Caja/Bancos por el total de la venta
                    {
                        cuentaId: 'cuenta-caja',
                        cuentaCodigo: venta.metodoPago === 'EFECTIVO' ? '101' : '102',
                        cuentaNombre: venta.metodoPago === 'EFECTIVO' ? 'Caja' : 'Banco',
                        debe: venta.total,
                        haber: 0,
                        descripcion: `Ingreso por venta ${venta.numeroTicket}`
                    },
                    // HABER: Ventas por el subtotal
                    {
                        cuentaId: 'cuenta-ventas',
                        cuentaCodigo: '701',
                        cuentaNombre: 'Ventas',
                        debe: 0,
                        haber: venta.subtotal,
                        descripcion: `Venta de mercadería ${venta.numeroTicket}`
                    },
                    // HABER: IGV por cobrar
                    {
                        cuentaId: 'cuenta-igv',
                        cuentaCodigo: '401',
                        cuentaNombre: 'IGV por Pagar',
                        debe: 0,
                        haber: venta.impuestos,
                        descripcion: `IGV de venta ${venta.numeroTicket}`
                    },
                    // DEBE: Costo de Ventas
                    {
                        cuentaId: 'cuenta-costo-ventas',
                        cuentaCodigo: '691',
                        cuentaNombre: 'Costo de Ventas',
                        debe: costoVentas,
                        haber: 0,
                        descripcion: `Costo de mercadería vendida ${venta.numeroTicket}`
                    },
                    // HABER: Inventario (reducción)
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
                    // DEBE: Inventario (aumento de activo)
                    {
                        cuentaId: 'cuenta-inventario',
                        cuentaCodigo: '201',
                        cuentaNombre: 'Inventario',
                        debe: compra.total,
                        haber: 0,
                        descripcion: `Compra a ${compra.proveedorNombre}`
                    },
                    // HABER: Cuentas por Pagar o Efectivo (según forma de pago)
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
                // Obtener costo del producto desde la base de datos
                const { data: producto } = await this.supabase.getClient()
                    .from('productos')
                    .select('precio')
                    .eq('codigo', item.productoId)
                    .single();
                if (producto) {
                    // Asumir costo como 70% del precio de venta
                    const costoUnitario = parseFloat(producto.precio) * 0.7;
                    costoTotal += costoUnitario * item.cantidad;
                }
                else {
                    // Fallback: costo estimado basado en precio de venta
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
            // Validar que cuadre el asiento
            const totalDebe = asiento.detalles.reduce((sum, det) => sum + det.debe, 0);
            const totalHaber = asiento.detalles.reduce((sum, det) => sum + det.haber, 0);
            if (Math.abs(totalDebe - totalHaber) > 0.01) {
                throw new Error(`Asiento descuadrado: Debe=${totalDebe}, Haber=${totalHaber}`);
            }
            // Guardar cabecera del asiento
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
            // Guardar detalles del asiento
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
    // Método para obtener el plan de cuentas actualizado
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
    // Método para obtener asientos contables
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
    // Método para obtener Libro Mayor por cuenta específica
    async getLibroMayorPorCuenta(cuentaCodigo, filtros = {}) {
        try {
            console.log(`📊 Obteniendo movimientos para cuenta: ${cuentaCodigo}`);
            // Obtener información de la cuenta
            const { data: cuenta, error: cuentaError } = await this.supabase.getClient()
                .from('plan_cuentas')
                .select('*')
                .eq('codigo', cuentaCodigo)
                .single();
            if (cuentaError || !cuenta) {
                throw new Error(`Cuenta ${cuentaCodigo} no encontrada`);
            }
            // Obtener movimientos de la cuenta
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
            // Calcular saldos
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
    // Método para obtener Libro Mayor completo
    async getLibroMayorCompleto(filtros = {}) {
        try {
            console.log('📊 Generando Libro Mayor completo...');
            // Obtener todas las cuentas con movimientos
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
            // Agrupar por cuenta
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
            // Convertir a array y agregar saldo
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
    // Método para obtener Registro de Ventas (conecta con CPE)
    async getRegistroVentas(filtros = {}) {
        try {
            console.log('📝 Obteniendo datos de CPE para Registro de Ventas...');
            // Obtener comprobantes de pago electrónicos (CPE)
            let query = this.supabase.getClient()
                .from('cpe')
                .select('*')
                .in('estado', ['ACEPTADO', 'ENVIADO']) // Solo CPE válidos
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
            // Formatear según normativa SUNAT (Registro de Ventas)
            const registroVentas = (ventas || []).map(venta => ({
                // Datos del comprobante
                fechaEmision: venta.created_at,
                tipoComprobante: this.getTipoComprobanteTexto(venta.tipo_comprobante),
                serieNumero: `${venta.serie}-${venta.numero.toString().padStart(8, '0')}`,
                tipoDocumentoCliente: venta.cliente_tipo_documento || '6', // RUC por defecto
                numeroDocumentoCliente: venta.cliente_numero_documento,
                razonSocialCliente: venta.cliente_razon_social,
                // Importes según SUNAT
                valorFacturadoExportacion: 0, // Exportaciones (si aplica)
                baseImponibleOperacionGravada: this.calcularBaseImponible(venta),
                descuentoBaseImponible: 0, // Descuentos (si aplica)
                igv: this.calcularIGV(venta),
                descuentoIGV: 0,
                baseImponibleOperacionGratuitaGravada: 0, // Gratuitas (si aplica)
                igvOperacionGratuita: 0,
                baseImponibleOperacionExonerada: 0, // Exoneradas (si aplica)
                baseImponibleOperacionInafecta: 0, // Inafectas (si aplica)
                isc: 0, // ISC (si aplica)
                baseImponibleArrozPilado: 0, // Específico para arroz
                ivapArrozPilado: 0,
                otrosTributos: 0,
                totalComprobante: venta.total,
                // Datos adicionales
                moneda: venta.moneda || 'PEN',
                fechaVencimiento: venta.fecha_vencimiento || venta.created_at,
                // Estado SUNAT
                estadoSunat: venta.estado_sunat || venta.estado,
                // Referencia interna
                id: venta.id,
                created_at: venta.created_at
            }));
            // Calcular resumen
            const resumen = registroVentas.reduce((acc, venta) => {
                acc.cantidadComprobantes++;
                acc.baseImponible += venta.baseImponibleOperacionGravada;
                acc.igv += venta.igv;
                acc.total += venta.totalComprobante;
                // Contar por tipo
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
    // Métodos auxiliares para el Registro de Ventas
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
        // Si el total incluye IGV, calcular base imponible
        if (venta.incluye_igv) {
            return venta.total / 1.18; // Descontar 18% IGV
        }
        return venta.subtotal || (venta.total - this.calcularIGV(venta));
    }
    calcularIGV(venta) {
        if (venta.igv !== undefined) {
            return venta.igv;
        }
        // Calcular IGV como 18% de la base imponible
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
                    // DEBE: Gasto por Sueldos y Salarios (Cuenta 621)
                    {
                        cuentaId: 'cuenta-sueldos',
                        cuentaCodigo: '621',
                        cuentaNombre: 'Remuneraciones',
                        debe: planilla.totalIngresos,
                        haber: 0,
                        descripcion: `Sueldos y salarios ${planilla.periodo}`
                    },
                    // DEBE: Contribuciones Sociales del Empleador (Cuenta 627) - ESSALUD 9%
                    {
                        cuentaId: 'cuenta-contribuciones',
                        cuentaCodigo: '627',
                        cuentaNombre: 'Seguridad y Previsión Social',
                        debe: planilla.totalAportes,
                        haber: 0,
                        descripcion: `ESSALUD y aportes empleador ${planilla.periodo}`
                    },
                    // HABER: Sueldos por Pagar (Cuenta 411)
                    {
                        cuentaId: 'cuenta-sueldos-por-pagar',
                        cuentaCodigo: '411',
                        cuentaNombre: 'Remuneraciones por Pagar',
                        debe: 0,
                        haber: planilla.totalNeto,
                        descripcion: `Neto a pagar empleados ${planilla.periodo}`
                    },
                    // HABER: Tributos por Pagar - AFP/ONP (Cuenta 403)
                    {
                        cuentaId: 'cuenta-tributos-pensiones',
                        cuentaCodigo: '403',
                        cuentaNombre: 'Instituciones Públicas',
                        debe: 0,
                        haber: planilla.totalDescuentos,
                        descripcion: `AFP/ONP y descuentos ${planilla.periodo}`
                    },
                    // HABER: ESSALUD por Pagar (Cuenta 407)
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
                    // DEBE: Sueldos por Pagar (se cancela la deuda)
                    {
                        cuentaId: 'cuenta-sueldos-por-pagar',
                        cuentaCodigo: '411',
                        cuentaNombre: 'Remuneraciones por Pagar',
                        debe: pago.totalPagado,
                        haber: 0,
                        descripcion: `Cancelación sueldos ${pago.periodo}`
                    },
                    // HABER: Caja o Bancos (según método de pago)
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
                    // DEBE: Caja o Bancos (ingreso del dinero)
                    {
                        cuentaId: pago.metodoPago === 'EFECTIVO' ? 'cuenta-caja' : 'cuenta-bancos',
                        cuentaCodigo: pago.metodoPago === 'EFECTIVO' ? '101' : '104',
                        cuentaNombre: pago.metodoPago === 'EFECTIVO' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
                        debe: pago.montoPagado,
                        haber: 0,
                        descripcion: `Cobro factura ${pago.numeroFactura} por ${pago.metodoPago}`
                    },
                    // HABER: Cuentas por Cobrar (se reduce la deuda del cliente)
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
            // Determinar cuenta de gasto según categoría
            const cuentaGasto = this.determinarCuentaGasto(gasto.categoria);
            const asiento = {
                fecha: new Date().toISOString(),
                concepto: `Gasto: ${gasto.concepto}`,
                referencia: `GASTO-${gasto.gastoId}`,
                detalles: [
                    // DEBE: Cuenta de Gasto correspondiente
                    {
                        cuentaId: cuentaGasto.id,
                        cuentaCodigo: cuentaGasto.codigo,
                        cuentaNombre: cuentaGasto.nombre,
                        debe: gasto.monto,
                        haber: 0,
                        descripcion: gasto.concepto
                    },
                    // HABER: Caja/Bancos o Cuentas por Pagar
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
