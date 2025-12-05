import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

export interface AsientoPlanilla {
  planillaId: string;
  periodo: string;
  totalIngresos: number;
  totalDescuentos: number;
  totalAportes: number;
  totalNeto: number;
  empleados: EmpleadoPlanilla[];
}

export interface EmpleadoPlanilla {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  numeroDocumento: string;
  ingresos: number;
  descuentos: number;
  aportes: number;
  neto: number;
}

@Injectable()
export class RrhhAccountingIntegrationService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Genera asientos contables automáticamente cuando se aprueba una planilla
   */
  async generarAsientosPlanilla(planillaData: AsientoPlanilla): Promise<string> {
    try {
      console.log(`📚 Generando asientos contables para planilla ${planillaData.periodo}`);

      const numeroAsiento = `PLAN-${planillaData.periodo}-${Date.now()}`;
      const fechaAsiento = new Date().toISOString();

      // Generar detalles del asiento y validar cuadratura antes de persistir
      const detalles = this.generarDetallesAsiento(planillaData);
      const totalDebe = detalles.reduce((sum, d) => sum + Number(d.debe || 0), 0);
      const totalHaber = detalles.reduce((sum, d) => sum + Number(d.haber || 0), 0);

      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        throw new Error(
          `El asiento de planilla no cuadra: Debe=${totalDebe.toFixed(2)}, Haber=${totalHaber.toFixed(2)}`
        );
      }

      // Crear asiento principal
      const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
        .from('asientos_contables')
        .insert({
          numero_asiento: numeroAsiento,
          fecha: fechaAsiento,
          concepto: `Planilla de sueldos ${planillaData.periodo}`,
          referencia: `PLANILLA-${planillaData.planillaId}`,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'BORRADOR',
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select()
        .single();

      if (asientoError) throw asientoError;

      // Insertar detalles
      const detallesParaGuardar = detalles.map(detalle => ({
        asiento_id: asientoCreado.id,
        cuenta_id: detalle.cuentaCodigo,
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.descripcion,
        created_at: fechaAsiento
      }));

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesParaGuardar);

      if (detallesError) throw detallesError;

      console.log(`✅ Asiento contable creado: ${numeroAsiento}`);
      console.log(`   📊 Total Debe: S/ ${planillaData.totalIngresos + planillaData.totalAportes}`);
      console.log(`   📊 Total Haber: S/ ${planillaData.totalIngresos + planillaData.totalAportes}`);

      return asientoCreado.id;
    } catch (error) {
      console.error('❌ Error generando asientos de planilla:', error);
      throw error;
    }
  }

  /**
   * Genera los detalles del asiento contable según normativa peruana
   */
  private generarDetallesAsiento(planillaData: AsientoPlanilla): any[] {
    const detalles = [];

    // 1. DEBE: Gasto por Sueldos y Salarios (Cuenta 621)
    detalles.push({
      cuentaCodigo: '621',
      cuentaNombre: 'Remuneraciones',
      debe: planillaData.totalIngresos,
      haber: 0,
      descripcion: `Sueldos y salarios ${planillaData.periodo}`
    });

    // 2. DEBE: Contribuciones Sociales del Empleador (Cuenta 627)
    detalles.push({
      cuentaCodigo: '627',
      cuentaNombre: 'Seguridad y Previsión Social',
      debe: planillaData.totalAportes,
      haber: 0,
      descripcion: `ESSALUD y aportes empleador ${planillaData.periodo}`
    });

    // 3. HABER: Sueldos por Pagar (Cuenta 411)
    detalles.push({
      cuentaCodigo: '411',
      cuentaNombre: 'Remuneraciones por Pagar',
      debe: 0,
      haber: planillaData.totalNeto,
      descripcion: `Neto a pagar empleados ${planillaData.periodo}`
    });

    // 4. HABER: Tributos por Pagar - AFP/ONP (Cuenta 403)
    const aportesPensiones = this.calcularAportesPensiones(planillaData);
    if (aportesPensiones > 0) {
      detalles.push({
        cuentaCodigo: '403',
        cuentaNombre: 'Instituciones Públicas',
        debe: 0,
        haber: aportesPensiones,
        descripcion: `AFP/ONP descuentos ${planillaData.periodo}`
      });
    }

    // 5. HABER: ESSALUD por Pagar (Cuenta 407)
    if (planillaData.totalAportes > 0) {
      detalles.push({
        cuentaCodigo: '407',
        cuentaNombre: 'Administradoras de Fondos',
        debe: 0,
        haber: planillaData.totalAportes,
        descripcion: `ESSALUD por pagar ${planillaData.periodo}`
      });
    }

    // 6. HABER: Impuesto a la Renta por Pagar (Cuenta 401)
    const impuestoRenta = this.calcularImpuestoRenta(planillaData);
    if (impuestoRenta > 0) {
      detalles.push({
        cuentaCodigo: '401',
        cuentaNombre: 'Gobierno Central',
        debe: 0,
        haber: impuestoRenta,
        descripcion: `Impuesto 5ta categoría ${planillaData.periodo}`
      });
    }

    return detalles;
  }

  /**
   * Calcula el total de aportes a sistemas de pensiones (AFP/ONP)
   */
  private calcularAportesPensiones(planillaData: AsientoPlanilla): number {
    // Estimación basada en promedios (10% AFP + 1.25% comisión + 1.36% seguro = ~12.6%)
    // o 13% ONP
    return planillaData.totalIngresos * 0.126; // Promedio ponderado
  }

  /**
   * Calcula el impuesto a la renta de 5ta categoría
   */
  private calcularImpuestoRenta(planillaData: AsientoPlanilla): number {
    // Cálculo simplificado - en la práctica se debe obtener del detalle real
    const UIT_2024 = 5150;
    const limiteAnualExonerado = 7 * UIT_2024;
    const limiteExoneradoMensual = limiteAnualExonerado / 12;
    
    let totalImpuesto = 0;
    
    for (const empleado of planillaData.empleados) {
      if (empleado.ingresos > limiteExoneradoMensual) {
        const excesoMensual = empleado.ingresos - limiteExoneradoMensual;
        totalImpuesto += excesoMensual * 0.08; // Tasa básica 8%
      }
    }
    
    return totalImpuesto;
  }

  /**
   * Genera asiento de pago de planilla (cuando se efectúa el pago)
   */
  async generarAsientoPagoPlanilla(planillaId: string, metodoPago: 'transferencia' | 'efectivo'): Promise<string> {
    try {
      // Obtener datos de la planilla
      const { data: planilla, error: planillaError } = await this.supabase.getClient()
        .from('planillas')
        .select('*')
        .eq('id', planillaId)
        .single();

      if (planillaError || !planilla) throw new Error('Planilla no encontrada');

      const numeroAsiento = `PAGO-PLAN-${planilla.periodo}-${Date.now()}`;
      const fechaAsiento = new Date().toISOString();

      // Crear asiento de pago
      const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
        .from('asientos_contables')
        .insert({
          numero_asiento: numeroAsiento,
          fecha: fechaAsiento,
          concepto: `Pago de planilla ${planilla.periodo}`,
          referencia: `PAGO-PLANILLA-${planillaId}`,
          total_debe: planilla.total_neto,
          total_haber: planilla.total_neto,
          estado: 'BORRADOR',
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select()
        .single();

      if (asientoError) throw asientoError;

      // Detalles del asiento de pago
      const detallesPago = [
        {
          asiento_id: asientoCreado.id,
          cuenta_id: '411', // Remuneraciones por Pagar
          debe: planilla.total_neto,
          haber: 0,
          concepto: `Cancelación sueldos ${planilla.periodo}`,
          created_at: fechaAsiento
        },
        {
          asiento_id: asientoCreado.id,
          cuenta_id: metodoPago === 'transferencia' ? '104' : '101', // Banco o Caja
          debe: 0,
          haber: planilla.total_neto,
          concepto: `Pago ${metodoPago} planilla ${planilla.periodo}`,
          created_at: fechaAsiento
        }
      ];

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesPago);

      if (detallesError) throw detallesError;

      console.log(`✅ Asiento de pago creado: ${numeroAsiento}`);
      return asientoCreado.id;
    } catch (error) {
      console.error('❌ Error generando asiento de pago:', error);
      throw error;
    }
  }

  /**
   * Genera asientos para liquidaciones de empleados
   */
  async generarAsientoLiquidacion(liquidacionId: string): Promise<string> {
    try {
      // Obtener datos de la liquidación
      const { data: liquidacion, error: liquidacionError } = await this.supabase.getClient()
        .from('liquidaciones')
        .select(`
          *,
          empleados(nombres, apellidos, numero_documento)
        `)
        .eq('id', liquidacionId)
        .single();

      if (liquidacionError || !liquidacion) throw new Error('Liquidación no encontrada');

      const numeroAsiento = `LIQ-${liquidacion.empleados.numero_documento}-${Date.now()}`;
      const fechaAsiento = new Date().toISOString();

      // Detalles del asiento de liquidación (sin asiento_id aún)
      const detallesLiquidacion = [];

      // DEBE: Provisiones CTS
      if (liquidacion.monto_cts > 0) {
        detallesLiquidacion.push({
          cuenta_id: '415', // Beneficios Sociales de los Trabajadores por Pagar
          debe: liquidacion.monto_cts,
          haber: 0,
          concepto: `CTS ${liquidacion.empleados.nombres}`
        });
      }

      // DEBE: Indemnización
      if (liquidacion.indemnizacion > 0) {
        detallesLiquidacion.push({
          cuenta_id: '629', // Beneficios Sociales de los Trabajadores
          debe: liquidacion.indemnizacion,
          haber: 0,
          concepto: `Indemnización ${liquidacion.empleados.nombres}`
        });
      }

      // HABER: Total a pagar al empleado
      detallesLiquidacion.push({
        cuenta_id: '411', // Remuneraciones por Pagar
        debe: 0,
        haber: liquidacion.total_liquidacion,
        concepto: `Liquidación por pagar ${liquidacion.empleados.nombres}`
      });

      const totalDebe = detallesLiquidacion.reduce((sum, d) => sum + Number(d.debe || 0), 0);
      const totalHaber = detallesLiquidacion.reduce((sum, d) => sum + Number(d.haber || 0), 0);

      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        throw new Error(
          `El asiento de liquidación no cuadra: Debe=${totalDebe.toFixed(2)}, Haber=${totalHaber.toFixed(2)}`
        );
      }

      // Crear asiento de liquidación con totales validados
      const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
        .from('asientos_contables')
        .insert({
          numero_asiento: numeroAsiento,
          fecha: fechaAsiento,
          concepto: `Liquidación ${liquidacion.empleados.nombres} ${liquidacion.empleados.apellidos}`,
          referencia: `LIQUIDACION-${liquidacionId}`,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'BORRADOR',
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select()
        .single();

      if (asientoError) throw asientoError;

      // Mapear detalles con el asiento creado
      const detallesParaGuardar = detallesLiquidacion.map(detalle => ({
        asiento_id: asientoCreado.id,
        cuenta_id: detalle.cuenta_id,
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.concepto,
        created_at: fechaAsiento
      }));

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesParaGuardar);

      if (detallesError) throw detallesError;

      console.log(`✅ Asiento de liquidación creado: ${numeroAsiento}`);
      return asientoCreado.id;
    } catch (error) {
      console.error('❌ Error generando asiento de liquidación:', error);
      throw error;
    }
  }

  /**
   * Obtiene resumen contable de RRHH para reportes
   */
  async getResumenContableRrhh(fechaDesde?: string, fechaHasta?: string) {
    try {
      const client = this.supabase.getClient();
      
      // Asientos relacionados con RRHH
      let query = client
        .from('asientos_contables')
        .select(`
          *,
          detalle_asientos(*)
        `)
        .or('numero_asiento.like.PLAN-%,numero_asiento.like.PAGO-PLAN-%,numero_asiento.like.LIQ-%')
        .order('fecha', { ascending: false });

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      const { data: asientos, error } = await query;
      
      if (error) throw error;

      // Calcular totales
      const totales = (asientos || []).reduce((acc, asiento) => {
        if (asiento.numero_asiento.startsWith('PLAN-')) {
          acc.totalPlanillas += asiento.total_debe || 0;
        } else if (asiento.numero_asiento.startsWith('PAGO-PLAN-')) {
          acc.totalPagos += asiento.total_debe || 0;
        } else if (asiento.numero_asiento.startsWith('LIQ-')) {
          acc.totalLiquidaciones += asiento.total_debe || 0;
        }
        return acc;
      }, {
        totalPlanillas: 0,
        totalPagos: 0,
        totalLiquidaciones: 0
      });

      return {
        success: true,
        data: {
          periodo: fechaDesde && fechaHasta ? `${fechaDesde} al ${fechaHasta}` : 'Todos los registros',
          totalAsientos: asientos?.length || 0,
          totales,
          asientos: asientos || []
        }
      };
    } catch (error) {
      console.error('❌ Error obteniendo resumen contable RRHH:', error);
      throw error;
    }
  }
} 
