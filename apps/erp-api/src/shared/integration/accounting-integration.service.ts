import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, VentaProcessedEvent, MovimientoStockEvent, CompraEntregadaEvent, PlanillaCalculadaEvent, PlanillaPagadaEvent, PagoFacturaEvent, GastoRegistradoEvent } from '../events/event-bus.service';

export interface AsientoContable {
  fecha: string;
  concepto: string;
  referencia: string;
  detalles: AsientoDetalle[];
}

export interface AsientoDetalle {
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  debe: number;
  haber: number;
  descripcion: string;
}

@Injectable()
export class AccountingIntegrationService {
  
  private cuentasCache: Map<string, string> = new Map();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService
  ) {
    console.log('🏗️ [AccountingIntegrationService] Constructor llamado - inicializando...');
    this.initializeCuentasCache();
    this.initializeEventListeners();
    console.log('✅ [AccountingIntegrationService] Servicio de contabilidad listo y listeners registrados');
  }

  async initializeCuentasCache(): Promise<void> {
    try {
      const { data: cuentas, error } = await this.supabase.getClient()
        .from('plan_cuentas')
        .select('id, codigo, nombre')
        .eq('acepta_movimiento', true);

      if (error) throw error;

      cuentas?.forEach(cuenta => {
        this.cuentasCache.set(cuenta.codigo, cuenta.id);
      });

      console.log(`✅ Cache de cuentas inicializado: ${this.cuentasCache.size} cuentas`);
    } catch (error) {
      console.error('❌ Error inicializando cache de cuentas:', error);
    }
  }

  private async getCuentaId(codigo: string): Promise<string> {
    let cuentaId = this.cuentasCache.get(codigo);
    
    if (!cuentaId) {
      const { data: cuenta, error } = await this.supabase.getClient()
        .from('plan_cuentas')
        .select('id')
        .eq('codigo', codigo)
        .single();

      if (error || !cuenta) {
        console.error(`❌ Cuenta no encontrada: ${codigo}`);
        throw new Error(`Cuenta contable ${codigo} no encontrada`);
      }

      cuentaId = cuenta.id;
      this.cuentasCache.set(codigo, cuentaId);
    }

    return cuentaId;
  }

  initializeEventListeners() {
    console.log('📚 [Contabilidad] Inicializando listeners de eventos...');
    
    this.eventBus.onVentaProcessed(async (event) => {
      console.log('📚 [Contabilidad] ¡EVENTO RECIBIDO! Procesando venta para asientos contables...', event.data);
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

  async procesarAsientoVenta(venta: VentaProcessedEvent): Promise<string | null> {
    try {
      console.log(`📚 [Contabilidad] Generando asiento contable para venta ${venta.numeroTicket}`);
      console.log(`📚 [Contabilidad] Datos de venta:`, JSON.stringify(venta, null, 2));

      const costoVentas = await this.calcularCostoVentas(venta.items);
      console.log(`💰 [Contabilidad] Costo de ventas calculado: ${costoVentas}`);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString(),
        concepto: `Venta ${venta.numeroTicket} - ${venta.clienteNombre}`,
        referencia: venta.ventaId,
        detalles: [
          {
            cuentaId: await this.getCuentaId(venta.metodoPago === 'EFECTIVO' ? '101' : '104'),
            cuentaCodigo: venta.metodoPago === 'EFECTIVO' ? '101' : '104',
            cuentaNombre: venta.metodoPago === 'EFECTIVO' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
            debe: venta.total,
            haber: 0,
            descripcion: `Ingreso por venta ${venta.numeroTicket}`
          },
          {
            cuentaId: await this.getCuentaId('701'),
            cuentaCodigo: '701',
            cuentaNombre: 'Mercaderías',
            debe: 0,
            haber: venta.subtotal,
            descripcion: `Venta de mercadería ${venta.numeroTicket}`
          },
          {
            cuentaId: await this.getCuentaId('401'),
            cuentaCodigo: '401',
            cuentaNombre: 'Gobierno Central',
            debe: 0,
            haber: venta.impuestos,
            descripcion: `IGV de venta ${venta.numeroTicket}`
          },
          {
            cuentaId: await this.getCuentaId('691'),
            cuentaCodigo: '691',
            cuentaNombre: 'Mercaderías',
            debe: costoVentas,
            haber: 0,
            descripcion: `Costo de mercadería vendida ${venta.numeroTicket}`
          },
          {
            cuentaId: await this.getCuentaId('201'),
            cuentaCodigo: '201',
            cuentaNombre: 'Mercaderías Manufacturadas',
            debe: 0,
            haber: costoVentas,
            descripcion: `Salida de inventario por venta ${venta.numeroTicket}`
          }
        ]
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error generando asiento de venta:', error);
      return null;
    }
  }

  async procesarAsientoCompra(compra: CompraEntregadaEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento para compra: ${compra.numeroOrden}`);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString(),
        concepto: `Compra de mercaderías - ${compra.numeroOrden}`,
        referencia: `${compra.numeroOrden} - ${compra.proveedorNombre}`,
        detalles: [
          {
            cuentaId: await this.getCuentaId('201'),
            cuentaCodigo: '201',
            cuentaNombre: 'Mercaderías Manufacturadas',
            debe: compra.total,
            haber: 0,
            descripcion: `Compra a ${compra.proveedorNombre}`
          },
          {
            cuentaId: await this.getCuentaId('421'),
            cuentaCodigo: '421',
            cuentaNombre: 'Facturas por Pagar',
            debe: 0,
            haber: compra.total,
            descripcion: `Deuda con ${compra.proveedorNombre}`
          }
        ]
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error generando asiento de compra:', error);
      return null;
    }
  }

  async procesarAsientoMovimientoStock(movimiento: MovimientoStockEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento para movimiento de stock: ${movimiento.tipoMovimiento}`);

      let asiento: AsientoContable;

      switch (movimiento.tipoMovimiento) {
        case 'ENTRADA':
          asiento = {
            fecha: new Date().toISOString(),
            concepto: `Entrada de inventario - ${movimiento.motivo}`,
            referencia: movimiento.productoId,
            detalles: [
              {
                cuentaId: await this.getCuentaId('201'),
                cuentaCodigo: '201',
                cuentaNombre: 'Mercaderías Manufacturadas',
                debe: movimiento.valor,
                haber: 0,
                descripcion: `Entrada de ${movimiento.cantidad} unidades`
              },
              {
                cuentaId: await this.getCuentaId('601'),
                cuentaCodigo: '601',
                cuentaNombre: 'Mercaderías',
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
                cuentaId: await this.getCuentaId('201'),
                cuentaCodigo: '201',
                cuentaNombre: 'Mercaderías Manufacturadas',
                debe: esAjustePositivo ? movimiento.valor : 0,
                haber: esAjustePositivo ? 0 : movimiento.valor,
                descripcion: `Ajuste de ${movimiento.cantidad} unidades`
              },
              {
                cuentaId: await this.getCuentaId('659'),
                cuentaCodigo: '659',
                cuentaNombre: 'Otros Gastos de Gestión',
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
    } catch (error) {
      console.error('❌ Error generando asiento de movimiento:', error);
      return null;
    }
  }

  private async calcularCostoVentas(items: any[]): Promise<number> {
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
        } else {
          costoTotal += item.precio * 0.7 * item.cantidad;
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo obtener costo de ${item.productoId}:`, error);
        costoTotal += item.precio * 0.7 * item.cantidad;
      }
    }
    
    return costoTotal;
  }

  private async guardarAsientoContable(asiento: AsientoContable): Promise<string> {
    try {
      const numeroAsiento = `AST-${Date.now()}`;
      console.log(`📚 [Contabilidad] Guardando asiento: ${numeroAsiento}`);
      
      const totalDebe = asiento.detalles.reduce((sum, det) => sum + det.debe, 0);
      const totalHaber = asiento.detalles.reduce((sum, det) => sum + det.haber, 0);
      
      console.log(`📊 [Contabilidad] Totales: Debe=${totalDebe}, Haber=${totalHaber}`);
      console.log(`📊 [Contabilidad] Detalles del asiento:`, JSON.stringify(asiento.detalles, null, 2));
      
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        throw new Error(`Asiento descuadrado: Debe=${totalDebe}, Haber=${totalHaber}`);
      }

      console.log(`📝 [Contabilidad] Insertando cabecera del asiento...`);
      const { data: asientoGuardado, error: asientoError } = await this.supabase.getClient()
        .from('asientos_contables')
        .insert({
          numero_asiento: numeroAsiento,
          fecha: asiento.fecha,
          concepto: asiento.concepto,
          referencia: asiento.referencia,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'BORRADOR',
          usuario_id: null, // Cambiado de 'system' a null para evitar error de UUID
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (asientoError) {
        console.error('❌ [Contabilidad] Error insertando cabecera:', asientoError);
        throw asientoError;
      }
      
      console.log(`✅ [Contabilidad] Cabecera insertada con ID: ${asientoGuardado.id}`);

      const detallesParaGuardar = asiento.detalles.map(detalle => ({
        asiento_id: asientoGuardado.id,
        cuenta_id: detalle.cuentaId,
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.descripcion,
        created_at: new Date().toISOString()
      }));

      console.log(`📝 [Contabilidad] Insertando ${detallesParaGuardar.length} detalles...`);
      console.log(`📝 [Contabilidad] Detalles para guardar:`, JSON.stringify(detallesParaGuardar, null, 2));

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesParaGuardar);

      if (detallesError) {
        console.error('❌ [Contabilidad] Error insertando detalles:', detallesError);
        throw detallesError;
      }
      
      console.log(`✅ [Contabilidad] Detalles insertados exitosamente`);

      console.log(`✅ Asiento contable creado: ${numeroAsiento}`);
      return asientoGuardado.id;
    } catch (error) {
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

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error obteniendo plan de cuentas:', error);
      return [];
    }
  }

  async getAsientosContables(filtros: any = {}) {
    try {
      console.log('📚 [Contabilidad] Obteniendo asientos contables con filtros:', filtros);
      
      let query = this.supabase.getClient()
        .from('asientos_contables')
        .select(`
          *,
          detalle_asientos (
            id,
            cuenta_id,
            debe,
            haber,
            concepto,
            referencia
          )
        `)
        .order('created_at', { ascending: false });

      if (filtros.fechaDesde) {
        query = query.gte('fecha', filtros.fechaDesde);
      }
      
      if (filtros.fechaHasta) {
        query = query.lte('fecha', filtros.fechaHasta);
      }

      const { data, error } = await query.limit(100);
      
      if (error) {
        console.error('❌ Error en consulta de asientos:', error);
        throw error;
      }
      
      console.log(`📚 [Contabilidad] Encontrados ${data?.length || 0} asientos contables`);
      return data || [];
    } catch (error) {
      console.error('❌ Error obteniendo asientos contables:', error);
      return [];
    }
  }

  async getLibroMayorPorCuenta(cuentaCodigo: string, filtros: any = {}) {
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
      
      if (movError) throw movError;

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
    } catch (error) {
      console.error('❌ Error obteniendo Libro Mayor por cuenta:', error);
      throw error;
    }
  }

  async getLibroMayorCompleto(filtros: any = {}) {
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
      
      if (error) throw error;

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

      const libroMayorCompleto = Object.values(cuentasAgrupadas).map((cuenta: any) => ({
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
    } catch (error) {
      console.error('❌ Error generando Libro Mayor completo:', error);
      throw error;
    }
  }

  async getRegistroVentas(filtros: any = {}) {
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
      
      if (error) throw error;

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
        if (!acc.porTipo[tipo]) acc.porTipo[tipo] = { cantidad: 0, total: 0 };
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
    } catch (error) {
      console.error('❌ Error obteniendo Registro de Ventas:', error);
      throw error;
    }
  }

  private getTipoComprobanteTexto(codigo: string): string {
    const tipos = {
      '01': 'FACTURA',
      '03': 'BOLETA DE VENTA',
      '07': 'NOTA DE CRÉDITO',
      '08': 'NOTA DE DÉBITO'
    };
    return tipos[codigo] || codigo;
  }

  private calcularBaseImponible(venta: any): number {
    if (venta.incluye_igv) {
      return venta.total / 1.18;
    }
    return venta.subtotal || (venta.total - this.calcularIGV(venta));
  }

  private calcularIGV(venta: any): number {
    if (venta.igv !== undefined) {
      return venta.igv;
    }
    
    const baseImponible = this.calcularBaseImponible(venta);
    return baseImponible * 0.18;
  }

  async procesarAsientoPlanilla(planilla: PlanillaCalculadaEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento contable para planilla ${planilla.periodo}`);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString(),
        concepto: `Planilla de sueldos ${planilla.periodo}`,
        referencia: `PLANILLA-${planilla.planillaId}`,
        detalles: [
          {
            cuentaId: await this.getCuentaId('621'),
            cuentaCodigo: '621',
            cuentaNombre: 'Remuneraciones',
            debe: planilla.totalIngresos,
            haber: 0,
            descripcion: `Sueldos y salarios ${planilla.periodo}`
          },
          {
            cuentaId: await this.getCuentaId('627'),
            cuentaCodigo: '627',
            cuentaNombre: 'Seguridad y Previsión Social',
            debe: planilla.totalAportes,
            haber: 0,
            descripcion: `ESSALUD y aportes empleador ${planilla.periodo}`
          },
          {
            cuentaId: await this.getCuentaId('411'),
            cuentaCodigo: '411',
            cuentaNombre: 'Remuneraciones por Pagar',
            debe: 0,
            haber: planilla.totalNeto,
            descripcion: `Neto a pagar empleados ${planilla.periodo}`
          },
          {
            cuentaId: await this.getCuentaId('403'),
            cuentaCodigo: '403',
            cuentaNombre: 'Instituciones Públicas',
            debe: 0,
            haber: planilla.totalDescuentos,
            descripcion: `AFP/ONP y descuentos ${planilla.periodo}`
          },
          {
            cuentaId: await this.getCuentaId('407'),
            cuentaCodigo: '407',
            cuentaNombre: 'Administradoras de Fondos',
            debe: 0,
            haber: planilla.totalAportes,
            descripcion: `ESSALUD por pagar ${planilla.periodo}`
          }
        ]
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error generando asiento de planilla:', error);
      return null;
    }
  }

  async procesarAsientoPagoPlanilla(pago: PlanillaPagadaEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento de pago de planilla ${pago.periodo} - ${pago.cantidadEmpleados} empleados`);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString(),
        concepto: `Pago planilla ${pago.periodo} - ${pago.cantidadEmpleados} empleados`,
        referencia: `PAGO-PLANILLA-${pago.planillaId}`,
        detalles: [
          {
            cuentaId: await this.getCuentaId('411'),
            cuentaCodigo: '411',
            cuentaNombre: 'Remuneraciones por Pagar',
            debe: pago.totalPagado,
            haber: 0,
            descripcion: `Cancelación sueldos ${pago.periodo} - ${pago.cantidadEmpleados} empleados`
          },
          {
            cuentaId: pago.metodoPago === 'efectivo' ? await this.getCuentaId('101') : await this.getCuentaId('104'),
            cuentaCodigo: pago.metodoPago === 'efectivo' ? '101' : '104',
            cuentaNombre: pago.metodoPago === 'efectivo' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
            debe: 0,
            haber: pago.totalPagado,
            descripcion: `Pago planilla por ${pago.metodoPago} ${pago.periodo} - ${pago.cantidadEmpleados} empleados`
          }
        ]
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error generando asiento de pago de planilla:', error);
      return null;
    }
  }

  async procesarAsientoPagoFactura(pago: PagoFacturaEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento de cobro de factura ${pago.numeroFactura}`);

      const asiento: AsientoContable = {
        fecha: new Date().toISOString(),
        concepto: `Cobro factura ${pago.numeroFactura}`,
        referencia: `COBRO-${pago.facturaId}`,
        detalles: [
          {
            cuentaId: pago.metodoPago === 'EFECTIVO' ? await this.getCuentaId('101') : await this.getCuentaId('104'),
            cuentaCodigo: pago.metodoPago === 'EFECTIVO' ? '101' : '104',
            cuentaNombre: pago.metodoPago === 'EFECTIVO' ? 'Caja' : 'Cuentas Corrientes en Instituciones Financieras',
            debe: pago.montoPagado,
            haber: 0,
            descripcion: `Cobro factura ${pago.numeroFactura} por ${pago.metodoPago}`
          },
          {
            cuentaId: await this.getCuentaId('122'),
            cuentaCodigo: '122',
            cuentaNombre: 'Cuentas por Cobrar Comerciales - Terceros',
            debe: 0,
            haber: pago.montoPagado,
            descripcion: `Cobro cliente factura ${pago.numeroFactura}`
          }
        ]
      };

      return await this.guardarAsientoContable(asiento);
    } catch (error) {
      console.error('❌ Error generando asiento de cobro de factura:', error);
      return null;
    }
  }

  async procesarAsientoGasto(gasto: GastoRegistradoEvent): Promise<string | null> {
    try {
      console.log(`📚 Generando asiento de gasto: ${gasto.concepto}`);

      const cuentaGasto = await this.determinarCuentaGasto(gasto.categoria);

      const asiento: AsientoContable = {
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
            cuentaId: gasto.metodoPago === 'EFECTIVO' ? await this.getCuentaId('101') : 
                     gasto.metodoPago === 'TRANSFERENCIA' ? await this.getCuentaId('104') : await this.getCuentaId('421'),
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
    } catch (error) {
      console.error('❌ Error generando asiento de gasto:', error);
      return null;
    }
  }

  private async determinarCuentaGasto(categoria: string): Promise<{ id: string, codigo: string, nombre: string }> {
    const categoriasGasto = {
      'SUMINISTROS': { codigo: '659', nombre: 'Otros Gastos de Gestión' },
      'SERVICIOS': { codigo: '634', nombre: 'Mantenimiento y Reparaciones' },
      'TRANSPORTE': { codigo: '659', nombre: 'Otros Gastos de Gestión' },
      'PUBLICIDAD': { codigo: '637', nombre: 'Publicidad, Publicaciones, Relaciones Públicas' },
      'MANTENIMIENTO': { codigo: '634', nombre: 'Mantenimiento y Reparaciones' },
      'ALQUILER': { codigo: '659', nombre: 'Otros Gastos de Gestión' },
      'OTROS': { codigo: '659', nombre: 'Otros Gastos de Gestión' }
    };

    const cuentaInfo = categoriasGasto[categoria] || categoriasGasto['OTROS'];
    const cuentaId = await this.getCuentaId(cuentaInfo.codigo);
    
    return {
      id: cuentaId,
      codigo: cuentaInfo.codigo,
      nombre: cuentaInfo.nombre
    };
  }
} 