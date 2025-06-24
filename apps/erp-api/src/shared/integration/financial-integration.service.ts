import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService, VentaProcessedEvent, ComprobanteCreadoEvent, MovimientoStockEvent, CompraEntregadaEvent } from '../events/event-bus.service';

export interface KPIFinanciero {
  efectivoDisponible: number;
  ventasUltimos30dias: number;
  gastosUltimos30dias: number;
  utilidadUltimos30dias: number;
  cuentasPorCobrar: number;
  cuentasPorPagar: number;
  rotacionInventario: number;
  margenBruto: number;
  liquidez: string;
  rentabilidad: string;
  crecimiento: string;
}

export interface CuentaPorCobrar {
  id: string;
  cpeId: string;
  clienteId: string;
  clienteNombre: string;
  numeroDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoOriginal: number;
  saldoPendiente: number;
  diasVencidos: number;
  estado: 'VIGENTE' | 'VENCIDA' | 'EN_COBRANZA' | 'COBRADA';
}

export interface AlertaFinanciera {
  tipo: 'CRITICA' | 'ADVERTENCIA' | 'INFO';
  titulo: string;
  mensaje: string;
  accion?: string;
  valor?: number;
}

@Injectable()
export class FinancialIntegrationService {
  private kpisCache: KPIFinanciero | null = null;
  private lastKPIUpdate: Date | null = null;
  private cacheValidityMinutes = 5;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService
  ) {
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    console.log('💰 [Finanzas] Inicializando listeners de eventos...');
    
    this.eventBus.onVentaProcessed(async (event) => {
      console.log('💰 [Finanzas] Procesando venta para KPIs...');
      await this.procesarVentaParaFinanzas(event.data);
    });

    this.eventBus.onComprobanteCreadoEvent(async (event) => {
      console.log('💰 [Finanzas] Procesando comprobante para cuentas por cobrar...');
      await this.procesarComprobanteParaFinanzas(event.data);
    });

    this.eventBus.onMovimientoStock(async (event) => {
      console.log('💰 [Finanzas] Actualizando KPIs por movimiento de inventario...');
      await this.invalidarCacheKPIs();
    });

    this.eventBus.onCompraEntregada(async (event) => {
      console.log('💰 [Finanzas] Procesando compra entregada para KPIs...');
      await this.procesarCompraParaFinanzas(event.data);
    });
  }

  async procesarVentaParaFinanzas(venta: VentaProcessedEvent): Promise<void> {
    try {
      // Actualizar efectivo disponible
      await this.actualizarEfectivoDisponible(venta.total, venta.metodoPago);
      
      // Invalidar cache de KPIs para recalcular
      await this.invalidarCacheKPIs();
      
      // Generar alertas si es necesario
      await this.verificarAlertas();
      
      console.log(`✅ Finanzas actualizadas para venta ${venta.numeroTicket}`);
    } catch (error) {
      console.error('❌ Error procesando venta para finanzas:', error);
    }
  }

  async procesarComprobanteParaFinanzas(comprobante: ComprobanteCreadoEvent): Promise<void> {
    try {
      // Si es factura a crédito, crear cuenta por cobrar
      if (comprobante.esCredito && comprobante.tipoDocumento === '01') {
        await this.crearCuentaPorCobrar(comprobante);
      }
      
      console.log(`✅ Comprobante ${comprobante.serie}-${comprobante.numero} procesado para finanzas`);
    } catch (error) {
      console.error('❌ Error procesando comprobante para finanzas:', error);
    }
  }

  async procesarCompraParaFinanzas(compra: CompraEntregadaEvent): Promise<void> {
    try {
      console.log(`💰 Procesando compra ${compra.numeroOrden} para finanzas`);

      // Crear cuenta por pagar por la compra
      await this.crearCuentaPorPagar(compra);

      // Invalidar cache de KPIs para recalcular con nueva compra
      await this.invalidarCacheKPIs();

      console.log(`✅ Compra ${compra.numeroOrden} procesada para finanzas`);
    } catch (error) {
      console.error('❌ Error procesando compra para finanzas:', error);
    }
  }

  async getKPIsFinancieros(): Promise<KPIFinanciero> {
    // Verificar cache
    if (this.kpisCache && this.lastKPIUpdate && 
        (new Date().getTime() - this.lastKPIUpdate.getTime()) < (this.cacheValidityMinutes * 60 * 1000)) {
      console.log('💰 Retornando KPIs desde cache');
      return this.kpisCache;
    }

    console.log('💰 Calculando KPIs financieros en tiempo real...');
    
    const [
      efectivo,
      ventas30dias,
      gastos30dias,
      cuentasPorCobrar,
      cuentasPorPagar,
      inventario
    ] = await Promise.all([
      this.calcularEfectivoDisponible(),
      this.calcularVentas30Dias(),
      this.calcularGastos30Dias(),
      this.calcularCuentasPorCobrar(),
      this.calcularCuentasPorPagar(),
      this.calcularValorInventario()
    ]);

    const utilidad30dias = ventas30dias - gastos30dias;
    const margenBruto = ventas30dias > 0 ? ((utilidad30dias / ventas30dias) * 100) : 0;
    const rotacionInventario = inventario > 0 ? (gastos30dias / inventario) : 0;

    this.kpisCache = {
      efectivoDisponible: efectivo,
      ventasUltimos30dias: ventas30dias,
      gastosUltimos30dias: gastos30dias,
      utilidadUltimos30dias: utilidad30dias,
      cuentasPorCobrar,
      cuentasPorPagar,
      rotacionInventario,
      margenBruto,
      liquidez: this.evaluarLiquidez(efectivo, cuentasPorPagar),
      rentabilidad: this.evaluarRentabilidad(margenBruto),
      crecimiento: await this.evaluarCrecimiento()
    };

    this.lastKPIUpdate = new Date();
    return this.kpisCache;
  }

  private async calcularEfectivoDisponible(): Promise<number> {
    try {
      // Sumar ventas en efectivo de los últimos días
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 30);

      const { data: ventas } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('total, metodo_pago')
        .eq('metodo_pago', 'EFECTIVO')
        .gte('fecha', fechaInicio.toISOString());

      return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando efectivo:', error);
      return 0;
    }
  }

  private async calcularVentas30Dias(): Promise<number> {
    try {
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 30);

      const { data: ventas } = await this.supabase.getClient()
        .from('ventas_pos')
        .select('total')
        .gte('fecha', fechaInicio.toISOString());

      return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando ventas 30 días:', error);
      return 0;
    }
  }

  private async calcularGastos30Dias(): Promise<number> {
    try {
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - 30);

      // Sumar asientos de gastos (cuentas 6xx)
      const { data: gastos } = await this.supabase.getClient()
        .from('detalle_asientos')
        .select('debe')
        .gte('created_at', fechaInicio.toISOString());

      return gastos?.reduce((sum, gasto) => sum + parseFloat(gasto.debe || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando gastos 30 días:', error);
      return 0;
    }
  }

  private async calcularCuentasPorCobrar(): Promise<number> {
    try {
      const { data: cuentas } = await this.supabase.getClient()
        .from('cuentas_por_cobrar')
        .select('saldo_pendiente')
        .neq('estado', 'COBRADA');

      return cuentas?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando cuentas por cobrar:', error);
      return 0;
    }
  }

  private async calcularCuentasPorPagar(): Promise<number> {
    try {
      const { data: cuentas } = await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .select('saldo_pendiente')
        .neq('estado', 'PAGADA');

      return cuentas?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando cuentas por pagar:', error);
      return 0;
    }
  }

  private async calcularValorInventario(): Promise<number> {
    try {
      const { data: productos } = await this.supabase.getClient()
        .from('productos')
        .select('precio, stock');

      return productos?.reduce((sum, producto) => {
        const precio = parseFloat(producto.precio || 0);
        const stock = parseFloat(producto.stock || 0);
        return sum + (precio * stock);
      }, 0) || 0;
    } catch (error) {
      console.error('❌ Error calculando valor inventario:', error);
      return 0;
    }
  }

  private evaluarLiquidez(efectivo: number, cuentasPorPagar: number): string {
    if (cuentasPorPagar === 0) return 'EXCELENTE';
    const ratio = efectivo / cuentasPorPagar;
    if (ratio >= 2) return 'EXCELENTE';
    if (ratio >= 1.5) return 'BUENA';
    if (ratio >= 1) return 'REGULAR';
    if (ratio >= 0.5) return 'MALA';
    return 'CRITICA';
  }

  private evaluarRentabilidad(margenBruto: number): string {
    if (margenBruto >= 40) return 'EXCELENTE';
    if (margenBruto >= 25) return 'BUENA';
    if (margenBruto >= 15) return 'REGULAR';
    if (margenBruto >= 5) return 'MALA';
    return 'CRITICA';
  }

  private async evaluarCrecimiento(): Promise<string> {
    try {
      const fechaActual = new Date();
      const fechaAnterior = new Date();
      fechaAnterior.setDate(fechaAnterior.getDate() - 60);
      fechaActual.setDate(fechaActual.getDate() - 30);

      const [ventasActuales, ventasAnteriores] = await Promise.all([
        this.calcularVentasPeriodo(fechaActual, new Date()),
        this.calcularVentasPeriodo(fechaAnterior, fechaActual)
      ]);

      if (ventasAnteriores === 0) return 'ESTABLE';
      const crecimiento = ((ventasActuales - ventasAnteriores) / ventasAnteriores) * 100;
      
      if (crecimiento >= 10) return 'POSITIVO';
      if (crecimiento >= -5) return 'ESTABLE';
      return 'NEGATIVO';
    } catch (error) {
      console.error('❌ Error evaluando crecimiento:', error);
      return 'ESTABLE';
    }
  }

  private async calcularVentasPeriodo(fechaInicio: Date, fechaFin: Date): Promise<number> {
    const { data: ventas } = await this.supabase.getClient()
      .from('ventas_pos')
      .select('total')
      .gte('fecha', fechaInicio.toISOString())
      .lte('fecha', fechaFin.toISOString());

    return ventas?.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0) || 0;
  }

  private async crearCuentaPorCobrar(comprobante: ComprobanteCreadoEvent): Promise<void> {
    try {
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30); // 30 días crédito por defecto

      await this.supabase.getClient()
        .from('cuentas_por_cobrar')
        .insert({
          cpe_id: comprobante.cpeId,
          cliente_id: comprobante.clienteId,
          numero_documento: `${comprobante.serie}-${comprobante.numero}`,
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: fechaVencimiento.toISOString(),
          monto_original: comprobante.total,
          saldo_pendiente: comprobante.total,
          estado: 'VIGENTE',
          created_at: new Date().toISOString()
        });

      console.log(`✅ Cuenta por cobrar creada para ${comprobante.serie}-${comprobante.numero}`);
    } catch (error) {
      console.error('❌ Error creando cuenta por cobrar:', error);
    }
  }

  private async crearCuentaPorPagar(compra: CompraEntregadaEvent): Promise<void> {
    try {
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30); // 30 días plazo por defecto

      await this.supabase.getClient()
        .from('cuentas_por_pagar')
        .insert({
          orden_id: compra.ordenId,
          proveedor_id: compra.proveedorId,
          numero_documento: compra.numeroOrden,
          fecha_emision: new Date().toISOString(),
          fecha_vencimiento: fechaVencimiento.toISOString(),
          monto_original: compra.total,
          saldo_pendiente: compra.total,
          estado: 'VIGENTE',
          created_at: new Date().toISOString()
        });

      console.log(`✅ Cuenta por pagar creada para compra ${compra.numeroOrden}`);
    } catch (error) {
      console.error('❌ Error creando cuenta por pagar:', error);
      // No fallar si la tabla no existe aún, es opcional
    }
  }

  private async actualizarEfectivoDisponible(monto: number, metodoPago: string): Promise<void> {
    if (metodoPago === 'EFECTIVO') {
      // Aquí podrías actualizar una tabla de control de efectivo si existe
      console.log(`💰 Efectivo incrementado en ${monto}`);
    }
  }

  private async invalidarCacheKPIs(): Promise<void> {
    this.kpisCache = null;
    this.lastKPIUpdate = null;
    console.log('🔄 Cache de KPIs invalidado');
  }

  private async verificarAlertas(): Promise<AlertaFinanciera[]> {
    const alertas: AlertaFinanciera[] = [];
    const kpis = await this.getKPIsFinancieros();

    // Alerta de liquidez crítica
    if (kpis.liquidez === 'CRITICA') {
      alertas.push({
        tipo: 'CRITICA',
        titulo: 'Liquidez Crítica',
        mensaje: 'El efectivo disponible es insuficiente para cubrir las obligaciones',
        accion: 'Gestionar cobranzas urgentes',
        valor: kpis.efectivoDisponible
      });
    }

    // Alerta de rentabilidad baja
    if (kpis.rentabilidad === 'MALA' || kpis.rentabilidad === 'CRITICA') {
      alertas.push({
        tipo: 'ADVERTENCIA',
        titulo: 'Rentabilidad Baja',
        mensaje: 'Los márgenes de ganancia están por debajo del objetivo',
        accion: 'Revisar precios y costos',
        valor: kpis.margenBruto
      });
    }

    // Alerta de cuentas por cobrar altas
    if (kpis.cuentasPorCobrar > kpis.ventasUltimos30dias * 0.5) {
      alertas.push({
        tipo: 'ADVERTENCIA',
        titulo: 'Cuentas por Cobrar Elevadas',
        mensaje: 'Las cuentas por cobrar superan el 50% de las ventas mensuales',
        accion: 'Intensificar gestión de cobranza',
        valor: kpis.cuentasPorCobrar
      });
    }

    return alertas;
  }

  async getCuentasPorCobrarDetalladas(): Promise<CuentaPorCobrar[]> {
    try {
      const { data: cuentas } = await this.supabase.getClient()
        .from('cuentas_por_cobrar')
        .select(`
          *,
          cpe (serie, numero, razon_social_receptor)
        `)
        .neq('estado', 'COBRADA')
        .order('fecha_vencimiento');

      return cuentas?.map(cuenta => ({
        id: cuenta.id,
        cpeId: cuenta.cpe_id,
        clienteId: cuenta.cliente_id,
        clienteNombre: cuenta.cpe?.razon_social_receptor || 'Cliente',
        numeroDocumento: cuenta.numero_documento,
        fechaEmision: cuenta.fecha_emision,
        fechaVencimiento: cuenta.fecha_vencimiento,
        montoOriginal: parseFloat(cuenta.monto_original),
        saldoPendiente: parseFloat(cuenta.saldo_pendiente),
        diasVencidos: this.calcularDiasVencidos(cuenta.fecha_vencimiento),
        estado: cuenta.estado
      })) || [];
    } catch (error) {
      console.error('❌ Error obteniendo cuentas por cobrar:', error);
      return [];
    }
  }

  private calcularDiasVencidos(fechaVencimiento: string): number {
    const hoy = new Date();
    const vencimiento = new Date(fechaVencimiento);
    const diffTime = hoy.getTime() - vencimiento.getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  async getAlertas(): Promise<AlertaFinanciera[]> {
    return await this.verificarAlertas();
  }
} 