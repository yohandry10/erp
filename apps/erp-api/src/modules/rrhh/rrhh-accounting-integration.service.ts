import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

export interface AsientoPlanilla {
  tenantId: string;
  planillaId: string;
  periodo: string;
  pais?: 'PE' | 'AR' | 'CO';
  moneda?: 'PEN' | 'ARS' | 'COP';
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

const RRHH_CUENTAS_RUNTIME: Record<string, { nombre: string; tipo: string; nivel: number }> = {
  '101': { nombre: 'Caja', tipo: 'ACTIVO', nivel: 3 },
  '104': { nombre: 'Cuentas corrientes en instituciones financieras', tipo: 'ACTIVO', nivel: 3 },
  '403': { nombre: 'Instituciones publicas', tipo: 'PASIVO', nivel: 3 },
  '407': { nombre: 'Administradoras de fondos y aportes patronales por pagar', tipo: 'PASIVO', nivel: 3 },
  '411': { nombre: 'Remuneraciones por pagar', tipo: 'PASIVO', nivel: 3 },
  '415': { nombre: 'Beneficios sociales de los trabajadores por pagar', tipo: 'PASIVO', nivel: 3 },
  '621': { nombre: 'Remuneraciones', tipo: 'GASTO', nivel: 3 },
  '627': { nombre: 'Seguridad y prevision social', tipo: 'GASTO', nivel: 3 },
  '629': { nombre: 'Beneficios sociales de los trabajadores', tipo: 'GASTO', nivel: 3 },
};

@Injectable()
export class RrhhAccountingIntegrationService {
  private readonly logger = new Logger(RrhhAccountingIntegrationService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Genera asientos contables automáticamente cuando se aprueba una planilla
   */
  async generarAsientosPlanilla(planillaData: AsientoPlanilla): Promise<string> {
    try {
      this.logger.debug(`📚 Generando asientos contables para planilla ${planillaData.periodo}`);
      if (!planillaData.tenantId) {
        throw new Error('tenantId requerido para generar asiento contable de planilla');
      }

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
          tenant_id: planillaData.tenantId,
          fecha: fechaAsiento,
          tipo_asiento: 'PLANILLA',
          origen: 'RRHH',
          concepto: `Planilla de sueldos ${planillaData.periodo}`,
          referencia: `PLANILLA-${planillaData.planillaId}`,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'CONFIRMADO',
          source_event_id: `planilla:${planillaData.planillaId}`,
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select('id, numero_asiento, codigo')
        .single();

      if (asientoError) throw asientoError;

      // Insertar detalles
      const detallesParaGuardar = await this.mapearDetallesConCuentaId(
        planillaData.tenantId,
        asientoCreado.id,
        detalles,
        fechaAsiento,
      );

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesParaGuardar);

      if (detallesError) throw detallesError;

      this.logger.debug(`✅ Asiento contable creado: ${asientoCreado.codigo ?? asientoCreado.numero_asiento ?? asientoCreado.id}`);
      const moneda =
        planillaData.moneda ||
        (planillaData.pais === 'AR' ? 'ARS' : planillaData.pais === 'CO' ? 'COP' : 'PEN');
      this.logger.debug(`   📊 Total Debe (${moneda}): ${planillaData.totalIngresos + planillaData.totalAportes}`);
      this.logger.debug(`   📊 Total Haber (${moneda}): ${planillaData.totalIngresos + planillaData.totalAportes}`);

      return asientoCreado.id;
    } catch (error) {
      console.error('❌ Error generando asientos de planilla:', error);
      throw error;
    }
  }

  /**
   * Genera los detalles del asiento contable con etiquetas del país laboral.
   */
  private generarDetallesAsiento(planillaData: AsientoPlanilla): any[] {
    const detalles = [];
    const esArgentina = planillaData.pais === 'AR';
    const esColombia = planillaData.pais === 'CO';

    // 1. DEBE: Gasto por Sueldos y Salarios (Cuenta 621)
    if (planillaData.totalIngresos > 0) {
      detalles.push({
        cuentaCodigo: '621',
        cuentaNombre: 'Remuneraciones',
        debe: planillaData.totalIngresos,
        haber: 0,
        descripcion: `Sueldos y salarios ${planillaData.periodo}`
      });
    }

    // 2. DEBE: Contribuciones Sociales del Empleador (Cuenta 627)
    if (planillaData.totalAportes > 0) {
      detalles.push({
        cuentaCodigo: '627',
        cuentaNombre: 'Seguridad y Prevision Social',
        debe: planillaData.totalAportes,
        haber: 0,
        descripcion: esArgentina
          ? `Contribuciones patronales, obra social y ART ${planillaData.periodo}`
          : esColombia
            ? `Aportes patronales PILA, parafiscales y provisiones ${planillaData.periodo}`
          : `ESSALUD y aportes empleador ${planillaData.periodo}`
      });
    }

    // 3. HABER: Sueldos por Pagar (Cuenta 411)
    if (planillaData.totalNeto > 0) {
      detalles.push({
        cuentaCodigo: '411',
        cuentaNombre: 'Remuneraciones por Pagar',
        debe: 0,
        haber: planillaData.totalNeto,
        descripcion: `Neto a pagar empleados ${planillaData.periodo}`
      });
    }

    // 4. HABER: aportes y retenciones del trabajador (Cuenta 403)
    if (planillaData.totalDescuentos > 0) {
      detalles.push({
        cuentaCodigo: '403',
        cuentaNombre: 'Instituciones Publicas',
        debe: 0,
        haber: planillaData.totalDescuentos,
        descripcion: esArgentina
          ? `SIPA, INSSJP, obra social y retenciones ${planillaData.periodo}`
          : esColombia
            ? `Salud, pension, solidaridad y retenciones PILA ${planillaData.periodo}`
          : `AFP/ONP descuentos ${planillaData.periodo}`
      });
    }

    // 5. HABER: aportes patronales por pagar (Cuenta 407)
    if (planillaData.totalAportes > 0) {
      detalles.push({
        cuentaCodigo: '407',
        cuentaNombre: 'Administradoras de Fondos',
        debe: 0,
        haber: planillaData.totalAportes,
        descripcion: esArgentina
          ? `Contribuciones patronales y ART por pagar ${planillaData.periodo}`
          : esColombia
            ? `Salud, pension, ARL, caja y parafiscales por pagar ${planillaData.periodo}`
          : `ESSALUD por pagar ${planillaData.periodo}`
      });
    }

    return detalles;
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

      if (!planilla.tenant_id) throw new Error('La planilla no tiene tenant_id');

      const fechaAsiento = new Date().toISOString();
      const tenantId = planilla.tenant_id;

      // Crear asiento de pago
      const { data: asientoCreado, error: asientoError } = await this.supabase.getClient()
        .from('asientos_contables')
        .insert({
          tenant_id: tenantId,
          fecha: fechaAsiento,
          tipo_asiento: 'PAGO_PLANILLA',
          origen: 'RRHH',
          concepto: `Pago de planilla ${planilla.periodo}`,
          referencia: `PAGO-PLANILLA-${planillaId}`,
          total_debe: planilla.total_neto,
          total_haber: planilla.total_neto,
          estado: 'CONFIRMADO',
          source_event_id: `pago-planilla:${planillaId}:${metodoPago}`,
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select('id, numero_asiento, codigo')
        .single();

      if (asientoError) throw asientoError;

      // Detalles del asiento de pago
      const detallesPago = await this.mapearDetallesConCuentaId(tenantId, asientoCreado.id, [
        {
          cuentaCodigo: '411',
          debe: planilla.total_neto,
          haber: 0,
          descripcion: `Cancelacion sueldos ${planilla.periodo}`,
        },
        {
          cuentaCodigo: metodoPago === 'transferencia' ? '104' : '101',
          debe: 0,
          haber: planilla.total_neto,
          descripcion: `Pago ${metodoPago} planilla ${planilla.periodo}`,
        }
      ], fechaAsiento);

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesPago);

      if (detallesError) throw detallesError;

      this.logger.debug(`✅ Asiento de pago creado: ${asientoCreado.codigo ?? asientoCreado.numero_asiento ?? asientoCreado.id}`);
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

      if (!liquidacion.tenant_id) throw new Error('La liquidacion no tiene tenant_id');

      const fechaAsiento = new Date().toISOString();
      const tenantId = liquidacion.tenant_id;

      const esArgentina = String(liquidacion.pais_codigo || 'PE').toUpperCase() === 'AR';

      // Detalles del asiento de liquidación (sin asiento_id aún)
      const detallesLiquidacion = [];

      // Argentina liquida indemnización, preaviso, integración, SAC y vacaciones
      // como un total normativo ya calculado. Perú conserva el desglose CTS.
      if (esArgentina && liquidacion.total_liquidacion > 0) {
        detallesLiquidacion.push({
          cuenta_id: '629',
          debe: liquidacion.total_liquidacion,
          haber: 0,
          concepto: `Liquidación final argentina ${liquidacion.empleados.nombres}`
        });
      } else if (liquidacion.monto_cts > 0) {
        detallesLiquidacion.push({
          cuenta_id: '415', // Beneficios Sociales de los Trabajadores por Pagar
          debe: liquidacion.monto_cts,
          haber: 0,
          concepto: `CTS ${liquidacion.empleados.nombres}`
        });
      }

      // DEBE: Indemnización
      if (!esArgentina && liquidacion.indemnizacion > 0) {
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
          tenant_id: tenantId,
          fecha: fechaAsiento,
          tipo_asiento: 'LIQUIDACION',
          origen: 'RRHH',
          concepto: `Liquidación ${liquidacion.empleados.nombres} ${liquidacion.empleados.apellidos}`,
          referencia: `LIQUIDACION-${liquidacionId}`,
          total_debe: totalDebe,
          total_haber: totalHaber,
          estado: 'CONFIRMADO',
          source_event_id: `liquidacion:${liquidacionId}`,
          usuario_id: null,
          created_at: fechaAsiento
        })
        .select('id, numero_asiento, codigo')
        .single();

      if (asientoError) throw asientoError;

      // Mapear detalles con el asiento creado
      const detallesParaGuardar = await this.mapearDetallesConCuentaId(
        tenantId,
        asientoCreado.id,
        detallesLiquidacion.map((detalle) => ({
          cuentaCodigo: detalle.cuenta_id,
          debe: detalle.debe,
          haber: detalle.haber,
          descripcion: detalle.concepto,
        })),
        fechaAsiento,
      );

      const { error: detallesError } = await this.supabase.getClient()
        .from('detalle_asientos')
        .insert(detallesParaGuardar);

      if (detallesError) throw detallesError;

      this.logger.debug(`✅ Asiento de liquidación creado: ${asientoCreado.codigo ?? asientoCreado.numero_asiento ?? asientoCreado.id}`);
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
        .or('origen.eq.RRHH,referencia.like.PLANILLA-%,referencia.like.PAGO-PLANILLA-%,referencia.like.LIQUIDACION-%')
        .order('fecha', { ascending: false });

      if (fechaDesde) query = query.gte('fecha', fechaDesde);
      if (fechaHasta) query = query.lte('fecha', fechaHasta);

      const { data: asientos, error } = await query;
      
      if (error) throw error;

      // Calcular totales
      const totales = (asientos || []).reduce((acc, asiento) => {
        const referencia = String(asiento.referencia || '');
        if (referencia.startsWith('PLANILLA-')) {
          acc.totalPlanillas += asiento.total_debe || 0;
        } else if (referencia.startsWith('PAGO-PLANILLA-')) {
          acc.totalPagos += asiento.total_debe || 0;
        } else if (referencia.startsWith('LIQUIDACION-')) {
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

  private async mapearDetallesConCuentaId(
    tenantId: string,
    asientoId: string,
    detalles: Array<{ cuentaCodigo: string; debe: number; haber: number; descripcion: string }>,
    fechaAsiento: string,
  ) {
    const resultado = [];

    for (const detalle of detalles) {
      resultado.push({
        tenant_id: tenantId,
        asiento_id: asientoId,
        cuenta_id: await this.obtenerCuentaIdPorCodigo(tenantId, detalle.cuentaCodigo),
        debe: detalle.debe,
        haber: detalle.haber,
        concepto: detalle.descripcion,
        created_at: fechaAsiento,
      });
    }

    return resultado;
  }

  private async obtenerCuentaIdPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('plan_cuentas')
      .select('id, codigo')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;

    const cuentaBase = RRHH_CUENTAS_RUNTIME[codigo];
    if (!cuentaBase) {
      throw new Error(`Cuenta RRHH ${codigo} no encontrada para el tenant`);
    }

    const { data: creada, error: createError } = await client
      .from('plan_cuentas')
      .insert({
        tenant_id: tenantId,
        codigo,
        nombre: cuentaBase.nombre,
        tipo: cuentaBase.tipo,
        tipo_cuenta: cuentaBase.tipo,
        nivel: cuentaBase.nivel,
        acepta_movimiento: true,
        activo: true,
        estado: 'ACTIVO',
        metadata: {
          source: 'runtime_rrhh_standard_account',
        },
      })
      .select('id, codigo')
      .single();

    if (!createError && creada?.id) return creada.id;

    if (createError?.code === '23505') {
      const { data: existente, error: findError } = await client
        .from('plan_cuentas')
        .select('id, codigo')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .maybeSingle();

      if (findError) throw findError;
      if (existente?.id) return existente.id;
    }

    throw createError ?? new Error(`No se pudo crear cuenta RRHH ${codigo}`);
  }
} 
