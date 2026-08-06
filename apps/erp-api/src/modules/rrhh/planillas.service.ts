import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService, PlanillaCalculadaEvent } from '../../shared/events/event-bus.service';
import Decimal from 'decimal.js';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import {
  calcularGratificacionTrunca,
  diasEnPeriodo,
  dividirRemuneracionPorVacaciones,
  mesesGratificablesDelPeriodo,
  parseFechaLocal,
} from './liquidacion-peru.util';

const CONCEPTOS_PLANILLA_BASE = [
  { codigo: '001', nombre: 'Sueldo basico', tipo: 'ingreso' },
  { codigo: '002', nombre: 'Asignacion familiar', tipo: 'ingreso' },
  { codigo: '003', nombre: 'Horas extras 25%', tipo: 'ingreso' },
  { codigo: '004', nombre: 'Horas extras 35%', tipo: 'ingreso' },
  { codigo: '005', nombre: 'Bono adicional', tipo: 'ingreso' },
  { codigo: '006', nombre: 'Gratificacion legal', tipo: 'ingreso' },
  { codigo: '007', nombre: 'Bonificacion extraordinaria 9%', tipo: 'ingreso' },
  { codigo: '008', nombre: 'Remuneracion vacacional', tipo: 'ingreso' },
  { codigo: '101', nombre: 'Aporte AFP', tipo: 'descuento' },
  { codigo: '102', nombre: 'Comision AFP', tipo: 'descuento' },
  { codigo: '103', nombre: 'Seguro AFP', tipo: 'descuento' },
  { codigo: '104', nombre: 'Aporte ONP', tipo: 'descuento' },
  { codigo: '105', nombre: 'Impuesto a la renta quinta categoria', tipo: 'descuento' },
  { codigo: '106', nombre: 'Tardanzas', tipo: 'descuento' },
  { codigo: '107', nombre: 'Faltas', tipo: 'descuento' },
  { codigo: '201', nombre: 'Aporte EsSalud', tipo: 'aporte_empleador' },
];

type NormativaPeruPeriodo = {
  uit: number;
  rmv: number;
  asignacionFamiliar: number;
  afpAporte: number;
  afpPrimaSeguro: number;
  afpComisionFlujoDefault: number;
  onpAporte: number;
  essaludAporte: number;
  quintaDeduccionUit: number;
};

type CalculoEmpleadoPersistencia = {
  empleado_id: string;
  dias_trabajados: number;
  horas_extras_25: number;
  horas_extras_35: number;
  tardanzas_minutos: number;
  faltas: number;
  total_ingresos: number;
  total_descuentos: number;
  total_aportes: number;
  neto_pagar: number;
  conceptos: Array<{
    concepto_id: string;
    monto: number;
    observaciones?: string;
  }>;
};

const NORMATIVA_PERU_2026_DEFAULT: NormativaPeruPeriodo = {
  uit: 5500,
  rmv: 1130,
  asignacionFamiliar: 113,
  afpAporte: 0.10,
  afpPrimaSeguro: 0.0137,
  afpComisionFlujoDefault: 0.0155,
  onpAporte: 0.13,
  essaludAporte: 0.09,
  quintaDeduccionUit: 7,
};

// Estados en los que el contrato rige la relación laboral. Mismo criterio que usa
// el trigger normalize_contratos_row para derivar contratos.activo: un contrato
// renovado o en periodo de prueba sigue vigente y debe entrar a planilla.
export const ESTADOS_CONTRATO_VIGENTE = ['vigente', 'renovado', 'en_periodo_prueba'];

/**
 * Contrato que rige la planilla del empleado. Si hay varios vigentes (una
 * renovación crea una fila nueva sin cerrar la anterior), gana el de fecha de
 * inicio más reciente. Sin este orden el sueldo de la planilla dependía de en
 * qué orden devolviera las filas la base de datos.
 */
export function contratoVigenteDe(empleado: any): any | undefined {
  const vigentes = (empleado?.contratos ?? []).filter((contrato: any) =>
    ESTADOS_CONTRATO_VIGENTE.includes(String(contrato?.estado ?? '').toLowerCase()),
  );

  if (vigentes.length <= 1) {
    return vigentes[0];
  }

  const desde = (contrato: any) =>
    new Date(contrato?.fecha_inicio ?? contrato?.created_at ?? 0).getTime() || 0;

  return [...vigentes].sort((a: any, b: any) => desde(b) - desde(a))[0];
}

const RRHH_CUENTAS_PLANILLA_DEFAULT: Record<string, { nombre: string; tipo: string; tipo_cuenta: string; nivel: number }> = {
  '401': { nombre: 'Gobierno central', tipo: 'PASIVO', tipo_cuenta: 'PASIVO', nivel: 3 },
  '403': { nombre: 'Instituciones publicas', tipo: 'PASIVO', tipo_cuenta: 'PASIVO', nivel: 3 },
  '407': { nombre: 'Administradoras de fondos y aportes por pagar', tipo: 'PASIVO', tipo_cuenta: 'PASIVO', nivel: 3 },
  '411': { nombre: 'Remuneraciones por pagar', tipo: 'PASIVO', tipo_cuenta: 'PASIVO', nivel: 3 },
  '621': { nombre: 'Remuneraciones', tipo: 'GASTO', tipo_cuenta: 'GASTO', nivel: 3 },
  '627': { nombre: 'Seguridad, prevision social y otras contribuciones', tipo: 'GASTO', tipo_cuenta: 'GASTO', nivel: 3 },
};

@Injectable()
export class PlanillasService {
  private readonly logger = new Logger(PlanillasService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventBus: EventBusService
  ) { }

  private async guardarCalculoPlanillaAtomico(
    planillaId: string,
    tenantId: string | undefined,
    empleados: CalculoEmpleadoPersistencia[],
  ) {
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para calcular una planilla');
    }

    const { data, error } = await this.supabaseService.getClient().rpc(
      'guardar_calculo_planilla_tx',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_empleados: empleados,
      },
    );

    if (error) {
      if (error.code === '23514' || error.code === '23505') {
        throw new ConflictException(error.message);
      }
      if (error.code === 'P0002') {
        throw new NotFoundException(error.message);
      }
      if (error.code === '22023' || error.code === '23503') {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (!data?.success) {
      throw new Error('La transaccion de calculo de planilla no confirmo su finalizacion');
    }

    return data;
  }

  // Obtener todas las planillas
  // ✅ FIX: Agregar soporte multi-tenant
  async getPlanillas(tenantId?: string) {
    let query = this.supabaseService.getClient()
      .from('planillas')
      .select('*')
      .order('periodo', { ascending: false });
    
    // ✅ Filtrar por tenant si se proporciona
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  // Crear nueva planilla
  // ✅ FIX: Agregar soporte multi-tenant
  async crearPlanilla(planillaData: any, tenantId?: string) {
    const periodo = String(planillaData?.periodo || '').trim();
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new BadRequestException('Debe enviar periodo de planilla en formato YYYY-MM');
    }

    const metadataBase =
      planillaData?.metadata && typeof planillaData.metadata === 'object' && !Array.isArray(planillaData.metadata)
        ? planillaData.metadata
        : {};
    const metadata = {
      ...metadataBase,
      ...(planillaData?.observaciones ? { observaciones: String(planillaData.observaciones).trim() } : {}),
    };

    const camposPermitidos = [
      'id',
      'periodo',
      'estado',
      'estado_pago',
      'total_ingresos',
      'total_descuentos',
      'total_aportes',
      'total_neto',
      'total_pagado',
      'fecha_pago',
      'metodo_pago',
      'asientos_generados',
      'fecha_asientos',
      'centro_costo_id',
      'metadata',
    ];
    const datosLimpios = Object.fromEntries(
      Object.entries({ ...planillaData, periodo })
        .filter(([key]) => camposPermitidos.includes(key))
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
    if (Object.keys(metadata).length > 0) {
      datosLimpios.metadata = metadata;
    }

    const dataToInsert = tenantId 
      ? { ...datosLimpios, tenant_id: tenantId }
      : datosLimpios;
      
    const { data, error } = await this.supabaseService.getClient()
      .from('planillas')
      .insert(dataToInsert)
      .select();
    if (error) throw error;
    return data[0];
  }

  // Calcular planilla mensual para todos los empleados activos
  // ✅ FIX: Agregar soporte multi-tenant
  async calcularPlanillaMensual(planillaId: string, tenantId?: string) {
    this.logger.debug(`🧮 Iniciando cálculo de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();

    // Idempotencia: verificar que la planilla no esté ya calculada o pagada
    let planillaEstadoQuery = client
      .from('planillas')
      .select('estado, periodo')
      .eq('id', planillaId);
    if (tenantId) {
      planillaEstadoQuery = planillaEstadoQuery.eq('tenant_id', tenantId);
    }
    const { data: planillaEstado } = await planillaEstadoQuery.single();

    if (planillaEstado?.estado === 'calculada' || planillaEstado?.estado === 'pagada') {
      // El estado de la planilla choca con la operación pedida: es un conflicto
      // del cliente, no un fallo del servidor.
      throw new ConflictException(
        `La planilla ya fue ${planillaEstado.estado}. No se puede recalcular sin anular primero.`,
      );
    }

    // Obtener empleados activos
    let empleadosQuery = client
      .from('empleados')
      .select('*, contratos(*)')
      .order('fecha_inicio', { referencedTable: 'contratos', ascending: false })
      .eq('estado', 'activo');
    
    // ✅ Filtrar por tenant si se proporciona
    if (tenantId) {
      empleadosQuery = empleadosQuery.eq('tenant_id', tenantId);
    }
    
    const { data: empleados, error: empleadosError } = await empleadosQuery;

    if (empleadosError) {
      console.error('❌ Error obteniendo empleados:', empleadosError);
      throw empleadosError;
    }

    this.logger.debug(`👥 Empleados activos encontrados: ${empleados?.length || 0}`);

    if (!empleados || empleados.length === 0) {
      throw new BadRequestException('No se encontraron empleados activos para procesar');
    }

    const conceptosResult = await this.getConceptos(tenantId);
    const conceptos = conceptosResult.data;

    this.logger.debug(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);

    if (!conceptos || conceptos.length === 0) {
      throw new BadRequestException('No se encontraron conceptos de planilla configurados');
    }

    if (!planillaEstado?.periodo) {
      throw new BadRequestException('Planilla sin periodo; no se puede resolver normativa laboral/tributaria');
    }

    const normativa = await this.obtenerNormativaPeruPeriodo(planillaEstado.periodo, tenantId);

    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportes = 0;
    let totalNeto = 0;
    const empleadosCalculados = [];
    const calculosPersistencia: CalculoEmpleadoPersistencia[] = [];

    const planillaInfo = planillaEstado;

    const vacacionesPorEmpleado = await this.obtenerDiasVacacionesDelPeriodo(
      (empleados || []).map((e: any) => e.id),
      planillaEstado.periodo,
      tenantId,
    );

    // Procesar cada empleado
    for (const empleado of empleados) {
      const contratoActual = contratoVigenteDe(empleado);
      if (!contratoActual) {
        this.logger.debug(`Empleado sin contrato vigente: ID=${empleado.id}`);
        continue;
      }

      const sueldoBasico = parseFloat(contratoActual.sueldo_bruto) || 0;
      this.logger.debug(`Procesando empleado ID=${empleado.id}`);

      const calculoEmpleado = this.calcularEmpleado(
        empleado,
        sueldoBasico,
        conceptos,
        normativa,
        planillaEstado.periodo,
        vacacionesPorEmpleado.get(empleado.id) ?? 0,
      );

      calculosPersistencia.push({
        empleado_id: empleado.id,
        dias_trabajados: 30,
        horas_extras_25: 0,
        horas_extras_35: 0,
        tardanzas_minutos: 0,
        faltas: 0,
        total_ingresos: calculoEmpleado.totalIngresos,
        total_descuentos: calculoEmpleado.totalDescuentos,
        total_aportes: calculoEmpleado.totalAportes,
        neto_pagar: calculoEmpleado.netoPagar,
        conceptos: calculoEmpleado.conceptosDetalle.map((concepto: any) => ({
          concepto_id: concepto.id,
          monto: concepto.monto,
          observaciones: concepto.observaciones,
        })),
      });

      totalIngresos += calculoEmpleado.totalIngresos;
      totalDescuentos += calculoEmpleado.totalDescuentos;
      totalAportes += calculoEmpleado.totalAportes;
      totalNeto += calculoEmpleado.netoPagar;

      // Agregar empleado al array para el evento
      empleadosCalculados.push({
        empleadoId: empleado.id,
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        numeroDocumento: empleado.numero_documento,
        ingresos: calculoEmpleado.totalIngresos,
        descuentos: calculoEmpleado.totalDescuentos,
        aportes: calculoEmpleado.totalAportes,
        neto: calculoEmpleado.netoPagar
      });
    }

    await this.guardarCalculoPlanillaAtomico(planillaId, tenantId, calculosPersistencia);

    this.logger.debug(`✅ Planilla calculada exitosamente:`);
    this.logger.debug(`   - Empleados procesados: ${empleados.length}`);
    this.logger.debug(`   - Total ingresos: S/ ${totalIngresos.toFixed(2)}`);
    this.logger.debug(`   - Total descuentos: S/ ${totalDescuentos.toFixed(2)}`);
    this.logger.debug(`   - Total neto: S/ ${totalNeto.toFixed(2)}`);

    // 🎯 EMITIR EVENTO PARA INTEGRACIÓN CONTABLE
    this.logger.debug('🎯 [RRHH] Emitiendo evento de planilla calculada para contabilidad...');

    const eventoplanilla: PlanillaCalculadaEvent = {
      planillaId: planillaId,
      periodo: planillaInfo.periodo,
      totalIngresos: totalIngresos,
      totalDescuentos: totalDescuentos,
      totalAportes: totalAportes,
      totalNeto: totalNeto,
      cantidadEmpleados: empleadosCalculados.length,
      empleados: empleadosCalculados
    };

    this.eventBus.emitPlanillaCalculada(eventoplanilla);
    this.logger.debug('✅ [RRHH] Evento de planilla calculada emitido exitosamente');

    return {
      success: true,
      totalEmpleados: empleados.length,
      totalIngresos,
      totalDescuentos,
      totalNeto
    };
  }

  private async obtenerNormativaPeruPeriodo(
    periodo?: string,
    tenantId?: string,
  ): Promise<NormativaPeruPeriodo> {
    const periodoNormalizado = /^\d{4}-\d{2}$/.test(String(periodo || ''))
      ? String(periodo)
      : '2026-05';
    const client = this.supabaseService.getClient();

    const mapNormativa = (data: any): NormativaPeruPeriodo => ({
      uit: Number(data?.uit ?? NORMATIVA_PERU_2026_DEFAULT.uit),
      rmv: Number(data?.rmv ?? NORMATIVA_PERU_2026_DEFAULT.rmv),
      asignacionFamiliar: Number(data?.asignacion_familiar ?? NORMATIVA_PERU_2026_DEFAULT.asignacionFamiliar),
      afpAporte: Number(data?.afp_aporte ?? NORMATIVA_PERU_2026_DEFAULT.afpAporte),
      afpPrimaSeguro: Number(data?.afp_prima_seguro ?? NORMATIVA_PERU_2026_DEFAULT.afpPrimaSeguro),
      afpComisionFlujoDefault: Number(
        data?.afp_comision_flujo_default ?? NORMATIVA_PERU_2026_DEFAULT.afpComisionFlujoDefault,
      ),
      onpAporte: Number(data?.onp_aporte ?? NORMATIVA_PERU_2026_DEFAULT.onpAporte),
      essaludAporte: Number(data?.essalud_aporte ?? NORMATIVA_PERU_2026_DEFAULT.essaludAporte),
      quintaDeduccionUit: Number(
        data?.quinta_deduccion_uit ?? NORMATIVA_PERU_2026_DEFAULT.quintaDeduccionUit,
      ),
    });

    try {
      if (tenantId) {
        const { data, error } = await client
          .from('normativa_peru_periodos')
          .select(
            'uit, rmv, asignacion_familiar, afp_aporte, afp_prima_seguro, afp_comision_flujo_default, onp_aporte, essalud_aporte, quinta_deduccion_uit',
          )
          .eq('tenant_id', tenantId)
          .eq('periodo', periodoNormalizado)
          .eq('activo', true)
          .maybeSingle();

        if (!error && data) {
          return mapNormativa(data);
        }
      }

      const { data, error } = await client
        .from('normativa_peru_periodos')
        .select(
          'uit, rmv, asignacion_familiar, afp_aporte, afp_prima_seguro, afp_comision_flujo_default, onp_aporte, essalud_aporte, quinta_deduccion_uit',
        )
        .is('tenant_id', null)
        .eq('periodo', periodoNormalizado)
        .eq('activo', true)
        .maybeSingle();

      if (!error && data) {
        return mapNormativa(data);
      }

      if (error) {
        this.logger.warn(`No se pudo cargar normativa Perú ${periodoNormalizado}: ${error.message}`);
      }
    } catch (error: any) {
      this.logger.warn(`Normativa Perú no disponible para ${periodoNormalizado}; usando fallback 2026: ${error?.message ?? error}`);
    }

    return { ...NORMATIVA_PERU_2026_DEFAULT };
  }

  // Lógica de cálculo por empleado
  /**
   * Días de vacaciones aprobadas que caen dentro del mes de la planilla. Un
   * descanso que cruza el cambio de mes se reparte entre las dos planillas, así
   * que se cuenta el solape en vez del total de la solicitud.
   */
  private async obtenerDiasVacacionesDelPeriodo(
    empleadoIds: string[],
    periodo: string,
    tenantId?: string,
  ): Promise<Map<string, number>> {
    const porEmpleado = new Map<string, number>();
    if (!periodo || empleadoIds.length === 0) return porEmpleado;

    let query = this.supabaseService.getClient()
      .from('solicitudes')
      .select('id_empleado, fecha_inicio, fecha_fin')
      .in('id_empleado', empleadoIds)
      .eq('tipo', 'vacaciones')
      .eq('estado', 'aprobada');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.warn(`No se pudieron leer las vacaciones del periodo ${periodo}: ${error.message}`);
      return porEmpleado;
    }

    for (const solicitud of data || []) {
      const dias = diasEnPeriodo(
        periodo,
        parseFechaLocal((solicitud as any).fecha_inicio),
        parseFechaLocal((solicitud as any).fecha_fin),
      );
      if (dias <= 0) continue;

      const clave = (solicitud as any).id_empleado;
      porEmpleado.set(clave, (porEmpleado.get(clave) ?? 0) + dias);
    }

    return porEmpleado;
  }

  private calcularEmpleado(
    empleado: any,
    sueldoBasico: number,
    conceptos: any[],
    normativa: NormativaPeruPeriodo = NORMATIVA_PERU_2026_DEFAULT,
    periodo?: string,
    diasVacaciones = 0,
  ) {
    const conceptosDetalle = [];
    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportes = 0;

    // 1. INGRESOS

    // Sueldo básico. En vacaciones el trabajador percibe lo mismo que si hubiera
    // trabajado (D. Leg. 713, art. 15), así que el importe del mes no cambia:
    // sólo se separa el tramo vacacional del trabajado, que es lo que hay que
    // declarar por separado. Ambos son remuneración computable, de modo que la
    // base de aportes no se altera.
    const reparto = dividirRemuneracionPorVacaciones(sueldoBasico, diasVacaciones ?? 0);

    const conceptoBasico = conceptos.find(c => c.codigo === '001');
    if (conceptoBasico) {
      conceptosDetalle.push({
        id: conceptoBasico.id,
        monto: reparto.montoTrabajado,
        observaciones: reparto.diasVacaciones > 0
          ? `Sueldo por ${30 - reparto.diasVacaciones} días trabajados`
          : 'Sueldo mensual',
      });
      totalIngresos += reparto.montoTrabajado;
    }

    const conceptoVacacional = conceptos.find(c => c.codigo === '008');
    if (conceptoVacacional && reparto.montoVacacional > 0) {
      conceptosDetalle.push({
        id: conceptoVacacional.id,
        monto: reparto.montoVacacional,
        observaciones: `Remuneración vacacional por ${reparto.diasVacaciones} días`,
      });
      totalIngresos += reparto.montoVacacional;
    }

    // Asignación familiar: 10% de la RMV vigente.
    const conceptoAsigFam = conceptos.find(c => c.codigo === '002');
    if (conceptoAsigFam && this.tieneHijos(empleado)) {
      const asignacionFamiliar = new Decimal(normativa.asignacionFamiliar).toDecimalPlaces(2).toNumber();
      conceptosDetalle.push({
        id: conceptoAsigFam.id,
        monto: asignacionFamiliar,
        observaciones: 'Asignación familiar'
      });
      totalIngresos += asignacionFamiliar;
    }

    // 2. DESCUENTOS

    // Base asegurable: la asignación familiar es remuneración computable (Ley 25129),
    // por lo que integra la base de AFP/ONP y del aporte a ESSALUD.
    const baseAsegurable = totalIngresos;

    // Gratificaciones de julio y diciembre (Ley 27735) más la bonificación
    // extraordinaria del 9 % que sustituye el aporte a EsSalud (Ley 30334).
    // Se suman DESPUÉS de fijar la base asegurable porque están inafectas de
    // aportes y contribuciones; sí son renta de quinta categoría, y el impuesto
    // se calcula más abajo sobre el total de ingresos.
    const mesesGratificables = mesesGratificablesDelPeriodo(
      periodo ?? '',
      parseFechaLocal(empleado?.fecha_ingreso),
    );

    if (mesesGratificables !== null && mesesGratificables > 0) {
      const gratificacion = calcularGratificacionTrunca(baseAsegurable, mesesGratificables);

      const conceptoGratificacion = conceptos.find(c => c.codigo === '006');
      if (conceptoGratificacion) {
        conceptosDetalle.push({
          id: conceptoGratificacion.id,
          monto: gratificacion.gratificacion,
          observaciones: `Gratificación ${mesesGratificables}/6 del semestre`,
        });
        totalIngresos += gratificacion.gratificacion;
      }

      const conceptoBonificacion = conceptos.find(c => c.codigo === '007');
      if (conceptoBonificacion) {
        conceptosDetalle.push({
          id: conceptoBonificacion.id,
          monto: gratificacion.bonificacionExtraordinaria,
          observaciones: 'Bonificación extraordinaria 9% (Ley 30334)',
        });
        totalIngresos += gratificacion.bonificacionExtraordinaria;
      }
    }

    const contratoActual = contratoVigenteDe(empleado);
    const regimenPensionario = contratoActual?.regimen_pensionario || 'AFP';

    if (regimenPensionario === 'AFP') {
      // AFP - Aporte obligatorio (10%)
      // ✅ FIX: Usar Decimal.js para cálculos de nómina
      const aporteAFP = new Decimal(baseAsegurable).times(normativa.afpAporte).toDecimalPlaces(2).toNumber();
      const conceptoAporteAFP = conceptos.find(c => c.codigo === '101');
      if (conceptoAporteAFP) {
        conceptosDetalle.push({
          id: conceptoAporteAFP.id,
          monto: aporteAFP,
          observaciones: 'AFP 10%'
        });
        totalDescuentos += aporteAFP;
      }

      // AFP - Comisión (varía por AFP — usar tasas vigentes SBS)
      // TODO: Estas tasas deben ser configurables por tenant y AFP del empleado
      // Tasa por defecto: AFP Integra comisión flujo 1.55% (vigente 2024-2025)
      const tasaComisionAFP = contratoActual?.tasa_comision_afp ?? normativa.afpComisionFlujoDefault;
      const comisionAFP = new Decimal(baseAsegurable).times(tasaComisionAFP).toDecimalPlaces(2).toNumber();
      const conceptoComisionAFP = conceptos.find(c => c.codigo === '102');
      if (conceptoComisionAFP) {
        conceptosDetalle.push({
          id: conceptoComisionAFP.id,
          monto: comisionAFP,
          observaciones: `Comisión AFP ${(tasaComisionAFP * 100).toFixed(2)}%`
        });
        totalDescuentos += comisionAFP;
      }

      // AFP - Seguro de invalidez vigente SBS 2026: 1.37%.
      const tasaSeguroAFP = contratoActual?.tasa_seguro_afp ?? normativa.afpPrimaSeguro;
      const seguroAFP = new Decimal(baseAsegurable).times(tasaSeguroAFP).toDecimalPlaces(2).toNumber();
      const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
      if (conceptoSeguroAFP) {
        conceptosDetalle.push({
          id: conceptoSeguroAFP.id,
          monto: seguroAFP,
          observaciones: `Seguro AFP ${(tasaSeguroAFP * 100).toFixed(2)}%`
        });
        totalDescuentos += seguroAFP;
      }
    } else if (regimenPensionario === 'ONP') {
      // ONP (13%)
      const aporteONP = new Decimal(baseAsegurable).times(normativa.onpAporte).toDecimalPlaces(2).toNumber();
      const conceptoONP = conceptos.find(c => c.codigo === '104');
      if (conceptoONP) {
        conceptosDetalle.push({
          id: conceptoONP.id,
          monto: aporteONP,
          observaciones: 'ONP 13%'
        });
        totalDescuentos += aporteONP;
      }
    }

    // Impuesto a la Renta (solo si supera las 7 UIT anuales)
    const impuestoRenta = this.calcularImpuestoRenta(totalIngresos, normativa);
    if (impuestoRenta > 0) {
      const conceptoImpuesto = conceptos.find(c => c.codigo === '105');
      if (conceptoImpuesto) {
        conceptosDetalle.push({
          id: conceptoImpuesto.id,
          monto: impuestoRenta,
          observaciones: 'Impuesto a la Renta'
        });
        totalDescuentos += impuestoRenta;
      }
    }

    // 3. APORTES DEL EMPLEADOR

    // ESSALUD (9%)
    const aporteESSALUD = new Decimal(baseAsegurable).times(normativa.essaludAporte).toDecimalPlaces(2).toNumber();
    const conceptoESSALUD = conceptos.find(c => c.codigo === '201');
    if (conceptoESSALUD) {
      conceptosDetalle.push({
        id: conceptoESSALUD.id,
        monto: aporteESSALUD,
        observaciones: 'ESSALUD 9%'
      });
      totalAportes += aporteESSALUD;
    }

    const netoPagar = totalIngresos - totalDescuentos;

    return {
      totalIngresos,
      totalDescuentos,
      totalAportes,
      netoPagar,
      conceptosDetalle
    };
  }

  // Verificar si el empleado tiene hijos
  private tieneHijos(empleado: any): boolean {
    // ✅ FIX: Usar datos reales del empleado en lugar de aleatorio
    // Verificar campo tiene_hijos o cantidad_hijos del empleado
    if (empleado.tiene_hijos === true) return true;
    if (empleado.cantidad_hijos && empleado.cantidad_hijos > 0) return true;
    // Verificar si tiene familiares registrados como hijos
    if (empleado.familiares?.some((f: any) => f.parentesco === 'hijo')) return true;
    // Por defecto, si tiene el campo asignacion_familiar activo
    if (empleado.asignacion_familiar === true) return true;
    return false;
  }

  // Calcular impuesto a la renta 5ta categoría (Perú 2026).
  private calcularImpuestoRenta(
    ingresoMensual: number,
    normativa: NormativaPeruPeriodo = NORMATIVA_PERU_2026_DEFAULT,
  ): number {
    // ✅ FIX: Usar Decimal.js para precisión en cálculos tributarios
    const ingreso = new Decimal(ingresoMensual);
    const ingresoAnual = ingreso.times(12);
    const uit = new Decimal(normativa.uit);
    const limite = uit.times(normativa.quintaDeduccionUit); // 7 UIT exoneradas

    if (ingresoAnual.lte(limite)) {
      return 0; // No paga impuesto
    }

    // Cálculo según tramos de renta de 5ta categoría
    const exceso = ingresoAnual.minus(limite);
    let impuestoAnual = new Decimal(0);

    const tramo1 = uit.times(5);  // Hasta 5 UIT: 8%
    const tramo2 = uit.times(20); // De 5 a 20 UIT: 14%
    const tramo3 = uit.times(35); // De 20 a 35 UIT: 17%
    const tramo4 = uit.times(45); // De 35 a 45 UIT: 20%
    // Más de 45 UIT: 30%

    if (exceso.lte(tramo1)) {
      impuestoAnual = exceso.times(0.08);
    } else if (exceso.lte(tramo2)) {
      impuestoAnual = tramo1.times(0.08).plus(exceso.minus(tramo1).times(0.14));
    } else if (exceso.lte(tramo3)) {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(exceso.minus(tramo2).times(0.17));
    } else if (exceso.lte(tramo4)) {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(tramo3.minus(tramo2).times(0.17))
        .plus(exceso.minus(tramo3).times(0.20));
    } else {
      impuestoAnual = tramo1.times(0.08)
        .plus(tramo2.minus(tramo1).times(0.14))
        .plus(tramo3.minus(tramo2).times(0.17))
        .plus(tramo4.minus(tramo3).times(0.20))
        .plus(exceso.minus(tramo4).times(0.30));
    }

    // Retornar impuesto mensual con 2 decimales
    return impuestoAnual.dividedBy(12).toDecimalPlaces(2).toNumber();
  }

  // Obtener detalle de planilla por empleado
  async getDetallePlanilla(planillaId: string, tenantId: string) {
    this.logger.debug(`📊 Obteniendo detalle de planilla: ${planillaId}`);

    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_planilla')
      .select(`
        *,
        empleados(nombres, apellidos, numero_documento),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, metadata)
        )
      `)
      .eq('id_planilla', planillaId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Error obteniendo detalle de planilla:', error);
      throw error;
    }

    this.logger.debug(`📋 Detalle obtenido: ${data?.length || 0} empleados`);
    return (data || []).map((empleadoPlanilla: any) => ({
      ...empleadoPlanilla,
      empleado_planilla_conceptos: (empleadoPlanilla.empleado_planilla_conceptos || []).map((concepto: any) => ({
        ...concepto,
        conceptos_planilla: concepto.conceptos_planilla
          ? {
              ...concepto.conceptos_planilla,
              tipo: concepto.conceptos_planilla.metadata?.tipo || null,
            }
          : concepto.conceptos_planilla,
      })),
    }));
  }

  // Generar boleta de pago individual
  async getBoleta(empleadoPlanillaId: string, tenantId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleado_planilla')
      .select(`
        *,
        empleados(*, departamentos(nombre)),
        planillas(*),
        empleado_planilla_conceptos(
          monto,
          observaciones,
          conceptos_planilla(codigo, nombre, metadata)
        )
      `)
      .eq('id', empleadoPlanillaId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return {
      ...data,
      empleado_planilla_conceptos: (data.empleado_planilla_conceptos || []).map((concepto: any) => ({
        ...concepto,
        conceptos_planilla: concepto.conceptos_planilla
          ? {
              ...concepto.conceptos_planilla,
              tipo: concepto.conceptos_planilla.metadata?.tipo || null,
            }
          : concepto.conceptos_planilla,
      })),
    };
  }

  // Actualizar planilla (para cambiar estado, por ejemplo)
  async updatePlanilla(planillaId: string, updateData: any, tenantId?: string) {
    const query = this.supabaseService.getClient()
      .from('planillas')
      .update(updateData)
      .eq('id', planillaId);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.select();

    if (error) throw error;
    return data[0];
  }

  // Eliminar planilla y todos sus datos asociados
  async deletePlanilla(planillaId: string, tenantId?: string) {
    this.logger.debug(`🗑️ Iniciando eliminación de planilla: ${planillaId}`);
    const client = this.supabaseService.getClient();

    try {
      // 1. Eliminar conceptos de empleados en planilla (cascada automática por FK)
      this.logger.debug('🧹 Eliminando conceptos de empleados...');

      // 2. Eliminar empleados de planilla (cascada automática por FK)
      this.logger.debug('🧹 Eliminando empleados de planilla...');

      // 3. Eliminar la planilla principal
      this.logger.debug('🧹 Eliminando planilla principal...');
      const query = client
        .from('planillas')
        .delete()
        .eq('id', planillaId);

      if (tenantId) {
        query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.select();

      if (error) {
        console.error('❌ Error eliminando planilla:', error);
        throw error;
      }

      this.logger.debug('✅ Planilla eliminada exitosamente');
      return {
        success: true,
        message: 'Planilla eliminada exitosamente',
        deletedPlanilla: data[0]
      };

    } catch (error) {
      console.error('❌ Error en proceso de eliminación:', error);
      throw error;
    }
  }

  // ✅ FIX: Agregar soporte multi-tenant
  async getConceptos(tenantId?: string) {
    const client = this.supabaseService.getClient();
    const buildConceptosBase = (existingCodes: Set<string> = new Set<string>()) =>
      CONCEPTOS_PLANILLA_BASE
        .filter((concepto) => !existingCodes.has(concepto.codigo))
        .map((concepto) => ({
          tenant_id: tenantId,
          codigo: concepto.codigo,
          nombre: concepto.nombre,
          estado: 'ACTIVO',
          activo: true,
          metadata: { tipo: concepto.tipo, seed: 'rrhh_runtime_default' },
        }));

    let query = client
      .from('conceptos_planilla')
      .select('*')
      .eq('activo', true)
      .order('codigo', { ascending: true });

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (tenantId) {
      const existingCodes = new Set<string>((data || []).map((concepto: any) => String(concepto.codigo || '').trim()));
      const missingConceptos = buildConceptosBase(existingCodes);

      if (missingConceptos.length > 0) {
        const { error: seedError } = await client
          .from('conceptos_planilla')
          .insert(missingConceptos);

        if (seedError && (seedError as any)?.code !== '23505') {
          throw seedError;
        }

        const { data: seeded, error: reloadError } = await client
          .from('conceptos_planilla')
          .select('*')
          .eq('activo', true)
          .eq('tenant_id', tenantId)
          .order('codigo', { ascending: true });

        if (reloadError) throw reloadError;
        return {
          success: true,
          data: seeded || []
        };
      }
    }

    if (!tenantId && (!data || data.length === 0)) {
      return {
        success: true,
        data: CONCEPTOS_PLANILLA_BASE.map((concepto) => ({
          ...concepto,
          activo: true,
          estado: 'ACTIVO',
          metadata: { tipo: concepto.tipo, seed: 'rrhh_runtime_default_readonly' },
        }))
      };
    }

    return {
      success: true,
      data: data || []
    };
  }

  async seedConceptosPlanillaTenant(tenantId: string) {
    const client = this.supabaseService.getClient();
    const conceptosBase = CONCEPTOS_PLANILLA_BASE.map((concepto) => ({
      tenant_id: tenantId,
      codigo: concepto.codigo,
      nombre: concepto.nombre,
      estado: 'ACTIVO',
      activo: true,
      metadata: { tipo: concepto.tipo, seed: 'rrhh_runtime_default' },
    }));

    const { data, error } = await client
        .from('conceptos_planilla')
        .upsert(conceptosBase, { onConflict: 'tenant_id,codigo', ignoreDuplicates: true })
        .select('*')
        .order('codigo', { ascending: true });

    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  async calcularPlanillaPersonalizada(planillaId: string, empleadosPersonalizados: any[], tenantId?: string) {
    this.logger.debug(`🧮 Iniciando cálculo personalizado de planilla: ${planillaId}`);
    if (!Array.isArray(empleadosPersonalizados) || empleadosPersonalizados.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un empleado');
    }
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para calcular una planilla');
    }

    this.logger.debug(`👥 Empleados personalizados: ${empleadosPersonalizados.length}`);

    const client = this.supabaseService.getClient();

    const { data: planillaInfo, error: planillaError } = await client
      .from('planillas')
      .select('periodo, estado, estado_pago')
      .eq('id', planillaId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (planillaError) {
      throw planillaError;
    }
    if (!planillaInfo) {
      throw new NotFoundException('Planilla no encontrada');
    }
    if (String(planillaInfo.estado).toLowerCase() !== 'borrador') {
      throw new ConflictException(
        `La planilla ya fue ${planillaInfo.estado}. No se puede recalcular sin anular primero.`,
      );
    }

    const entradasPorId = new Map<string, any>();
    for (const entrada of empleadosPersonalizados) {
      const empleadoId = String(entrada?.id ?? entrada?.empleado_id ?? '').trim();
      if (!empleadoId) {
        throw new BadRequestException('Cada registro debe incluir empleado_id');
      }
      if (entradasPorId.has(empleadoId)) {
        throw new BadRequestException(`Empleado duplicado en la solicitud: ${empleadoId}`);
      }
      entradasPorId.set(empleadoId, entrada);
    }

    const { data: empleadosCanonicos, error: empleadosError } = await client
      .from('empleados')
      .select('*, contratos(*)')
      .in('id', [...entradasPorId.keys()])
      .eq('tenant_id', tenantId)
      .eq('estado', 'activo');

    if (empleadosError) {
      throw empleadosError;
    }
    if ((empleadosCanonicos?.length ?? 0) !== entradasPorId.size) {
      throw new BadRequestException('La solicitud contiene empleados inexistentes, inactivos o de otro tenant');
    }

    const normativa = await this.obtenerNormativaPeruPeriodo(planillaInfo?.periodo, tenantId);

    const conceptosResult = await this.getConceptos(tenantId);
    const conceptos = conceptosResult.data;

    this.logger.debug(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);

    if (!conceptos || conceptos.length === 0) {
      throw new BadRequestException('No se encontraron conceptos de planilla configurados');
    }

    const calculosPersistencia: CalculoEmpleadoPersistencia[] = [];

    for (const empleadoCanonico of empleadosCanonicos || []) {
      const entrada = entradasPorId.get(empleadoCanonico.id);
      const contrato = contratoVigenteDe(empleadoCanonico);
      if (!contrato) {
        throw new BadRequestException(
          `El empleado ${empleadoCanonico.nombres || empleadoCanonico.id} no tiene contrato vigente`,
        );
      }

      const empleado = {
        ...empleadoCanonico,
        dias_trabajados: entrada.dias_trabajados,
        horas_extras_25: entrada.horas_extras_25,
        horas_extras_35: entrada.horas_extras_35,
        tardanzas_minutos: entrada.tardanzas_minutos,
        faltas: entrada.faltas,
        bonos_adicionales: entrada.bonos_adicionales,
        sueldo_base: contrato.sueldo_bruto,
      };
      const calculoEmpleado = this.calcularEmpleadoPersonalizado(empleado, conceptos, normativa);

      calculosPersistencia.push({
        empleado_id: empleadoCanonico.id,
        dias_trabajados: Number(empleado.dias_trabajados ?? 0),
        horas_extras_25: Number(empleado.horas_extras_25 ?? 0),
        horas_extras_35: Number(empleado.horas_extras_35 ?? 0),
        tardanzas_minutos: Number(empleado.tardanzas_minutos ?? 0),
        faltas: Number(empleado.faltas ?? 0),
        total_ingresos: calculoEmpleado.totalIngresos,
        total_descuentos: calculoEmpleado.totalDescuentos,
        total_aportes: calculoEmpleado.totalAportes,
        neto_pagar: calculoEmpleado.netoPagar,
        conceptos: calculoEmpleado.conceptosDetalle.map((concepto: any) => ({
          concepto_id: concepto.id,
          monto: concepto.monto,
          observaciones: concepto.observaciones,
        })),
      });
    }

    const resultado = await this.guardarCalculoPlanillaAtomico(
      planillaId,
      tenantId,
      calculosPersistencia,
    );

    this.logger.debug(`✅ Planilla personalizada calculada exitosamente:`);
    this.logger.debug(`   - Empleados procesados: ${resultado.totalEmpleados}`);
    this.logger.debug(`   - Total ingresos: S/ ${Number(resultado.totalIngresos).toFixed(2)}`);
    this.logger.debug(`   - Total descuentos: S/ ${Number(resultado.totalDescuentos).toFixed(2)}`);
    this.logger.debug(`   - Total neto: S/ ${Number(resultado.totalNeto).toFixed(2)}`);

    return resultado;
  }

  // Lógica de cálculo personalizada por empleado
  private calcularEmpleadoPersonalizado(
    empleado: any,
    conceptos: any[],
    normativa: NormativaPeruPeriodo = NORMATIVA_PERU_2026_DEFAULT,
  ) {
    const conceptosDetalle = [];
    let totalIngresos = 0;
    let totalDescuentos = 0;
    let totalAportes = 0;

    // Validar datos del empleado
    if (!empleado) {
      console.error('❌ Empleado no definido');
      throw new BadRequestException('Datos del empleado requeridos');
    }

    const sueldoBasico = Number(empleado.sueldo_base);
    const diasTrabajados = Number(empleado.dias_trabajados);
    const horasExtras25 = parseFloat(empleado.horas_extras_25) || 0;
    const horasExtras35 = parseFloat(empleado.horas_extras_35) || 0;
    const tardanzasMinutos = parseInt(empleado.tardanzas_minutos) || 0;
    const faltas = parseInt(empleado.faltas) || 0;
    const bonosAdicionales = parseFloat(empleado.bonos_adicionales) || 0;

    this.logger.debug(`Calculando empleado ID=${empleado.id}`);

    if (!Number.isFinite(sueldoBasico) || sueldoBasico <= 0) {
      throw new BadRequestException(
        `El empleado ${empleado.nombres || empleado.id} no tiene sueldo contractual válido`,
      );
    }
    if (!Number.isInteger(diasTrabajados) || diasTrabajados < 0 || diasTrabajados > 30) {
      throw new BadRequestException(
        `Días trabajados inválidos para ${empleado.nombres || empleado.id}: ${empleado.dias_trabajados}`,
      );
    }

    // 1. INGRESOS

    // Sueldo básico (proporcional a días trabajados)
    const conceptoBasico = conceptos.find(c => c.codigo === '001');
    if (conceptoBasico) {
      const sueldoProporcional = (sueldoBasico / 30) * diasTrabajados;
      conceptosDetalle.push({
        id: conceptoBasico.id,
        monto: sueldoProporcional,
        observaciones: `Sueldo ${diasTrabajados} días`
      });
      totalIngresos += sueldoProporcional;
    }

    // Asignación familiar: 10% de la RMV vigente (Ley 25129).
    //
    // Este calculo lo usa la planilla creada desde la pantalla, que envia los
    // importes por empleado. Solo la otra rama aplicaba la asignacion, de modo
    // que quien tenia hijos cobraba S/ 113 de menos y la base de aportes salia
    // subdeclarada.
    const conceptoAsigFam = conceptos.find(c => c.codigo === '002');
    if (conceptoAsigFam && this.tieneHijos(empleado)) {
      const asignacionFamiliar = new Decimal(normativa.asignacionFamiliar)
        .toDecimalPlaces(2)
        .toNumber();
      conceptosDetalle.push({
        id: conceptoAsigFam.id,
        monto: asignacionFamiliar,
        observaciones: 'Asignación familiar',
      });
      totalIngresos += asignacionFamiliar;
    }

    // Horas extras 25%
    if (horasExtras25 > 0) {
      const conceptoHE25 = conceptos.find(c => c.codigo === '003');
      if (conceptoHE25) {
        const valorHora = sueldoBasico / (30 * 8); // 8 horas por día
        const montoHE25 = valorHora * horasExtras25 * 1.25;
        conceptosDetalle.push({
          id: conceptoHE25.id,
          monto: montoHE25,
          observaciones: `${horasExtras25} horas al 25%`
        });
        totalIngresos += montoHE25;
      }
    }

    // Horas extras 35%
    if (horasExtras35 > 0) {
      const conceptoHE35 = conceptos.find(c => c.codigo === '004');
      if (conceptoHE35) {
        const valorHora = sueldoBasico / (30 * 8);
        const montoHE35 = valorHora * horasExtras35 * 1.35;
        conceptosDetalle.push({
          id: conceptoHE35.id,
          monto: montoHE35,
          observaciones: `${horasExtras35} horas al 35%`
        });
        totalIngresos += montoHE35;
      }
    }

    // Bonos adicionales
    if (bonosAdicionales > 0) {
      const conceptoBono = conceptos.find(c => c.codigo === '005');
      if (conceptoBono) {
        conceptosDetalle.push({
          id: conceptoBono.id,
          monto: bonosAdicionales,
          observaciones: 'Bono adicional'
        });
        totalIngresos += bonosAdicionales;
      }
    }

    // 2. DESCUENTOS

    // Descuento por tardanzas (valor por minuto)
    if (tardanzasMinutos > 0) {
      const conceptoTardanzas = conceptos.find(c => c.codigo === '106');
      if (conceptoTardanzas) {
        const valorMinuto = sueldoBasico / (30 * 8 * 60);
        const descuentoTardanzas = valorMinuto * tardanzasMinutos;
        conceptosDetalle.push({
          id: conceptoTardanzas.id,
          monto: descuentoTardanzas,
          observaciones: `${tardanzasMinutos} minutos de tardanza`
        });
        totalDescuentos += descuentoTardanzas;
      }
    }

    // Descuento por faltas
    if (faltas > 0) {
      const conceptoFaltas = conceptos.find(c => c.codigo === '107');
      if (conceptoFaltas) {
        const valorDia = sueldoBasico / 30;
        const descuentoFaltas = valorDia * faltas;
        conceptosDetalle.push({
          id: conceptoFaltas.id,
          monto: descuentoFaltas,
          observaciones: `${faltas} días de falta`
        });
        totalDescuentos += descuentoFaltas;
      }
    }

    // Descuentos automáticos (AFP/ONP) - usar datos del empleado si están disponibles
    const contratoVigente = contratoVigenteDe(empleado);
    if (!contratoVigente) {
      throw new BadRequestException(
        `El empleado ${empleado.nombres || empleado.id} no tiene contrato vigente`,
      );
    }
    const regimenPensionario = String(contratoVigente.regimen_pensionario || '').toUpperCase();
    if (!['AFP', 'ONP'].includes(regimenPensionario)) {
      throw new BadRequestException(
        `El empleado ${empleado.nombres || empleado.id} no tiene régimen pensionario válido`,
      );
    }

    if (regimenPensionario === 'AFP') {
      // TODO: Tasas AFP deben ser configurables por tenant y AFP del empleado
      const contratoEmpleado = contratoVigente;
      const tasaComisionAFP2 = contratoEmpleado?.tasa_comision_afp ?? normativa.afpComisionFlujoDefault;
      const tasaSeguroAFP2 = contratoEmpleado?.tasa_seguro_afp ?? normativa.afpPrimaSeguro;
      const aporteAFP = new Decimal(totalIngresos).times(normativa.afpAporte).toDecimalPlaces(2).toNumber();
      const comisionAFP = new Decimal(totalIngresos).times(tasaComisionAFP2).toDecimalPlaces(2).toNumber();
      const seguroAFP = new Decimal(totalIngresos).times(tasaSeguroAFP2).toDecimalPlaces(2).toNumber();

      const conceptoAporteAFP = conceptos.find(c => c.codigo === '101');
      if (conceptoAporteAFP) {
        conceptosDetalle.push({
          id: conceptoAporteAFP.id,
          monto: aporteAFP,
          observaciones: 'AFP 10%'
        });
        totalDescuentos += aporteAFP;
      }

      const conceptoComisionAFP = conceptos.find(c => c.codigo === '102');
      if (conceptoComisionAFP) {
        conceptosDetalle.push({
          id: conceptoComisionAFP.id,
          monto: comisionAFP,
          observaciones: `Comisión AFP ${(tasaComisionAFP2 * 100).toFixed(2)}%`
        });
        totalDescuentos += comisionAFP;
      }

      const conceptoSeguroAFP = conceptos.find(c => c.codigo === '103');
      if (conceptoSeguroAFP) {
        conceptosDetalle.push({
          id: conceptoSeguroAFP.id,
          monto: seguroAFP,
          observaciones: `Seguro AFP ${(tasaSeguroAFP2 * 100).toFixed(2)}%`
        });
        totalDescuentos += seguroAFP;
      }
    } else if (regimenPensionario === 'ONP') {
      const aporteONP = new Decimal(totalIngresos).times(normativa.onpAporte).toDecimalPlaces(2).toNumber();
      const conceptoONP = conceptos.find(c => c.codigo === '104');
      if (conceptoONP) {
        conceptosDetalle.push({
          id: conceptoONP.id,
          monto: aporteONP,
          observaciones: 'ONP 13%'
        });
        totalDescuentos += aporteONP;
      }
    }

    const impuestoRenta = this.calcularImpuestoRenta(totalIngresos, normativa);
    const conceptoImpuesto = conceptos.find(c => c.codigo === '105');
    if (conceptoImpuesto && impuestoRenta > 0) {
      conceptosDetalle.push({
        id: conceptoImpuesto.id,
        monto: impuestoRenta,
        observaciones: 'Impuesto a la Renta de quinta categoría',
      });
      totalDescuentos += impuestoRenta;
    }

    const aporteESSALUD = new Decimal(totalIngresos).times(normativa.essaludAporte).toDecimalPlaces(2).toNumber();
    const conceptoESSALUD = conceptos.find(c => c.codigo === '201');
    if (conceptoESSALUD && aporteESSALUD > 0) {
      conceptosDetalle.push({
        id: conceptoESSALUD.id,
        monto: aporteESSALUD,
        observaciones: `ESSALUD ${(normativa.essaludAporte * 100).toFixed(2)}%`
      });
      totalAportes += aporteESSALUD;
    }

    const netoPagar = new Decimal(totalIngresos).minus(totalDescuentos).toDecimalPlaces(2).toNumber();
    if (netoPagar < 0) {
      throw new BadRequestException(
        `Los descuentos superan los ingresos del empleado ${empleado.nombres || empleado.id}`,
      );
    }

    return {
      conceptosDetalle,
      totalIngresos,
      totalDescuentos,
      totalAportes,
      netoPagar
    };
  }

  /**
   * Pagar planilla completa - Genera pagos individuales y emite evento contable
   */
  async pagarPlanillaCompleta(planillaId: string, metodoPago: 'efectivo' | 'transferencia', tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para pagar una planilla');
    }

    this.logger.debug(`💰 [RRHH] Pago atómico de planilla ${planillaId} por ${metodoPago}`);
    const { data, error } = await this.supabaseService.getClient().rpc(
      'pagar_planilla_completa_tx',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_metodo_pago: metodoPago,
        p_usuario_id: 'sistema',
      },
    );

    if (error) {
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      if (error.code === '23514' || error.code === '40001') {
        throw new ConflictException(error.message);
      }
      if (error.code === '22023') throw new BadRequestException(error.message);
      throw error;
    }
    if (!data?.success) {
      throw new Error('La transacción de pago de planilla no confirmó su finalización');
    }

    this.logger.debug(
      `✅ Planilla ${data.periodo} pagada: S/ ${data.totalPagado}, ${data.empleadosPagados} empleados`,
    );
    return {
      success: true,
      message: 'Planilla pagada exitosamente',
      data,
    };
  }

  /**
   * Pagar empleados seleccionados de una planilla
   */
  async pagarEmpleadosSeleccionados(planillaId: string, pagoData: any, tenantId?: string) {
    try {
      this.logger.debug(`💰 [RRHH] Pagando empleados seleccionados de planilla ${planillaId}`);

      const { empleados_ids, metodo_pago, numero_operacion, observaciones } = pagoData;

      if (!empleados_ids || empleados_ids.length === 0) {
        throw new BadRequestException('Debe seleccionar al menos un empleado');
      }

      let planillaInfoQuery = this.supabaseService.getClient()
        .from('planillas')
        .select('periodo, tenant_id')
        .eq('id', planillaId);

      if (tenantId) {
        planillaInfoQuery = planillaInfoQuery.eq('tenant_id', tenantId);
      }

      const { data: planillaInfo, error: planillaInfoError } = await planillaInfoQuery.single();
      if (planillaInfoError || !planillaInfo) {
        throw new NotFoundException('Planilla no encontrada para el tenant');
      }

      const tenantIdPlanilla = tenantId || planillaInfo.tenant_id;

      let empleadosPlanillaQuery = this.supabaseService.getClient()
        .from('empleado_planilla')
        .select('*')
        .in('id', empleados_ids)
        .eq('id_planilla', planillaId);

      if (tenantIdPlanilla) {
        empleadosPlanillaQuery = empleadosPlanillaQuery.eq('tenant_id', tenantIdPlanilla);
      }

      const { data: empleadosPlanilla, error } = await empleadosPlanillaQuery;

      if (error) throw error;
      if (!empleadosPlanilla || empleadosPlanilla.length === 0) {
        throw new BadRequestException('No se encontraron empleados de planilla para pagar');
      }

      let totalPagado = 0;
      const empleadosPagados = [];
      const numeroOperacionNormalizado =
        numero_operacion && /^\d+$/.test(String(numero_operacion))
          ? Number(numero_operacion)
          : null;
      const observacionesPago = [
        observaciones || null,
        numero_operacion && !numeroOperacionNormalizado ? `Operacion: ${numero_operacion}` : null,
      ].filter(Boolean).join(' | ') || null;

      // Procesar cada empleado
      for (const empleadoPlanilla of empleadosPlanilla) {
        const { error: updateError } = await this.supabaseService.getClient()
          .from('empleado_planilla')
          .update({
            estado_pago: 'pagado',
            fecha_pago: new Date().toISOString(),
            metodo_pago: metodo_pago,
            numero_operacion: numeroOperacionNormalizado,
            observaciones_pago: observacionesPago
          })
          .eq('id', empleadoPlanilla.id)
          .eq('id_planilla', planillaId);

        if (updateError) {
          console.error('Error actualizando empleado planilla:', updateError);
          continue;
        }

        totalPagado += parseFloat(empleadoPlanilla.neto_pagar) || 0;
        empleadosPagados.push(empleadoPlanilla);
      }

      // Crear registro en historial de pagos
      const { error: historialError } = await this.supabaseService.getClient()
        .from('historial_pagos_planilla')
        .insert({
          planilla_id: planillaId,
          fecha: new Date().toISOString(),
          metodo: metodo_pago,
          monto: totalPagado,
          empleados_count: empleadosPagados.length,
          numero_operacion: numero_operacion || null,
          observaciones: observaciones || null
        });

      if (historialError) {
        console.warn('Error creando historial de pago:', historialError);
      }

      // 🎯 SINCRONIZAR CON TABLA RRHH_PAGOS para que aparezca en "Pagos & Comprobantes"
      const fechaPago = new Date().toISOString();

      const periodoDisplay = planillaInfo?.periodo || new Date().toISOString().substring(0, 7);

      this.logger.debug(`🔄 [RRHH] Sincronizando ${empleadosPagados.length} pagos con tabla rrhh_pagos...`);

      for (const empleadoPlanilla of empleadosPagados) {
        const empleadoId = empleadoPlanilla.id_empleado || empleadoPlanilla.empleado_id;
        this.logger.debug(`📝 [RRHH] Insertando pago para empleado ${empleadoId}:`, {
          empleado_id: empleadoId,
          planilla_id: planillaId,
          periodo: periodoDisplay,
          monto_bruto: parseFloat(empleadoPlanilla.total_ingresos) || 0,
          descuentos: parseFloat(empleadoPlanilla.total_descuentos) || 0,
          monto_neto: parseFloat(empleadoPlanilla.neto_pagar) || 0,
          metodo_pago: metodo_pago
        });

        const { error: rrhhPagoError } = await this.supabaseService.getClient()
          .from('rrhh_pagos')
          .insert({
            tenant_id: tenantIdPlanilla,
            empleado_id: empleadoId,
            planilla_id: planillaId,
            periodo: periodoDisplay, // Usar el período real de la planilla
            monto_bruto: parseFloat(empleadoPlanilla.total_ingresos) || 0,
            descuentos: parseFloat(empleadoPlanilla.total_descuentos) || 0,
            monto_neto: parseFloat(empleadoPlanilla.neto_pagar) || 0,
          metodo_pago: metodo_pago,
          estado: 'PROCESADO',
          fecha_pago: fechaPago,
          usuario_id: 'sistema'
        });

        if (rrhhPagoError) {
          console.error('❌ Error sincronizando con rrhh_pagos:', rrhhPagoError);
          throw new Error(`No se pudo registrar pago RRHH: ${rrhhPagoError.message}`);
        } else {
          this.logger.debug(`✅ Pago sincronizado para empleado ${empleadoId}`);
        }
      }

      this.logger.debug(`✅ [RRHH] Sincronización completada - ${empleadosPagados.length} registros en rrhh_pagos`)

      // 🎯 GENERAR ASIENTOS CONTABLES AUTOMÁTICAMENTE
      try {
        this.logger.debug('📊 [RRHH] Generando asientos contables automáticamente...');
        await this.generarAsientosContables(planillaId, planillaInfo?.tenant_id);
        this.logger.debug('✅ [RRHH] Asientos contables generados automáticamente');
      } catch (asientosError) {
        console.warn('⚠️ [RRHH] Error generando asientos automáticos (no crítico):', asientosError);
      }

      return {
        success: true,
        message: `Pago procesado para ${empleadosPagados.length} empleados`,
        data: {
          empleados_pagados: empleadosPagados.length,
          total_pagado: totalPagado,
          metodo_pago,
          asientos_generados: true
        }
      };

    } catch (error) {
      console.error('❌ Error pagando empleados seleccionados:', error);
      throw error;
    }
  }

  /**
   * Obtener UUID de cuenta por código
   */
  private async getCuentaIdPorCodigo(codigo: string, tenantId: string): Promise<string> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('plan_cuentas')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', codigo)
        .eq('activo', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        const cuentaDefault = RRHH_CUENTAS_PLANILLA_DEFAULT[codigo];
        if (!cuentaDefault) {
          throw new Error(`Cuenta contable ${codigo} no encontrada para el tenant`);
        }

        const { data: creada, error: crearError } = await this.supabaseService.getClient()
          .from('plan_cuentas')
          .insert({
            tenant_id: tenantId,
            codigo,
            nombre: cuentaDefault.nombre,
            tipo: cuentaDefault.tipo,
            tipo_cuenta: cuentaDefault.tipo_cuenta,
            nivel: cuentaDefault.nivel,
            acepta_movimiento: true,
            activo: true,
            estado: 'ACTIVO',
            metadata: { source: 'rrhh_runtime_account_seed' },
          })
          .select('id')
          .single();

        if (!crearError && creada?.id) {
          this.logger.warn(`Cuenta contable ${codigo} fue creada automáticamente para tenant ${tenantId}`);
          return creada.id;
        }

        const isDuplicate = (crearError as any)?.code === '23505' ||
          String((crearError as any)?.message || '').toLowerCase().includes('duplicate key');
        if (isDuplicate) {
          const { data: existente, error: existenteError } = await this.supabaseService.getClient()
            .from('plan_cuentas')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('codigo', codigo)
            .eq('activo', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!existenteError && existente?.id) {
            return existente.id;
          }
        }

        throw new Error(`Cuenta contable ${codigo} no encontrada para el tenant`);
      }

      return data.id;
    } catch (error) {
      console.error(`❌ Error buscando cuenta ${codigo}:`, error);
      throw error;
    }
  }

  /**
   * Generar asientos contables para planilla
   */
  async generarAsientosContables(planillaId: string, tenantId?: string) {
    try {
      this.logger.debug(`📊 [RRHH] Generando asientos contables para planilla ${planillaId}`);

      // Obtener planilla con empleados
      let planillaQuery = this.supabaseService.getClient()
        .from('planillas')
        .select(`
          *,
          empleado_planilla(*)
        `)
        .eq('id', planillaId);

      if (tenantId) {
        planillaQuery = planillaQuery.eq('tenant_id', tenantId);
      }

      const { data: planilla, error } = await planillaQuery.single();

      if (error || !planilla) {
        throw new NotFoundException('Planilla no encontrada');
      }

      const tenantIdPlanilla = tenantId || planilla.tenant_id;
      if (!tenantIdPlanilla) {
        throw new BadRequestException('La planilla no tiene tenant_id; no se puede generar asiento contable');
      }

      const referenciaPlanilla = `PLANILLA-${planillaId}`;
      const sourceEventId = planillaId;
      const fechaAsiento = this.getFechaAsientoPlanilla(planilla.periodo);
      await this.validarPeriodoContableAbierto(tenantIdPlanilla, fechaAsiento);

      const { data: asientoExistente, error: asientoExistenteError } = await this.supabaseService.getClient()
        .from('asientos_contables')
        .select('id, numero_asiento, codigo, referencia, total_debe, total_haber')
        .eq('tenant_id', tenantIdPlanilla)
        .or(`referencia.eq.${referenciaPlanilla},source_event_id.eq.${sourceEventId}`)
        .limit(1)
        .maybeSingle();

      if (asientoExistenteError) {
        throw new Error(`Error validando asiento existente de planilla: ${asientoExistenteError.message}`);
      }

      if (asientoExistente?.id) {
        await this.supabaseService.getClient()
          .from('planillas')
          .update({
            asientos_generados: true,
            fecha_asientos: new Date().toISOString(),
          })
          .eq('id', planillaId)
          .eq('tenant_id', tenantIdPlanilla);

        return {
          success: true,
          message: 'La planilla ya tenía asiento contable generado; se retorna el asiento existente',
          data: {
            numero_asiento: asientoExistente.numero_asiento,
            codigo_asiento: asientoExistente.codigo,
            asiento_id: asientoExistente.id,
            registros: 0,
            monto_total: Number(asientoExistente.total_debe ?? 0),
            planilla_periodo: planilla.periodo,
            existente: true,
            tablas_utilizadas: ['asientos_contables', 'detalle_asientos']
          }
        };
      }

      // ✅ FIX: Normalizar comparación de estados (case-insensitive)
      const estadoNormalizado = (planilla.estado || '').toUpperCase();
      this.logger.debug(`🔍 [RRHH] Estado de la planilla: ${planilla.estado} (normalizado: ${estadoNormalizado})`);
      this.logger.debug(`🔍 [RRHH] Empleados en planilla: ${planilla.empleado_planilla?.length || 0}`);

      if (estadoNormalizado !== 'CALCULADA' && (!planilla.empleado_planilla || planilla.empleado_planilla.length === 0)) {
        throw new ConflictException(`No se pueden generar asientos - Estado: ${planilla.estado}, Empleados: ${planilla.empleado_planilla?.length || 0}`);
      }

      // Calcular totales
      const totalIngresos = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.total_ingresos) || 0), 0
      );
      const totalDescuentos = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.total_descuentos) || 0), 0
      );
      const totalNeto = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.neto_pagar) || 0), 0
      );
      const totalAportesEmpleados = planilla.empleado_planilla.reduce(
        (sum, emp) => sum + (parseFloat(emp.total_aportes) || 0), 0
      );
      const totalAportesPlanilla = Number(planilla.total_aportes ?? 0);
      const totalAportes = totalAportesPlanilla > 0 ? totalAportesPlanilla : totalAportesEmpleados;

      // Encolado outbox opcional para que Contabilidad genere asiento de planilla (pipeline resiliente)
      const usarOutboxPlanilla = process.env.PLANILLA_OUTBOX_ENABLED === 'true';
      if (usarOutboxPlanilla) {
        const idempotencyKey = `planilla.liquidada:${planilla.tenant_id}:${planillaId}:${planilla.periodo}`;
        const buscarEventoExistente = async () => {
          const { data: eventoExistente, error: eventoExistenteError } = await this.supabaseService.getClient()
            .from('outbox_events')
            .select('event_id, status, processed_at, error_message')
            .eq('tenant_id', planilla.tenant_id)
            .eq('event_type', 'planilla.liquidada')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (eventoExistenteError) {
            throw new Error(`Error validando evento contable existente de planilla: ${eventoExistenteError.message}`);
          }

          return eventoExistente;
        };

        const eventoPrevio = await buscarEventoExistente();
        if (eventoPrevio?.event_id) {
          this.logger.debug(
            `♻️ [RRHH] Evento planilla.liquidada ya estaba encolado (${eventoPrevio.event_id}); se garantiza asiento sincronico por idempotencia`
          );
        } else {
          const eventId = sourceEventId;
          const outboxEvent = OutboxEventBuilder.build({
            tenantId: planilla.tenant_id,
            eventType: 'planilla.liquidada',
            aggregateType: 'planilla',
            aggregateId: planillaId,
            idempotencyKey,
            eventData: {
              planillaId,
              periodo: planilla.periodo,
              fecha: new Date().toISOString(),
              totalIngresos,
              totalAportes,
              totalDescuentos,
              totalNeto,
              centro_costo_id: planilla.centro_costo_id,
              eventId,
            },
          });

          const { error: outboxError } = await this.supabaseService.getClient()
            .from('outbox_events')
            .insert(outboxEvent);

          if (outboxError) {
            const isDuplicateOutbox = outboxError.code === '23505' ||
              String(outboxError.message || '').toLowerCase().includes('duplicate key');
            if (isDuplicateOutbox) {
              const eventoDuplicado = await buscarEventoExistente();
              if (eventoDuplicado?.event_id) {
                this.logger.debug(
                  `♻️ [RRHH] Insercion idempotente detecto evento planilla.liquidada existente (${eventoDuplicado.event_id}); se garantiza asiento sincronico`
                );
              } else {
                throw new Error(`No se pudo resolver evento contable duplicado de planilla: ${outboxError.message}`);
              }
            } else {
              throw new Error(`No se pudo encolar evento contable de planilla: ${outboxError.message}`);
            }
          } else {
            this.logger.debug(
              `✅ [RRHH] Evento planilla.liquidada encolado; se crea asiento sincronico para cumplir contrato del endpoint`
            );
          }
        }
      }

      // 🎯 CREAR ASIENTOS EN SISTEMA PRINCIPAL DIRECTAMENTE
      this.logger.debug('📝 [RRHH] Creando asientos contables en sistema principal...');

      // 1. Obtener IDs reales de las cuentas del plan contable
      const cuentaGastos = await this.getCuentaIdPorCodigo('621', tenantIdPlanilla);
      const cuentaRemuneraciones = await this.getCuentaIdPorCodigo('411', tenantIdPlanilla);
      const cuentaInstituciones = await this.getCuentaIdPorCodigo('403', tenantIdPlanilla);
      const cuentaSeguridadSocial = totalAportes > 0 ? await this.getCuentaIdPorCodigo('627', tenantIdPlanilla) : null;
      const cuentaEssalud = totalAportes > 0 ? await this.getCuentaIdPorCodigo('407', tenantIdPlanilla) : null;

      this.logger.debug(`🔍 [RRHH] IDs de cuentas obtenidos:`);
      this.logger.debug(`   - Gastos (621): ${cuentaGastos}`);
      this.logger.debug(`   - Remuneraciones (411): ${cuentaRemuneraciones}`);
      this.logger.debug(`   - Instituciones (403): ${cuentaInstituciones}`);
      if (cuentaSeguridadSocial) this.logger.debug(`   - Seguridad Social (627): ${cuentaSeguridadSocial}`);
      if (cuentaEssalud) this.logger.debug(`   - ESSALUD (407): ${cuentaEssalud}`);

      // 2. Crear cabecera del asiento en tabla principal. La BD asigna numero_asiento/codigo.
      this.logger.debug(`📊 [RRHH] Creando cabecera del asiento de planilla ${planilla.periodo}`);

      const { data: asientoCreado, error: asientoError } = await this.supabaseService.getClient()
        .from('asientos_contables')
        .insert({
          tenant_id: tenantIdPlanilla,
          fecha: fechaAsiento,
          tipo_asiento: 'PLANILLA',
          origen: 'RRHH',
          concepto: `Planilla de sueldos ${planilla.periodo}`,
          referencia: referenciaPlanilla,
          total_debe: totalIngresos + totalAportes,
          total_haber: totalIngresos + totalAportes,
          estado: 'CONFIRMADO',
          source_event_id: sourceEventId,
          usuario_id: null
        })
        .select()
        .single();

      if (asientoError) {
        console.error('❌ [RRHH] Error creando cabecera del asiento:', asientoError);
        throw new Error(`Error creando asiento contable: ${asientoError.message}`);
      }

      this.logger.debug('✅ [RRHH] Cabecera del asiento creada:', asientoCreado.id);

      // 3. Crear detalles del asiento
      const detallesAsiento = [
        {
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaGastos,
          debe: totalIngresos,
          haber: 0,
          fecha: fechaAsiento,
          nombre: `Gasto planilla ${planilla.periodo}`
        },
        {
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaRemuneraciones,
          debe: 0,
          haber: totalNeto,
          fecha: fechaAsiento,
          nombre: `Remuneraciones por pagar ${planilla.periodo}`
        },
        {
          tenant_id: tenantIdPlanilla,
          asiento_id: asientoCreado.id,
          cuenta_id: cuentaInstituciones,
          debe: 0,
          haber: totalDescuentos,
          fecha: fechaAsiento,
          nombre: `Aportes planilla ${planilla.periodo}`
        }
      ];

      // ESSALUD patronal (9%): DEBE 627, HABER 407
      if (totalAportes > 0 && cuentaSeguridadSocial && cuentaEssalud) {
        detallesAsiento.push(
          {
            tenant_id: tenantIdPlanilla,
            asiento_id: asientoCreado.id,
            cuenta_id: cuentaSeguridadSocial,
            debe: totalAportes,
            haber: 0,
            fecha: fechaAsiento,
            nombre: `ESSALUD patronal ${planilla.periodo}`
          },
          {
            tenant_id: tenantIdPlanilla,
            asiento_id: asientoCreado.id,
            cuenta_id: cuentaEssalud,
            debe: 0,
            haber: totalAportes,
            fecha: fechaAsiento,
            nombre: `ESSALUD por pagar ${planilla.periodo}`
          }
        );
      }

      this.logger.debug(`📝 [RRHH] Insertando ${detallesAsiento.length} detalles del asiento...`);

      // 4. Insertar detalles
      const { error: detallesError } = await this.supabaseService.getClient()
        .from('detalle_asientos')
        .insert(detallesAsiento);

      if (detallesError) {
        console.error('❌ [RRHH] Error insertando detalles del asiento:', detallesError);
        // Eliminar cabecera si fallan los detalles
        await this.supabaseService.getClient()
          .from('asientos_contables')
          .delete()
          .eq('id', asientoCreado.id);
        throw new Error(`Error creando detalles del asiento: ${detallesError.message}`);
      }

      const numeroAsientoGenerado = asientoCreado.numero_asiento;
      const codigoAsientoGenerado = asientoCreado.codigo;
      this.logger.debug(
        '✅ [RRHH] Asiento contable completo creado exitosamente:',
        codigoAsientoGenerado ?? numeroAsientoGenerado ?? asientoCreado.id
      );

      // Marcar planilla como con asientos generados
      try {
        await this.supabaseService.getClient()
          .from('planillas')
          .update({
            asientos_generados: true,
            fecha_asientos: new Date().toISOString()
          })
          .eq('id', planillaId)
          .eq('tenant_id', tenantIdPlanilla);
        this.logger.debug('✅ Planilla marcada con asientos generados');
      } catch (updateError) {
        console.warn('⚠️ Error actualizando flag de asientos:', updateError);
      }

      return {
        success: true,
        message: 'Asientos contables generados correctamente en sistema principal',
        data: {
          numero_asiento: numeroAsientoGenerado,
          codigo_asiento: codigoAsientoGenerado,
          asiento_id: asientoCreado.id,
          registros: detallesAsiento.length,
          monto_total: totalIngresos + totalAportes,
          planilla_periodo: planilla.periodo,
          tablas_utilizadas: ['asientos_contables', 'detalle_asientos']
        }
      };

    } catch (error) {
      console.error('❌ Error generando asientos contables:', error);
      throw error;
    }
  }

  /**
   * Obtener historial de pagos de una planilla
   */
  async getHistorialPagos(planillaId: string, tenantId: string) {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('historial_pagos_planilla')
        .select('*')
        .eq('planilla_id', planillaId)
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: false });

      if (error) {
        console.warn('Tabla historial_pagos_planilla no existe:', error);
        return { success: true, data: [] };
      }

      return {
        success: true,
        data: data || []
      };

    } catch (error) {
      console.error('❌ Error obteniendo historial de pagos:', error);
      return { success: true, data: [] };
    }
  }

  private getFechaAsientoPlanilla(periodo: string): string {
    if (/^\d{4}-\d{2}$/.test(periodo || '')) {
      return `${periodo}-01`;
    }

    return new Date().toISOString().split('T')[0];
  }

  private async validarPeriodoContableAbierto(tenantId: string, fechaAsiento: string): Promise<void> {
    const fecha = new Date(`${fechaAsiento}T00:00:00.000Z`);
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth() + 1;

    const { data: periodo, error } = await this.supabaseService.getClient()
      .from('periodos_contables')
      .select('estado')
      .eq('tenant_id', tenantId)
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle();

    if (error) {
      throw new Error(`Error validando período contable de planilla: ${error.message}`);
    }

    const estado = String(periodo?.estado || 'ABIERTO').toUpperCase();
    if (estado === 'CERRADO' || estado === 'BLOQUEADO') {
      throw new Error(
        `El período contable ${anio}-${String(mes).padStart(2, '0')} está ${estado}. ` +
        'No se pueden generar asientos de planilla en períodos cerrados o bloqueados.'
      );
    }
  }
}
