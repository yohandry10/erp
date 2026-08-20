import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EventBusService } from '../events/event-bus.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export interface KPIsFinancieros {
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

export interface DatosHistoricos {
  ventasMensuales: Array<{
    mes: string;
    anio: number;
    ventas: number;
    gastos: number;
    utilidad: number;
  }>;
  gastosMensuales: Array<{
    mes: string;
    categoria: string;
    monto: number;
  }>;
  utilidadMensual: Array<{
    mes: string;
    anio: number;
    utilidad: number;
    margen: number;
  }>;
}

export interface ProyeccionFlujoEfectivo {
  meses: Array<{
    mes: string;
    anio: number;
    ingresos: number;
    egresos: number;
    saldoNeto: number;
    saldoAcumulado: number;
  }>;
  recomendaciones: string[];
  escenarios: {
    optimista: Array<any>;
    realista: Array<any>;
    pesimista: Array<any>;
  };
}

export interface AnalisisCredito {
  capacidadPago: {
    ingresosMensuales: number;
    gastosFijos: number;
    gastosPorcentaje: number;
    capacidadDisponible: number;
    recomendacionMaxima: number;
  };
  puntuacion: {
    liquidez: number;
    rentabilidad: number;
    historialPagos: number;
    estabilidad: number;
    puntuacionTotal: number;
  };
  recomendacion: 'RECOMENDAR' | 'ANALIZAR' | 'NO_RECOMENDAR';
  justificacion: string;
  documentosNecesarios: string[];
}

@Injectable()
export class FinancialIntegrationService {
  private kpisCache: KPIsFinancieros | null = null;
  private lastKPIUpdate: Date | null = null;
  private cacheValidityMinutes = 5;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.initializeEventListeners();
  }
  private resolveTenantId(tenantId?: string): string {
    const contextTenant = tenantId ?? this.tenantContext.getTenantId();
    if (!contextTenant) {
      // HARDENING: toda consulta financiera requiere tenant definido.
      throw new BadRequestException('Tenant requerido para métricas financieras');
    }
    return contextTenant;
  }

  private initializeEventListeners() {
    console.log('💰 [Finanzas] Inicializando listeners de eventos...');

    this.eventBus.onVentaProcessed(async (event) => {
      console.log('💰 [Finanzas] Procesando venta para KPIs...');
      await this.procesarVentaParaFinanzas(event.data);
    });

    this.eventBus.onCompraEntregada(async (event) => {
      console.log('💰 [Finanzas] Procesando compra entregada para KPIs...');
      await this.procesarCompraParaFinanzas(event.data);
    });

    this.eventBus.onRecepcionRegistrada(async (event) => {
      console.log('💰 [Finanzas] Procesando recepcion registrada para KPIs...');
      await this.procesarCompraParaFinanzas(event.data);
    });

    this.eventBus.onGastoRegistrado(async (event) => {
      console.log('💰 [Finanzas] Procesando gasto registrado para KPIs...');
      await this.procesarGastoParaFinanzas(event.data);
    });

    this.eventBus.onPagoFactura(async (event) => {
      console.log('💰 [Finanzas] Procesando pago de factura para flujo de efectivo...');
      await this.procesarPagoFacturaParaFinanzas(event.data);
    });
  }

  // 📊 CONSULTAS HISTÓRICAS COMPLETAS
  async getDatosHistoricosCompleto(tenantId?: string): Promise<DatosHistoricos> {
    const currentTenantId = this.resolveTenantId(tenantId);
    // ✅ MULTI-TENANT: Pasar tenant a funciones
    try {
      const [ventasMensuales, gastosMensuales, utilidadMensual] = await Promise.all([
        this.obtenerVentasMensuales(currentTenantId),
        this.obtenerGastosMensuales(currentTenantId),
        this.obtenerUtilidadMensual(currentTenantId),
      ]);

      return {
        ventasMensuales,
        gastosMensuales,
        utilidadMensual
      };
    } catch (error) {
      console.error('❌ Error obteniendo datos históricos:', error);
      return {
        ventasMensuales: [],
        gastosMensuales: [],
        utilidadMensual: []
      };
    }
  }

  // 📊 MÉTODO ALTERNATIVO CON SQL NATIVO (MEJOR RENDIMIENTO)
  async getDatosHistoricosSQL(): Promise<DatosHistoricos> {
    try {
      // Usar consulta SQL nativa para mejor rendimiento
      const { data: resumenMensual } = await this.supabase.getClient()
        .rpc('get_resumen_financiero_mensual');

      if (!resumenMensual) {
        return {
          ventasMensuales: [],
          gastosMensuales: [],
          utilidadMensual: []
        };
      }

      const ventasMensuales = resumenMensual.map((item: any) => ({
        mes: new Date(item.periodo + '-01').toLocaleString('es-ES', { month: 'long' }),
        anio: parseInt(item.periodo.split('-')[0]),
        ventas: parseFloat(item.ventas || '0'),
        gastos: parseFloat(item.gastos || '0'),
        utilidad: parseFloat(item.utilidad || '0')
      }));

      const gastosMensuales = resumenMensual.map((item: any) => ({
        mes: new Date(item.periodo + '-01').toLocaleString('es-ES', { month: 'long' }),
        categoria: 'General', // Se puede expandir con más detalle
        monto: parseFloat(item.gastos || '0')
      }));

      const utilidadMensual = resumenMensual.map((item: any) => ({
        mes: new Date(item.periodo + '-01').toLocaleString('es-ES', { month: 'long' }),
        anio: parseInt(item.periodo.split('-')[0]),
        utilidad: parseFloat(item.utilidad || '0'),
        margen: parseFloat(item.margen_porcentaje || '0')
      }));

      return {
        ventasMensuales,
        gastosMensuales,
        utilidadMensual
      };
    } catch (error) {
      console.error('❌ Error obteniendo datos históricos con SQL:', error);
      // Fallback al método original
      return this.getDatosHistoricosCompleto();
    }
  }

  private async obtenerVentasMensuales(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    // `ventas` es tabla muerta; las ventas reales viven en `documentos` (comprobantes emitidos).
    const { data } = await this.supabase.getClient()
      .from('documentos')
      .select('total, fecha:fecha_emision')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .gte('fecha_emision', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")')
      .order('fecha_emision', { ascending: true });

    const ventasPorMes = new Map();
    data?.forEach(venta => {
      const fecha = new Date(venta.fecha);
      const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!ventasPorMes.has(periodo)) {
        ventasPorMes.set(periodo, {
          mes: fecha.toLocaleString('es-ES', { month: 'long' }),
          anio: fecha.getFullYear(),
          ventas: 0,
          gastos: 0,
          utilidad: 0
        });
      }
      ventasPorMes.get(periodo).ventas += parseFloat(venta.total || '0');
    });

    return Array.from(ventasPorMes.values());
  }

  private async obtenerGastosMensuales(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('gastos')
      .select('monto, categoria, fecha')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .gte('fecha', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order('fecha', { ascending: true });

    const gastosPorMes = new Map();
    data?.forEach(gasto => {
      const fecha = new Date(gasto.fecha);
      const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!gastosPorMes.has(periodo)) {
        gastosPorMes.set(periodo, {
          mes: fecha.toLocaleString('es-ES', { month: 'long' }),
          categoria: gasto.categoria,
          monto: 0
        });
      }
      gastosPorMes.get(periodo).monto += parseFloat(gasto.monto || '0');
    });

    return Array.from(gastosPorMes.values());
  }

  private async obtenerUtilidadMensual(tenantId?: string) {
    // ✅ MULTI-TENANT: Pasar tenant a funciones
    const ventas = await this.obtenerVentasMensuales(tenantId);
    const gastos = await this.obtenerGastosMensuales(tenantId);

    const utilidadMap = new Map();
    ventas.forEach(v => {
      const key = `${v.anio}-${v.mes}`;
      if (!utilidadMap.has(key)) {
        utilidadMap.set(key, {
          mes: v.mes,
          anio: v.anio,
          utilidad: 0,
          ventas: 0
        });
      }
      utilidadMap.get(key).ventas += v.ventas;
    });

    gastos.forEach(g => {
      const key = `${g.anio}-${g.mes}`;
      if (utilidadMap.has(key)) {
        utilidadMap.get(key).utilidad -= g.monto;
      }
    });

    return Array.from(utilidadMap.values()).map(u => ({
      ...u,
      utilidad: u.ventas - Math.abs(u.utilidad),
      margen: u.ventas > 0 ? ((u.utilidad / u.ventas) * 100) : 0
    }));
  }

  // 💰 FLUJO DE EFECTIVO PROYECTADO
  async getFlujoProyectado(meses = 12): Promise<ProyeccionFlujoEfectivo> {
    try {
      const datosHistoricos = await this.getDatosHistoricosCompleto();
      const promedioVentas = this.calcularPromedio(datosHistoricos.ventasMensuales.map(v => v.ventas));
      const promedioGastos = this.calcularPromedio(datosHistoricos.gastosMensuales.map(g => g.monto));

      const proyeccion = [];
      let saldoAcumulado = await this.calcularEfectivoDisponible();

      for (let i = 1; i <= meses; i++) {
        const fecha = new Date();
        fecha.setMonth(fecha.getMonth() + i);

        // Sin ruido aleatorio. El promedio histórico ya es la mejor estimación
        // central disponible, y `generarEscenarios` expresa la incertidumbre con
        // bandas explícitas (optimista +20 %/-10 %, pesimista -20 %/+10 %).
        // Sumar un ±10 % al azar no añadía información: sólo hacía que la misma
        // proyección cambiara en cada recarga, de modo que dos personas mirando la
        // pantalla a la vez veían cifras distintas y ninguna era reproducible.
        const ingresos = promedioVentas;
        const egresos = promedioGastos;
        const saldoNeto = ingresos - egresos;
        saldoAcumulado += saldoNeto;

        proyeccion.push({
          mes: fecha.toLocaleString('es-ES', { month: 'long' }),
          anio: fecha.getFullYear(),
          ingresos: Math.round(ingresos * 100) / 100,
          egresos: Math.round(egresos * 100) / 100,
          saldoNeto: Math.round(saldoNeto * 100) / 100,
          saldoAcumulado: Math.round(saldoAcumulado * 100) / 100
        });
      }

      const recomendaciones = this.generarRecomendacionesFlujo(proyeccion);
      const escenarios = this.generarEscenarios(proyeccion);

      return {
        meses: proyeccion,
        recomendaciones,
        escenarios
      };
    } catch (error) {
      console.error('❌ Error calculando flujo proyectado:', error);
      return {
        meses: [],
        recomendaciones: ['Error en cálculos'],
        escenarios: { optimista: [], realista: [], pesimista: [] }
      };
    }
  }

  private calcularPromedio(valores: number[]): number {
    if (valores.length === 0) return 0;
    return valores.reduce((sum, val) => sum + val, 0) / valores.length;
  }

  private generarRecomendacionesFlujo(proyeccion: any[]): string[] {
    const recomendaciones: string[] = [];
    
    const mesesNegativos = proyeccion.filter(p => p.saldoNeto < 0).length;
    if (mesesNegativos > 0) {
      recomendaciones.push(`⚠️ Se proyectan ${mesesNegativos} meses con flujo negativo. Considere reducir gastos o aumentar ingresos.`);
    }

    const saldoMinimo = Math.min(...proyeccion.map(p => p.saldoAcumulado));
    if (saldoMinimo < 0) {
      recomendaciones.push('🔴 Se proyecta déficit acumulado. Necesita financiamiento adicional.');
    }

    const saldoFinal = proyeccion[proyeccion.length - 1]?.saldoAcumulado || 0;
    if (saldoFinal > 0) {
      recomendaciones.push('✅ Proyección positiva. Considere inversiones para crecimiento.');
    }

    return recomendaciones;
  }

  private generarEscenarios(proyeccion: any[]) {
    return {
      optimista: proyeccion.map(p => ({ ...p, ingresos: p.ingresos * 1.2, egresos: p.egresos * 0.9 })),
      realista: proyeccion,
      pesimista: proyeccion.map(p => ({ ...p, ingresos: p.ingresos * 0.8, egresos: p.egresos * 1.1 }))
    };
  }

  // 📊 ANÁLISIS DE CRÉDITO REAL
  async getAnalisisCredito(solicitudData: {
    montoSolicitado: number;
    plazoMeses: number;
    ingresosMensuales: number;
    historialCrediticio: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO';
  }): Promise<AnalisisCredito> {
    try {
      const kpis = await this.getKPIsFinancieros();
      
      // Cálculo de capacidad de pago
      const gastosFijos = kpis.gastosUltimos30dias;
      const capacidadDisponible = kpis.utilidadUltimos30dias;
      const gastosPorcentaje = (gastosFijos / kpis.ventasUltimos30dias) * 100;
      
      const pagoMensual = solicitudData.montoSolicitado / solicitudData.plazoMeses;
      const ratioEndeudamiento = (pagoMensual / capacidadDisponible) * 100;
      
      // Puntuación crediticia
      const puntuacion = {
        liquidez: this.calcularPuntuacionLiquidez(kpis.efectivoDisponible, kpis.cuentasPorPagar),
        rentabilidad: this.calcularPuntuacionRentabilidad(kpis.margenBruto),
        historialPagos: this.calcularPuntuacionHistorial(solicitudData.historialCrediticio),
        estabilidad: this.calcularPuntuacionEstabilidad(kpis.crecimiento),
        puntuacionTotal: 0
      };
      
      puntuacion.puntuacionTotal = (
        puntuacion.liquidez * 0.25 +
        puntuacion.rentabilidad * 0.25 +
        puntuacion.historialPagos * 0.30 +
        puntuacion.estabilidad * 0.20
      );

      // Determinar recomendación
      let recomendacion: AnalisisCredito['recomendacion'];
      let justificacion = '';

      if (puntuacion.puntuacionTotal >= 80 && ratioEndeudamiento <= 30) {
        recomendacion = 'RECOMENDAR';
        justificacion = 'Perfil financiero excelente y capacidad de pago adecuada';
      } else if (puntuacion.puntuacionTotal >= 60 && ratioEndeudamiento <= 50) {
        recomendacion = 'ANALIZAR';
        justificacion = 'Perfil aceptable pero requiere revisión adicional';
      } else {
        recomendacion = 'NO_RECOMENDAR';
        justificacion = 'Riesgo elevado o capacidad de pago insuficiente';
      }

      return {
        capacidadPago: {
          ingresosMensuales: kpis.ventasUltimos30dias,
          gastosFijos,
          gastosPorcentaje,
          capacidadDisponible,
          recomendacionMaxima: Math.round(capacidadDisponible * 0.3)
        },
        puntuacion,
        recomendacion,
        justificacion,
        documentosNecesarios: [
          'Estados financieros últimos 3 meses',
          'Declaración de impuestos',
          'Estado de cuenta bancario',
          'Referencias comerciales'
        ]
      };
    } catch (error) {
      console.error('❌ Error en análisis de crédito:', error);
      return {
        capacidadPago: {
          ingresosMensuales: 0,
          gastosFijos: 0,
          gastosPorcentaje: 0,
          capacidadDisponible: 0,
          recomendacionMaxima: 0
        },
        puntuacion: {
          liquidez: 0,
          rentabilidad: 0,
          historialPagos: 0,
          estabilidad: 0,
          puntuacionTotal: 0
        },
        recomendacion: 'ANALIZAR',
        justificacion: 'Error en el análisis',
        documentosNecesarios: []
      };
    }
  }

  private calcularPuntuacionLiquidez(efectivo: number, cuentasPorPagar: number): number {
    const ratio = cuentasPorPagar > 0 ? efectivo / cuentasPorPagar : 999;
    if (ratio >= 2) return 100;
    if (ratio >= 1.5) return 80;
    if (ratio >= 1) return 60;
    if (ratio >= 0.5) return 40;
    return 20;
  }

  private calcularPuntuacionRentabilidad(margen: number): number {
    if (margen >= 40) return 100;
    if (margen >= 25) return 80;
    if (margen >= 15) return 60;
    if (margen >= 5) return 40;
    return 20;
  }

  private calcularPuntuacionHistorial(historial: string): number {
    switch (historial) {
      case 'EXCELENTE': return 100;
      case 'BUENO': return 80;
      case 'REGULAR': return 60;
      case 'MALO': return 30;
      default: return 50;
    }
  }

  private calcularPuntuacionEstabilidad(crecimiento: string): number {
    switch (crecimiento) {
      case 'POSITIVO': return 100;
      case 'ESTABLE': return 80;
      case 'NEGATIVO': return 40;
      default: return 60;
    }
  }

  // 🔧 MÉTODOS EXISTENTES MEJORADOS
  async getKPIsFinancieros(tenantId?: string): Promise<KPIsFinancieros> {
    // ✅ MULTI-TENANT: Agregar tenant_id
    // Nota: El caché debería ser por tenant en producción
    if (this.kpisCache && this.lastKPIUpdate &&
        (new Date().getTime() - this.lastKPIUpdate.getTime()) < (this.cacheValidityMinutes * 60 * 1000)) {
      console.log('💰 Retornando KPIs desde cache');
      return this.kpisCache;
    }

    console.log('💰 Calculando KPIs financieros en tiempo real...');
    
    try {
      // Intentar usar función SQL optimizada primero
      const { data: kpisData } = await this.supabase.getClient()
        .rpc('get_kpis_financieros');

      if (kpisData && kpisData.length > 0) {
        const kpi = kpisData[0];
        const rotacionInventario = kpi.valor_inventario > 0 ? (kpi.gastos_30_dias / kpi.valor_inventario) : 0;
        
        // Obtener análisis de crecimiento
        const { data: crecimientoData } = await this.supabase.getClient()
          .rpc('get_analisis_crecimiento');
        
        const crecimiento = crecimientoData && crecimientoData.length > 0 
          ? crecimientoData[0].tendencia 
          : 'ESTABLE';

        this.kpisCache = {
          efectivoDisponible: parseFloat(kpi.efectivo_disponible || '0'),
          ventasUltimos30dias: parseFloat(kpi.ventas_30_dias || '0'),
          gastosUltimos30dias: parseFloat(kpi.gastos_30_dias || '0'),
          utilidadUltimos30dias: parseFloat(kpi.utilidad_30_dias || '0'),
          cuentasPorCobrar: parseFloat(kpi.cuentas_por_cobrar || '0'),
          cuentasPorPagar: parseFloat(kpi.cuentas_por_pagar || '0'),
          rotacionInventario,
          margenBruto: parseFloat(kpi.margen_bruto || '0'),
          liquidez: this.evaluarLiquidez(parseFloat(kpi.efectivo_disponible || '0'), parseFloat(kpi.cuentas_por_pagar || '0')),
          rentabilidad: this.evaluarRentabilidad(parseFloat(kpi.margen_bruto || '0')),
          crecimiento
        };
      } else {
        // Fallback al método original si la función SQL falla
        return this.getKPIsFinancierosOriginal(tenantId);
      }
    } catch (error) {
      console.error('❌ Error usando función SQL, usando método original:', error);
      return this.getKPIsFinancierosOriginal(tenantId);
    }

    this.lastKPIUpdate = new Date();
    return this.kpisCache;
  }

  // Método original como fallback
  private async getKPIsFinancierosOriginal(tenantId?: string): Promise<KPIsFinancieros> {
    // ✅ MULTI-TENANT: Pasar tenant a todas las funciones
    const [efectivo, ventas30dias, gastos30dias, cuentasPorCobrar, cuentasPorPagar, inventario] = await Promise.all([
      this.calcularEfectivoDisponible(tenantId),
      this.calcularVentas30Dias(tenantId),
      this.calcularGastos30Dias(tenantId),
      this.calcularCuentasPorCobrar(tenantId),
      this.calcularCuentasPorPagar(tenantId),
      this.calcularValorInventario(tenantId)
    ]);

    const utilidad30dias = ventas30dias - gastos30dias;
    const margenBruto = ventas30dias > 0 ? ((utilidad30dias / ventas30dias) * 100) : 0;
    const rotacionInventario = inventario > 0 ? (gastos30dias / inventario) : 0;

    return {
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
      crecimiento: await this.evaluarCrecimiento(tenantId)
    };
  }

  private async calcularEfectivoDisponible(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('pagos_ventas')
      .select('monto, ventas!inner(fecha, estado, tenant_id)')
      .eq('ventas.tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('metodo_pago', 'EFECTIVO')
      .gte('ventas.fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .in('ventas.estado', ['EMITIDA', 'PAGADA']);
    return data?.reduce((sum, pago) => sum + parseFloat(pago.monto || '0'), 0) || 0;
  }

  private async calcularVentas30Dias(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('documentos')
      .select('total')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .gte('fecha_emision', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")');
    return data?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
  }

  private async calcularGastos30Dias(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('gastos')
      .select('monto')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .gte('fecha', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    return data?.reduce((sum, gasto) => sum + parseFloat(gasto.monto || 0), 0) || 0;
  }

  private async calcularCuentasPorCobrar(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('cuentas_por_cobrar')
      .select('saldo_pendiente')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .neq('estado', 'COBRADA');
    return data?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
  }

  private async calcularCuentasPorPagar(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('cuentas_por_pagar')
      .select('saldo_pendiente')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .neq('estado', 'PAGADA');
    return data?.reduce((sum, cuenta) => sum + parseFloat(cuenta.saldo_pendiente || 0), 0) || 0;
  }

  private async calcularValorInventario(tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data, error } = await this.supabase
      .getClient()
      .from('productos')
      .select('precio, stock_actual')
      .eq('tenant_id', currentTenantId); // ✅ Filtro de tenant

    if (error) {
      console.error('❌ Error calculando valor inventario:', error);
      return 0;
    }

    return (
      data?.reduce((sum, producto) => {
        const precio = parseFloat((producto as any)?.precio || '0');
        const stock = parseFloat((producto as any)?.stock_actual || '0');
        return sum + precio * stock;
      }, 0) || 0
    );
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

  private async evaluarCrecimiento(tenantId?: string): Promise<string> {
    // ✅ MULTI-TENANT: Pasar tenant
    try {
      const fechaActual = new Date();
      const fechaAnterior = new Date();
      fechaAnterior.setDate(fechaAnterior.getDate() - 60);

      const [ventasActuales, ventasAnteriores] = await Promise.all([
        this.calcularVentasPeriodo(fechaActual, new Date(), tenantId),
        this.calcularVentasPeriodo(fechaAnterior, fechaActual, tenantId)
      ]);

      if (ventasAnteriores === 0) return 'ESTABLE';
      const crecimiento = ((ventasActuales - ventasAnteriores) / ventasAnteriores) * 100;

      if (crecimiento >= 10) return 'POSITIVO';
      if (crecimiento >= -5) return 'ESTABLE';
      return 'NEGATIVO';
    } catch (error) {
      return 'ESTABLE';
    }
  }

  private async calcularVentasPeriodo(fechaInicio: Date, fechaFin: Date, tenantId?: string): Promise<number> {
    // ✅ MULTI-TENANT: Filtrar por tenant
    const currentTenantId = this.resolveTenantId(tenantId);
    const { data } = await this.supabase.getClient()
      .from('documentos')
      .select('total')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .gte('fecha_emision', fechaInicio.toISOString())
      .lte('fecha_emision', fechaFin.toISOString())
      .in('tipo_documento', ['FACTURA', 'BOLETA'])
      .not('estado', 'in', '("ANULADO","ANULADA","CANCELADO","CANCELADA")');
    return data?.reduce((sum, venta) => sum + parseFloat(venta.total || '0'), 0) || 0;
  }

  // 🔧 MÉTODOS DE PROCESAMIENTO DE EVENTOS
  async procesarVentaParaFinanzas(venta: any) {
    try {
      console.log(`✅ Venta ${venta.numeroTicket} procesada para KPIs`);
      this.kpisCache = null; // Invalidar cache
    } catch (error) {
      console.error('❌ Error procesando venta para finanzas:', error);
    }
  }

  async procesarCompraParaFinanzas(compra: any) {
    try {
      console.log(`✅ Compra ${compra.numeroOrden} procesada para KPIs`);
      this.kpisCache = null; // Invalidar cache
    } catch (error) {
      console.error('❌ Error procesando compra para finanzas:', error);
    }
  }

  async procesarGastoParaFinanzas(gasto: any) {
    try {
      console.log(`✅ Gasto ${gasto.concepto} procesado para KPIs`);
      this.kpisCache = null; // Invalidar cache
    } catch (error) {
      console.error('❌ Error procesando gasto para finanzas:', error);
    }
  }

  async procesarPagoFacturaParaFinanzas(pago: any) {
    try {
      console.log(`✅ Pago factura ${pago.numeroFactura} procesado para flujo`);
      this.kpisCache = null; // Invalidar cache
    } catch (error) {
      console.error('❌ Error procesando pago para finanzas:', error);
    }
  }
}
