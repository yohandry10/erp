import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService, PlanillaCalculadaEvent } from '../../shared/events/event-bus.service';
import Decimal from 'decimal.js';
import {
  anioDelPeriodo,
  calcularRetencionQuintaPeru,
  gratificacionesPendientesDelEjercicio,
  mesDelPeriodo,
} from './renta-quinta-peru.util';
import { OutboxEventBuilder } from '../../shared/outbox/outbox-event.interface';
import {
  calcularGratificacionTrunca,
  diasEnPeriodo,
  dividirRemuneracionPorVacaciones,
  mesesGratificablesDelPeriodo,
  parseFechaLocal,
} from './liquidacion-peru.util';
import {
  calcularPlanillaArgentina,
  NORMATIVA_ARGENTINA_2026_DEFAULT,
  NormativaArgentinaPeriodo,
} from './planillas-argentina.util';
import {
  calcularPlanillaColombia,
  NORMATIVA_COLOMBIA_2026_DEFAULT,
  NormativaColombiaPeriodo,
} from './planillas-colombia.util';
import { RrhhCountryService } from './rrhh-country.service';

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

const CONCEPTOS_PLANILLA_ARGENTINA = [
  { codigo: 'AR001', nombre: 'Sueldo básico', tipo: 'ingreso' },
  { codigo: 'AR002', nombre: 'Vacaciones', tipo: 'ingreso' },
  { codigo: 'AR003', nombre: 'Sueldo anual complementario (SAC)', tipo: 'ingreso' },
  { codigo: 'AR004', nombre: 'Horas extras 50%', tipo: 'ingreso' },
  { codigo: 'AR005', nombre: 'Horas extras 100%', tipo: 'ingreso' },
  { codigo: 'AR006', nombre: 'Adicional remunerativo', tipo: 'ingreso' },
  { codigo: 'AR101', nombre: 'Aporte jubilatorio SIPA', tipo: 'descuento' },
  { codigo: 'AR102', nombre: 'Aporte INSSJP', tipo: 'descuento' },
  { codigo: 'AR103', nombre: 'Aporte de obra social', tipo: 'descuento' },
  { codigo: 'AR104', nombre: 'Aporte sindical', tipo: 'descuento' },
  { codigo: 'AR105', nombre: 'Retención de Ganancias', tipo: 'descuento' },
  { codigo: 'AR201', nombre: 'Contribuciones patronales', tipo: 'aporte_empleador' },
  { codigo: 'AR202', nombre: 'Aseguradora de Riesgos del Trabajo (ART)', tipo: 'aporte_empleador' },
  { codigo: 'AR203', nombre: 'Seguro colectivo de vida obligatorio', tipo: 'aporte_empleador' },
];

const CONCEPTOS_PLANILLA_COLOMBIA = [
  { codigo: 'CO001', nombre: 'Salario básico', tipo: 'ingreso' },
  { codigo: 'CO002', nombre: 'Auxilio de transporte', tipo: 'ingreso' },
  { codigo: 'CO003', nombre: 'Horas extra diurnas', tipo: 'ingreso' },
  { codigo: 'CO004', nombre: 'Horas extra nocturnas', tipo: 'ingreso' },
  { codigo: 'CO005', nombre: 'Recargo nocturno', tipo: 'ingreso' },
  { codigo: 'CO006', nombre: 'Otros devengados', tipo: 'ingreso' },
  { codigo: 'CO101', nombre: 'Aporte trabajador a salud', tipo: 'descuento' },
  { codigo: 'CO102', nombre: 'Aporte trabajador a pensión', tipo: 'descuento' },
  { codigo: 'CO103', nombre: 'Fondo de Solidaridad Pensional', tipo: 'descuento' },
  { codigo: 'CO104', nombre: 'Retención en la fuente', tipo: 'descuento' },
  { codigo: 'CO105', nombre: 'Otras deducciones', tipo: 'descuento' },
  { codigo: 'CO201', nombre: 'Aporte empleador a salud', tipo: 'aporte_empleador' },
  { codigo: 'CO202', nombre: 'Aporte empleador a pensión', tipo: 'aporte_empleador' },
  { codigo: 'CO203', nombre: 'Riesgos laborales ARL', tipo: 'aporte_empleador' },
  { codigo: 'CO204', nombre: 'Caja de compensación familiar', tipo: 'aporte_empleador' },
  { codigo: 'CO205', nombre: 'Aporte SENA', tipo: 'aporte_empleador' },
  { codigo: 'CO206', nombre: 'Aporte ICBF', tipo: 'aporte_empleador' },
  { codigo: 'CO207', nombre: 'Provisión prima de servicios', tipo: 'aporte_empleador' },
  { codigo: 'CO208', nombre: 'Provisión cesantías', tipo: 'aporte_empleador' },
  { codigo: 'CO209', nombre: 'Provisión intereses de cesantías', tipo: 'aporte_empleador' },
  { codigo: 'CO210', nombre: 'Provisión vacaciones', tipo: 'aporte_empleador' },
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

/** Concepto de retención de quinta categoría; ancla el historial del ejercicio. */
const CODIGO_CONCEPTO_QUINTA = '105';

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
    private readonly eventBus: EventBusService,
    @Optional() private readonly countryService?: RrhhCountryService,
  ) { }

  private async obtenerPaisLaboral(tenantId?: string): Promise<'PE' | 'AR' | 'CO'> {
    if (!tenantId || !this.countryService) return 'PE';
    return (await this.countryService.obtenerContexto(tenantId)).codigo;
  }

  private monedaPais(pais: 'PE' | 'AR' | 'CO'): 'PEN' | 'ARS' | 'COP' {
    return pais === 'AR' ? 'ARS' : pais === 'CO' ? 'COP' : 'PEN';
  }

  private throwPlanillaRpcError(error: any): never {
    const message = String(error?.message || 'No se pudo completar la operación de planilla');
    if (error?.code === '42501') throw new ForbiddenException(message);
    if (error?.code === 'P0002') throw new NotFoundException(message);
    if (['22003', '22007', '22008', '22023', '22P02'].includes(error?.code)) {
      throw new BadRequestException(message);
    }
    if (['23503', '23505', '23514', '40001'].includes(error?.code)) {
      throw new ConflictException(message);
    }
    throw error;
  }

  private async guardarCalculoPlanillaAtomico(
    planillaId: string,
    tenantId: string | undefined,
    empleados: CalculoEmpleadoPersistencia[],
    actorId: string,
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
        p_actor_id: actorId,
      },
    );

    if (error) this.throwPlanillaRpcError(error);

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

  async getDestinosTesoreriaPlanilla(tenantId: string, actorId: string) {
    const client = this.supabaseService.getClient();
    const [cuentasResult, sesionesResult] = await Promise.all([
      client
        .from('cuentas_bancarias')
        .select('id, nombre, banco, numero_cuenta, moneda, saldo, saldo_actual, activa, activo, estado')
        .eq('tenant_id', tenantId)
        .eq('activa', true)
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      client
        .from('sesiones_caja')
        .select('id, caja_id, nombre, moneda, estado, congelada, monto_inicial, monto_inicio')
        .eq('tenant_id', tenantId)
        .ilike('estado', 'abierta')
        .eq('congelada', false)
        .or(
          `cajero_id.eq.${actorId},usuario_id.eq.${actorId},abierto_por.eq.${actorId},usuario_apertura.eq.${actorId}`,
        ),
    ]);
    if (cuentasResult.error) throw cuentasResult.error;
    if (sesionesResult.error) throw sesionesResult.error;
    return {
      success: true,
      data: {
        cuentas_bancarias: cuentasResult.data || [],
        sesiones_caja: sesionesResult.data || [],
      },
    };
  }

  // Crear nueva planilla
  // ✅ FIX: Agregar soporte multi-tenant
  async crearPlanilla(planillaData: any, tenantId?: string, actorId?: string) {
    if (!tenantId || !actorId) {
      throw new BadRequestException('Tenant y actor son obligatorios para crear una planilla');
    }
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

    const paisLaboral = await this.obtenerPaisLaboral(tenantId);
    const { data, error } = await this.supabaseService.getClient().rpc(
      'crear_planilla_tx_495',
      {
        p_tenant_id: tenantId,
        p_planilla: {
          periodo,
          pais_codigo: paisLaboral,
          moneda: this.monedaPais(paisLaboral),
          metadata,
        },
        p_actor_id: actorId,
        p_idempotency_key: String(planillaData?.idempotency_key || ''),
      },
    );
    if (error) this.throwPlanillaRpcError(error);
    if (!data?.success) throw new Error('La creación atómica de planilla no confirmó su resultado');
    return data;
  }

  // Calcular planilla mensual para todos los empleados activos
  // ✅ FIX: Agregar soporte multi-tenant
  async calcularPlanillaMensual(planillaId: string, tenantId?: string, actorId?: string) {
    if (!actorId) throw new BadRequestException('El actor es obligatorio para calcular planilla');
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

    if (planillaEstado?.estado === 'aprobada' || planillaEstado?.estado === 'pagada') {
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

    const paisLaboral = await this.obtenerPaisLaboral(tenantId);
    const conceptosResult = await this.getConceptos(tenantId);
    const conceptos = conceptosResult.data;

    this.logger.debug(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);

    if (!conceptos || conceptos.length === 0) {
      throw new BadRequestException('No se encontraron conceptos de planilla configurados');
    }

    if (!planillaEstado?.periodo) {
      throw new BadRequestException('Planilla sin periodo; no se puede resolver normativa laboral/tributaria');
    }

    const normativaPeru =
      paisLaboral === 'PE'
        ? await this.obtenerNormativaPeruPeriodo(planillaEstado.periodo, tenantId)
        : null;
    const normativaArgentina =
      paisLaboral === 'AR'
        ? await this.obtenerNormativaArgentinaPeriodo(planillaEstado.periodo, tenantId)
        : null;
    const normativaColombia =
      paisLaboral === 'CO'
        ? await this.obtenerNormativaColombiaPeriodo(planillaEstado.periodo, tenantId)
        : null;

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

    // El Art. 40 necesita lo percibido y lo ya retenido en el ejercicio. Se
    // resuelve una sola vez para todos los empleados, no dentro del bucle.
    const historialQuinta = paisLaboral === 'PE'
      ? await this.obtenerHistorialQuintaEjercicio(
          tenantId as string,
          (empleados || []).map((e: any) => String(e.id)),
          planillaEstado.periodo,
        )
      : new Map<string, { percibido: number; retenido: number }>();

    // Procesar cada empleado
    for (const empleado of empleados) {
      const contratoActual = contratoVigenteDe(empleado);
      if (!contratoActual) {
        this.logger.debug(`Empleado sin contrato vigente: ID=${empleado.id}`);
        continue;
      }

      const sueldoBasico = parseFloat(contratoActual.sueldo_bruto) || 0;
      this.logger.debug(`Procesando empleado ID=${empleado.id}`);

      const calculoEmpleado =
        paisLaboral === 'AR'
          ? this.calcularEmpleadoArgentina(
              empleado,
              sueldoBasico,
              conceptos,
              normativaArgentina ?? NORMATIVA_ARGENTINA_2026_DEFAULT,
              planillaEstado.periodo,
              vacacionesPorEmpleado.get(empleado.id) ?? 0,
            )
          : paisLaboral === 'CO'
            ? this.calcularEmpleadoColombia(
                empleado,
                sueldoBasico,
                conceptos,
                normativaColombia ?? NORMATIVA_COLOMBIA_2026_DEFAULT,
              )
            : this.calcularEmpleado(
              empleado,
              sueldoBasico,
              conceptos,
              normativaPeru ?? NORMATIVA_PERU_2026_DEFAULT,
              planillaEstado.periodo,
              vacacionesPorEmpleado.get(empleado.id) ?? 0,
              historialQuinta.get(empleado.id),
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

    await this.guardarCalculoPlanillaAtomico(
      planillaId,
      tenantId,
      calculosPersistencia,
      actorId,
    );

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
        .limit(1)
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

  private async obtenerNormativaArgentinaPeriodo(
    periodo?: string,
    tenantId?: string,
  ): Promise<NormativaArgentinaPeriodo> {
    const periodoNormalizado = /^\d{4}-\d{2}$/.test(String(periodo || ''))
      ? String(periodo)
      : '2026-01';
    const client = this.supabaseService.getClient();
    const fields =
      'jubilacion_aporte, inssjp_aporte, obra_social_aporte, contribucion_patronal, art_tasa, sindicato_aporte_default, seguro_vida_monto, vacaciones_divisor, horas_mensuales';
    const mapNormativa = (row: any): NormativaArgentinaPeriodo => ({
      jubilacionAporte: Number(row?.jubilacion_aporte ?? NORMATIVA_ARGENTINA_2026_DEFAULT.jubilacionAporte),
      inssjpAporte: Number(row?.inssjp_aporte ?? NORMATIVA_ARGENTINA_2026_DEFAULT.inssjpAporte),
      obraSocialAporte: Number(row?.obra_social_aporte ?? NORMATIVA_ARGENTINA_2026_DEFAULT.obraSocialAporte),
      contribucionPatronal: Number(
        row?.contribucion_patronal ?? NORMATIVA_ARGENTINA_2026_DEFAULT.contribucionPatronal,
      ),
      artTasa: Number(row?.art_tasa ?? NORMATIVA_ARGENTINA_2026_DEFAULT.artTasa),
      sindicatoAporteDefault: Number(
        row?.sindicato_aporte_default ?? NORMATIVA_ARGENTINA_2026_DEFAULT.sindicatoAporteDefault,
      ),
      seguroVidaMonto: Number(
        row?.seguro_vida_monto ?? NORMATIVA_ARGENTINA_2026_DEFAULT.seguroVidaMonto,
      ),
      vacacionesDivisor: Number(
        row?.vacaciones_divisor ?? NORMATIVA_ARGENTINA_2026_DEFAULT.vacacionesDivisor,
      ),
      horasMensuales: Number(
        row?.horas_mensuales ?? NORMATIVA_ARGENTINA_2026_DEFAULT.horasMensuales,
      ),
    });

    try {
      const base = () =>
        client
          .from('normativa_argentina_periodos')
          .select(fields)
          .eq('activo', true)
          .lte('periodo', periodoNormalizado)
          .order('periodo', { ascending: false })
          .limit(1);

      if (tenantId) {
        const { data } = await base().eq('tenant_id', tenantId).maybeSingle();
        if (data) return mapNormativa(data);
      }

      const { data, error } = await base().is('tenant_id', null).maybeSingle();
      if (!error && data) return mapNormativa(data);
      if (error) {
        this.logger.warn(`No se pudo cargar normativa Argentina ${periodoNormalizado}: ${error.message}`);
      }
    } catch (error: any) {
      this.logger.warn(
        `Normativa Argentina no disponible para ${periodoNormalizado}; usando base segura: ${error?.message ?? error}`,
      );
    }

    return { ...NORMATIVA_ARGENTINA_2026_DEFAULT };
  }

  private async obtenerNormativaColombiaPeriodo(
    periodo?: string,
    tenantId?: string,
  ): Promise<NormativaColombiaPeriodo> {
    const periodoNormalizado = /^\d{4}-\d{2}$/.test(String(periodo || ''))
      ? String(periodo)
      : '2026-01';
    const client = this.supabaseService.getClient();
    const fields =
      'salario_minimo, auxilio_transporte, salud_empleado, pension_empleado, salud_empleador, pension_empleador, caja_compensacion, sena, icbf, arl_clase_i, prima_servicios_provision, cesantias_provision, intereses_cesantias_provision, vacaciones_provision, horas_mensuales, jornada_semanal, recargo_dominical_festivo, recargo_nocturno, hora_inicio_nocturna, uvt, tope_ibc_smmlv';
    const map = (row: any): NormativaColombiaPeriodo => ({
      salarioMinimo: Number(row?.salario_minimo ?? NORMATIVA_COLOMBIA_2026_DEFAULT.salarioMinimo),
      auxilioTransporte: Number(row?.auxilio_transporte ?? NORMATIVA_COLOMBIA_2026_DEFAULT.auxilioTransporte),
      saludEmpleado: Number(row?.salud_empleado ?? NORMATIVA_COLOMBIA_2026_DEFAULT.saludEmpleado),
      pensionEmpleado: Number(row?.pension_empleado ?? NORMATIVA_COLOMBIA_2026_DEFAULT.pensionEmpleado),
      saludEmpleador: Number(row?.salud_empleador ?? NORMATIVA_COLOMBIA_2026_DEFAULT.saludEmpleador),
      pensionEmpleador: Number(row?.pension_empleador ?? NORMATIVA_COLOMBIA_2026_DEFAULT.pensionEmpleador),
      cajaCompensacion: Number(row?.caja_compensacion ?? NORMATIVA_COLOMBIA_2026_DEFAULT.cajaCompensacion),
      sena: Number(row?.sena ?? NORMATIVA_COLOMBIA_2026_DEFAULT.sena),
      icbf: Number(row?.icbf ?? NORMATIVA_COLOMBIA_2026_DEFAULT.icbf),
      arlClaseI: Number(row?.arl_clase_i ?? NORMATIVA_COLOMBIA_2026_DEFAULT.arlClaseI),
      primaServiciosProvision: Number(row?.prima_servicios_provision ?? NORMATIVA_COLOMBIA_2026_DEFAULT.primaServiciosProvision),
      cesantiasProvision: Number(row?.cesantias_provision ?? NORMATIVA_COLOMBIA_2026_DEFAULT.cesantiasProvision),
      interesesCesantiasProvision: Number(row?.intereses_cesantias_provision ?? NORMATIVA_COLOMBIA_2026_DEFAULT.interesesCesantiasProvision),
      vacacionesProvision: Number(row?.vacaciones_provision ?? NORMATIVA_COLOMBIA_2026_DEFAULT.vacacionesProvision),
      horasMensuales: Number(row?.horas_mensuales ?? NORMATIVA_COLOMBIA_2026_DEFAULT.horasMensuales),
      jornadaSemanal: Number(row?.jornada_semanal ?? NORMATIVA_COLOMBIA_2026_DEFAULT.jornadaSemanal),
      recargoDominicalFestivo: Number(row?.recargo_dominical_festivo ?? NORMATIVA_COLOMBIA_2026_DEFAULT.recargoDominicalFestivo),
      recargoNocturno: Number(row?.recargo_nocturno ?? NORMATIVA_COLOMBIA_2026_DEFAULT.recargoNocturno),
      horaInicioNocturna: Number(row?.hora_inicio_nocturna ?? NORMATIVA_COLOMBIA_2026_DEFAULT.horaInicioNocturna),
      uvt: Number(row?.uvt ?? NORMATIVA_COLOMBIA_2026_DEFAULT.uvt),
      topeIbcSmmlv: Number(row?.tope_ibc_smmlv ?? NORMATIVA_COLOMBIA_2026_DEFAULT.topeIbcSmmlv),
    });

    try {
      const base = () =>
        client
          .from('normativa_colombia_periodos')
          .select(fields)
          .eq('activo', true)
          .lte('periodo', periodoNormalizado)
          .order('periodo', { ascending: false })
          .limit(1);
      if (tenantId) {
        const { data } = await base().eq('tenant_id', tenantId).maybeSingle();
        if (data) return map(data);
      }
      const { data, error } = await base().is('tenant_id', null).maybeSingle();
      if (!error && data) return map(data);
      if (error) this.logger.warn(`No se pudo cargar normativa Colombia ${periodoNormalizado}: ${error.message}`);
    } catch (error: any) {
      this.logger.warn(`Normativa Colombia no disponible para ${periodoNormalizado}; usando base 2026: ${error?.message ?? error}`);
    }
    return { ...NORMATIVA_COLOMBIA_2026_DEFAULT };
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
    historialQuinta?: { percibido: number; retenido: number },
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

    // El régimen pensionario no se supone. Antes esta ruta caía a `|| 'AFP'` y
    // descontaba cerca del 13 % a un trabajador cuyo régimen nunca se declaró,
    // mientras la ruta personalizada rechazaba el mismo dato: dos respuestas
    // distintas para la misma entrada. Ahora ambas fallan cerrado, porque elegir
    // entre AFP y ONP es una decisión del trabajador, no un valor por defecto.
    const regimenPensionario = String(contratoActual?.regimen_pensionario || '').toUpperCase();
    if (!['AFP', 'ONP'].includes(regimenPensionario)) {
      throw new BadRequestException(
        `El empleado ${empleado?.nombres || empleado?.id} no tiene régimen pensionario válido (AFP u ONP).`,
      );
    }

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
      const tasaComisionAFP = contratoActual?.tasa_comision_afp ??
        contratoActual?.metadata?.tasa_comision_afp ??
        normativa.afpComisionFlujoDefault;
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
      const tasaSeguroAFP = contratoActual?.tasa_seguro_afp ??
        contratoActual?.metadata?.tasa_seguro_afp ??
        normativa.afpPrimaSeguro;
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

    // Retención de quinta categoría (Art. 40 del Reglamento de la LIR).
    //
    // Se pasa la remuneración ordinaria —`baseAsegurable`, fijada antes de sumar
    // la gratificación— y por separado lo gratificado en el mes. Antes se enviaba
    // el ingreso total y se multiplicaba por doce, de modo que en julio y
    // diciembre la proyección anual se duplicaba y la retención se disparaba.
    const impuestoRenta = this.calcularRetencionQuintaDelMes({
      periodo,
      remuneracionOrdinariaMes: baseAsegurable,
      gratificacionesDelMes: Math.max(0, totalIngresos - baseAsegurable),
      historial: historialQuinta,
      normativa,
    });
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

  private calcularEmpleadoArgentina(
    empleado: any,
    sueldoBasico: number,
    conceptos: any[],
    normativa: NormativaArgentinaPeriodo,
    periodo: string,
    diasVacaciones = 0,
  ) {
    const contrato = contratoVigenteDe(empleado) ?? {};
    const metadata = {
      ...(empleado?.metadata && typeof empleado.metadata === 'object' ? empleado.metadata : {}),
      ...(contrato?.metadata && typeof contrato.metadata === 'object' ? contrato.metadata : {}),
    };
    const calculo = calcularPlanillaArgentina({
      sueldoMensual: sueldoBasico,
      periodo,
      fechaIngreso: empleado?.fecha_ingreso,
      diasVacaciones,
      horasExtras50: Number(metadata.horas_extras_50 ?? empleado?.horas_extras_50 ?? 0),
      horasExtras100: Number(metadata.horas_extras_100 ?? empleado?.horas_extras_100 ?? 0),
      mejorRemuneracionSemestre: Number(metadata.mejor_remuneracion_semestre ?? sueldoBasico),
      sindicatoAporteTasa: Number(
        contrato?.sindicato_aporte_tasa ?? metadata.sindicato_aporte_tasa ?? normativa.sindicatoAporteDefault,
      ),
      gananciasRetencion: Number(
        contrato?.ganancias_retencion_mensual ?? metadata.ganancias_retencion_mensual ?? 0,
      ),
      aporteAdicional: Number(metadata.adicional_remunerativo ?? 0),
      artTasa: Number(contrato?.art_tasa ?? metadata.art_tasa ?? normativa.artTasa),
      seguroVidaMonto: Number(
        contrato?.seguro_vida_monto ?? metadata.seguro_vida_monto ?? normativa.seguroVidaMonto,
      ),
      normativa,
    });

    return {
      totalIngresos: calculo.totalIngresos,
      totalDescuentos: calculo.totalDescuentos,
      totalAportes: calculo.totalAportes,
      netoPagar: calculo.netoPagar,
      conceptosDetalle: calculo.conceptos
        .map((calculado) => {
          const concepto = conceptos.find((item) => item.codigo === calculado.codigo);
          return concepto
            ? {
                id: concepto.id,
                monto: calculado.monto,
                observaciones: calculado.observaciones,
              }
            : null;
        })
        .filter(Boolean),
    };
  }

  private calcularEmpleadoColombia(
    empleado: any,
    sueldoBasico: number,
    conceptos: any[],
    normativa: NormativaColombiaPeriodo,
  ) {
    const contrato = contratoVigenteDe(empleado) ?? {};
    const metadata = {
      ...(empleado?.metadata && typeof empleado.metadata === 'object' ? empleado.metadata : {}),
      ...(contrato?.metadata && typeof contrato.metadata === 'object' ? contrato.metadata : {}),
    };
    const calculo = calcularPlanillaColombia({
      sueldoMensual: sueldoBasico,
      diasTrabajados: Number(metadata.dias_trabajados ?? 30),
      horasExtrasDiurnas: Number(metadata.horas_extras_diurnas ?? empleado?.horas_extras_25 ?? 0),
      horasExtrasNocturnas: Number(metadata.horas_extras_nocturnas ?? empleado?.horas_extras_35 ?? 0),
      horasRecargoNocturno: Number(metadata.horas_recargo_nocturno ?? 0),
      horasDominicalesFestivas: Number(metadata.horas_dominicales_festivas ?? 0),
      horasExtrasDiurnasDominicales: Number(metadata.horas_extras_diurnas_dominicales ?? 0),
      horasExtrasNocturnasDominicales: Number(metadata.horas_extras_nocturnas_dominicales ?? 0),
      retencionFuente: Number(metadata.retencion_fuente_mensual ?? 0),
      fondoSolidaridadTasa: Number(metadata.fondo_solidaridad_tasa ?? 0),
      arlTasa: Number(contrato?.arl_tasa ?? metadata.arl_tasa ?? normativa.arlClaseI),
      exoneradoSaludSenaIcbf: Boolean(metadata.exonerado_salud_sena_icbf),
      recibeAuxilioTransporte: metadata.recibe_auxilio_transporte !== false,
      otrosDevengados: Number(metadata.otros_devengados ?? 0),
      otrasDeducciones: Number(metadata.otras_deducciones ?? 0),
      normativa,
    });

    return {
      totalIngresos: calculo.totalIngresos,
      totalDescuentos: calculo.totalDescuentos,
      totalAportes: calculo.totalAportes,
      netoPagar: calculo.netoPagar,
      conceptosDetalle: calculo.conceptos
        .map((calculado) => {
          const concepto = conceptos.find((item) => item.codigo === calculado.codigo);
          return concepto
            ? {
                id: concepto.id,
                monto: calculado.monto,
                observaciones: calculado.observaciones,
              }
            : null;
        })
        .filter(Boolean),
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
  /**
   * Historial de quinta categoría del ejercicio para un conjunto de empleados:
   * lo percibido y lo ya retenido en los periodos anteriores del mismo año.
   *
   * El artículo 40 necesita ambos datos y hasta ahora no se leían: la retención se
   * calculaba con el ingreso del mes aislado. Se resuelven en una sola pasada
   * antes del bucle de empleados para no disparar una consulta por trabajador.
   *
   * Ante cualquier fallo se devuelve un historial vacío. Eso equivale a tratar el
   * mes como el primero del ejercicio, que es el criterio conservador: proyecta
   * sobre el sueldo del mes y no descuenta retenciones que no se pudieron probar.
   */
  private async obtenerHistorialQuintaEjercicio(
    tenantId: string,
    empleadoIds: string[],
    periodo: string,
  ): Promise<Map<string, { percibido: number; retenido: number }>> {
    const historial = new Map<string, { percibido: number; retenido: number }>();
    const anio = anioDelPeriodo(periodo);
    if (!tenantId || !anio || empleadoIds.length === 0) return historial;

    try {
      const client = this.supabaseService.getClient();

      const { data: planillasPrevias } = await client
        .from('planillas')
        .select('id, periodo, estado')
        .eq('tenant_id', tenantId)
        .gte('periodo', `${anio}-01`)
        .lt('periodo', periodo);

      const idsPlanilla = (planillasPrevias || [])
        .filter((fila: any) => !['anulada', 'anulado'].includes(String(fila?.estado ?? '').toLowerCase()))
        .map((fila: any) => fila.id)
        .filter(Boolean);
      if (idsPlanilla.length === 0) return historial;

      const { data: detalles } = await client
        .from('empleado_planilla')
        .select('id, empleado_id, id_empleado, planilla_id, id_planilla, total_ingresos')
        .eq('tenant_id', tenantId);

      const detallesPrevios = (detalles || []).filter((fila: any) => {
        const planilla = String(fila?.planilla_id ?? fila?.id_planilla ?? '');
        const empleado = String(fila?.empleado_id ?? fila?.id_empleado ?? '');
        return idsPlanilla.includes(planilla) && empleadoIds.includes(empleado);
      });
      if (detallesPrevios.length === 0) return historial;

      const empleadoPorDetalle = new Map<string, string>();
      for (const fila of detallesPrevios) {
        const empleado = String((fila as any).empleado_id ?? (fila as any).id_empleado ?? '');
        empleadoPorDetalle.set(String((fila as any).id), empleado);
        const acumulado = historial.get(empleado) ?? { percibido: 0, retenido: 0 };
        acumulado.percibido += Number((fila as any).total_ingresos ?? 0) || 0;
        historial.set(empleado, acumulado);
      }

      const { data: conceptoRenta } = await client
        .from('conceptos_planilla')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('codigo', CODIGO_CONCEPTO_QUINTA)
        .maybeSingle();
      const conceptoRentaId = (conceptoRenta as any)?.id;
      if (!conceptoRentaId) return historial;

      const { data: montos } = await client
        .from('empleado_planilla_conceptos')
        .select('empleado_planilla_id, id_empleado_planilla, concepto_id, id_concepto, monto')
        .eq('tenant_id', tenantId);

      for (const fila of montos || []) {
        const concepto = String((fila as any).concepto_id ?? (fila as any).id_concepto ?? '');
        if (concepto !== String(conceptoRentaId)) continue;
        const detalle = String((fila as any).empleado_planilla_id ?? (fila as any).id_empleado_planilla ?? '');
        const empleado = empleadoPorDetalle.get(detalle);
        if (!empleado) continue;
        const acumulado = historial.get(empleado) ?? { percibido: 0, retenido: 0 };
        acumulado.retenido += Number((fila as any).monto ?? 0) || 0;
        historial.set(empleado, acumulado);
      }

      return historial;
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el historial de quinta del ejercicio; se calcula sin acumulado previo: ${(error as Error)?.message ?? error}`,
      );
      return new Map();
    }
  }

  /**
   * Retención de quinta categoría del mes, según el artículo 40 del Reglamento de
   * la LIR. La regla vive en `renta-quinta-peru.util`; aquí sólo se arman sus
   * entradas a partir del periodo y del historial del ejercicio.
   *
   * Sin un periodo `YYYY-MM` válido no hay procedimiento posible: el divisor y la
   * proyección dependen del mes. Se falla cerrado en lugar de devolver cero, que
   * sería una retención omitida y un incumplimiento silencioso del empleador.
   */
  private calcularRetencionQuintaDelMes(params: {
    periodo?: string;
    remuneracionOrdinariaMes: number;
    ingresosExtraordinariosMes?: number;
    gratificacionesDelMes?: number;
    historial?: { percibido: number; retenido: number };
    normativa: NormativaPeruPeriodo;
  }): number {
    const mes = mesDelPeriodo(params.periodo);
    if (!mes) {
      throw new BadRequestException(
        'No se puede calcular la retención de quinta categoría sin un periodo YYYY-MM: '
        + 'el divisor y la proyección anual dependen del mes.',
      );
    }

    const ordinaria = Number(params.remuneracionOrdinariaMes ?? 0) || 0;
    if (ordinaria <= 0) return 0;

    // Las gratificaciones del propio mes ya vienen calculadas por el motor (pueden
    // ser truncas); las de los meses que faltan se estiman sobre la ordinaria.
    const delMes = Number(params.gratificacionesDelMes ?? 0) || 0;
    const pendientesEstimadas = gratificacionesPendientesDelEjercicio(
      mes === 7 || mes === 12 ? mes + 1 : mes,
      ordinaria,
    );

    const resultado = calcularRetencionQuintaPeru({
      mes,
      remuneracionOrdinariaMes: ordinaria,
      percibidoMesesAnteriores: params.historial?.percibido ?? 0,
      gratificacionesPendientes: delMes + pendientesEstimadas,
      ingresosExtraordinariosMes: params.ingresosExtraordinariosMes ?? 0,
      retencionesPrevias: params.historial?.retenido ?? 0,
      uit: params.normativa.uit,
      deduccionUit: params.normativa.quintaDeduccionUit,
    });

    return resultado.retencionMes;
  }

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

  async aprobarPlanilla(planillaId: string, tenantId?: string, usuarioId = 'sistema') {
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para aprobar una planilla');
    }

    const { data, error } = await this.supabaseService.getClient().rpc(
      'aprobar_planilla_tx',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_usuario_id: usuarioId || 'sistema',
      },
    );

    if (error) this.throwPlanillaRpcError(error);
    if (!data?.success || !data?.eventId) {
      throw new Error('La aprobación no confirmó su evento contable durable');
    }

    return {
      success: true,
      message: data.idempotent
        ? 'La planilla ya estaba aprobada'
        : 'Planilla aprobada y devengo contable encolado',
      data,
    };
  }

  // Los cambios de ciclo de vida no se aceptan como updates genéricos. Se
  // conserva la aprobación por PUT como alias compatible, pero delega a la RPC.
  async updatePlanilla(
    planillaId: string,
    updateData: any,
    tenantId?: string,
    usuarioId = 'sistema',
  ) {
    const estadoSolicitado = String(updateData?.estado || '').trim().toLowerCase();
    if (estadoSolicitado === 'aprobada') {
      const keys = Object.keys(updateData || {});
      if (keys.some((key) => key !== 'estado')) {
        throw new BadRequestException(
          'La aprobación no puede mezclarse con otras modificaciones de planilla',
        );
      }
      return this.aprobarPlanilla(planillaId, tenantId, usuarioId);
    }
    if (estadoSolicitado) {
      throw new ConflictException(
        'El estado de planilla sólo cambia mediante calcular, aprobar o pagar',
      );
    }

    const camposProtegidos = [
      'tenant_id', 'estado_pago', 'fecha_pago', 'metodo_pago', 'total_pagado',
      'total_ingresos', 'total_descuentos', 'total_aportes', 'total_neto',
      'asientos_generados', 'fecha_asientos',
    ];
    if (camposProtegidos.some((campo) => campo in (updateData || {}))) {
      throw new BadRequestException(
        'Los importes, el pago y la integración contable de planilla no se editan directamente',
      );
    }
    if (!tenantId || !usuarioId || usuarioId === 'sistema') {
      throw new BadRequestException('Tenant y actor son obligatorios para editar una planilla');
    }
    const { idempotency_key: idempotencyKey, ...cambios } = updateData || {};
    const { data, error } = await this.supabaseService.getClient().rpc(
      'actualizar_planilla_borrador_tx_495',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_cambios: cambios,
        p_actor_id: usuarioId,
        p_idempotency_key: String(idempotencyKey || ''),
      },
    );
    if (error) this.throwPlanillaRpcError(error);
    return data;
  }

  // Eliminar planilla y todos sus datos asociados
  async deletePlanilla(
    planillaId: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    this.logger.debug(`🗑️ Iniciando eliminación de planilla: ${planillaId}`);
    if (!tenantId || !actorId || !idempotencyKey) {
      throw new BadRequestException('Tenant, actor y clave idempotente son obligatorios para eliminar');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'eliminar_planilla_borrador_tx_495',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_actor_id: actorId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) this.throwPlanillaRpcError(error);
    return { success: true, message: 'Planilla eliminada exitosamente', data };
  }

  // ✅ FIX: Agregar soporte multi-tenant
  async getConceptos(tenantId?: string) {
    const client = this.supabaseService.getClient();
    const paisLaboral = await this.obtenerPaisLaboral(tenantId);
    const conceptosPais =
      paisLaboral === 'AR'
        ? CONCEPTOS_PLANILLA_ARGENTINA
        : paisLaboral === 'CO'
          ? CONCEPTOS_PLANILLA_COLOMBIA
          : CONCEPTOS_PLANILLA_BASE;
    const buildConceptosBase = (existingCodes: Set<string> = new Set<string>()) =>
      conceptosPais
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
        data: conceptosPais.map((concepto) => ({
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
    const paisLaboral = await this.obtenerPaisLaboral(tenantId);
    const conceptosPais =
      paisLaboral === 'AR'
        ? CONCEPTOS_PLANILLA_ARGENTINA
        : paisLaboral === 'CO'
          ? CONCEPTOS_PLANILLA_COLOMBIA
          : CONCEPTOS_PLANILLA_BASE;
    const conceptosBase = conceptosPais.map((concepto) => ({
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

  async calcularPlanillaPersonalizada(
    planillaId: string,
    empleadosPersonalizados: any[],
    tenantId?: string,
    actorId?: string,
  ) {
    this.logger.debug(`🧮 Iniciando cálculo personalizado de planilla: ${planillaId}`);
    if (!Array.isArray(empleadosPersonalizados) || empleadosPersonalizados.length === 0) {
      throw new BadRequestException('Debe seleccionar al menos un empleado');
    }
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para calcular una planilla');
    }
    if (!actorId) {
      throw new BadRequestException('El actor es obligatorio para calcular una planilla');
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
    if (!['borrador', 'calculada'].includes(String(planillaInfo.estado).toLowerCase())) {
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

    const paisLaboral = await this.obtenerPaisLaboral(tenantId);
    const normativa =
      paisLaboral === 'PE'
        ? await this.obtenerNormativaPeruPeriodo(planillaInfo.periodo, tenantId)
        : null;
    const normativaArgentina =
      paisLaboral === 'AR'
        ? await this.obtenerNormativaArgentinaPeriodo(planillaInfo.periodo, tenantId)
        : null;
    const normativaColombia =
      paisLaboral === 'CO'
        ? await this.obtenerNormativaColombiaPeriodo(planillaInfo.periodo, tenantId)
        : null;

    const conceptosResult = await this.getConceptos(tenantId);
    const conceptos = conceptosResult.data;

    this.logger.debug(`📋 Conceptos de planilla encontrados: ${conceptos?.length || 0}`);

    if (!conceptos || conceptos.length === 0) {
      throw new BadRequestException('No se encontraron conceptos de planilla configurados');
    }

    const calculosPersistencia: CalculoEmpleadoPersistencia[] = [];

    // Igual que en el cálculo estándar: el acumulado del ejercicio se resuelve
    // una vez para todos los empleados, antes de entrar al bucle.
    const historialQuintaPersonalizada = paisLaboral === 'PE'
      ? await this.obtenerHistorialQuintaEjercicio(
          tenantId,
          (empleadosCanonicos || []).map((e: any) => String(e.id)),
          String(planillaInfo?.periodo ?? ''),
        )
      : new Map<string, { percibido: number; retenido: number }>();

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
        // Recargos colombianos: se capturaban en pantalla y se perdían aquí, así
        // que el motor los liquidaba en cero.
        horas_recargo_nocturno: entrada.horas_recargo_nocturno,
        horas_dominicales_festivas: entrada.horas_dominicales_festivas,
        sueldo_base: contrato.sueldo_bruto,
      };
      const calculoEmpleado =
        paisLaboral === 'AR'
          ? this.calcularEmpleadoArgentinaPersonalizado(
              empleado,
              conceptos,
              normativaArgentina ?? NORMATIVA_ARGENTINA_2026_DEFAULT,
              planillaInfo?.periodo,
            )
          : paisLaboral === 'CO'
            ? this.calcularEmpleadoColombiaPersonalizado(
                empleado,
                conceptos,
                normativaColombia ?? NORMATIVA_COLOMBIA_2026_DEFAULT,
              )
            : this.calcularEmpleadoPersonalizado(
              empleado,
              conceptos,
              normativa ?? NORMATIVA_PERU_2026_DEFAULT,
              planillaInfo?.periodo,
              historialQuintaPersonalizada.get(String(empleadoCanonico.id)),
            );

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
      actorId,
    );

    this.logger.debug(`✅ Planilla personalizada calculada exitosamente:`);
    const monedaLog = this.monedaPais(paisLaboral);
    this.logger.debug(`   - Empleados procesados: ${resultado.totalEmpleados}`);
    this.logger.debug(`   - Total ingresos: ${monedaLog} ${Number(resultado.totalIngresos).toFixed(2)}`);
    this.logger.debug(`   - Total descuentos: ${monedaLog} ${Number(resultado.totalDescuentos).toFixed(2)}`);
    this.logger.debug(`   - Total neto: ${monedaLog} ${Number(resultado.totalNeto).toFixed(2)}`);

    return resultado;
  }

  // Lógica de cálculo personalizada por empleado
  private calcularEmpleadoArgentinaPersonalizado(
    empleado: any,
    conceptos: any[],
    normativa: NormativaArgentinaPeriodo,
    periodo?: string,
  ) {
    if (!empleado) {
      throw new BadRequestException('Datos del empleado requeridos');
    }
    const sueldoBasico = Number(empleado.sueldo_base ?? empleado.sueldo_bruto ?? 0);
    if (sueldoBasico <= 0) {
      return {
        conceptosDetalle: [],
        totalIngresos: 0,
        totalDescuentos: 0,
        totalAportes: 0,
        netoPagar: 0,
      };
    }

    const calculo = calcularPlanillaArgentina({
      sueldoMensual: sueldoBasico,
      periodo: String(periodo || ''),
      fechaIngreso: empleado.fecha_ingreso ?? `${String(periodo || '2026-01')}-01`,
      diasTrabajados: Number(empleado.dias_trabajados ?? 30),
      diasVacaciones: Number(empleado.dias_vacaciones ?? 0),
      horasExtras50: Number(empleado.horas_extras_50 ?? empleado.horas_extras_25 ?? 0),
      horasExtras100: Number(empleado.horas_extras_100 ?? empleado.horas_extras_35 ?? 0),
      mejorRemuneracionSemestre: Number(empleado.mejor_remuneracion_semestre ?? sueldoBasico),
      sindicatoAporteTasa: Number(empleado.sindicato_aporte_tasa ?? normativa.sindicatoAporteDefault),
      gananciasRetencion: Number(empleado.ganancias_retencion ?? 0),
      aporteAdicional: Number(empleado.bonos_adicionales ?? empleado.adicional_remunerativo ?? 0),
      artTasa: Number(empleado.art_tasa ?? normativa.artTasa),
      seguroVidaMonto: Number(empleado.seguro_vida_monto ?? normativa.seguroVidaMonto),
      normativa,
    });

    return {
      conceptosDetalle: calculo.conceptos
        .map((calculado) => {
          const concepto = conceptos.find((item) => item.codigo === calculado.codigo);
          return concepto
            ? {
                id: concepto.id,
                monto: calculado.monto,
                observaciones: calculado.observaciones,
              }
            : null;
        })
        .filter(Boolean),
      totalIngresos: calculo.totalIngresos,
      totalDescuentos: calculo.totalDescuentos,
      totalAportes: calculo.totalAportes,
      netoPagar: calculo.netoPagar,
    };
  }

  private calcularEmpleadoColombiaPersonalizado(
    empleado: any,
    conceptos: any[],
    normativa: NormativaColombiaPeriodo,
  ) {
    if (!empleado) throw new BadRequestException('Datos del empleado requeridos');
    const sueldoBasico = Number(empleado.sueldo_base ?? empleado.sueldo_bruto ?? 0);
    if (sueldoBasico <= 0) {
      return {
        conceptosDetalle: [],
        totalIngresos: 0,
        totalDescuentos: 0,
        totalAportes: 0,
        netoPagar: 0,
      };
    }
    const calculo = calcularPlanillaColombia({
      sueldoMensual: sueldoBasico,
      diasTrabajados: Number(empleado.dias_trabajados ?? 30),
      horasExtrasDiurnas: Number(empleado.horas_extras_diurnas ?? empleado.horas_extras_25 ?? 0),
      horasExtrasNocturnas: Number(empleado.horas_extras_nocturnas ?? empleado.horas_extras_35 ?? 0),
      horasRecargoNocturno: Number(empleado.horas_recargo_nocturno ?? 0),
      horasDominicalesFestivas: Number(empleado.horas_dominicales_festivas ?? 0),
      horasExtrasDiurnasDominicales: Number(empleado.horas_extras_diurnas_dominicales ?? 0),
      horasExtrasNocturnasDominicales: Number(empleado.horas_extras_nocturnas_dominicales ?? 0),
      retencionFuente: Number(empleado.retencion_fuente ?? 0),
      fondoSolidaridadTasa: Number(empleado.fondo_solidaridad_tasa ?? 0),
      arlTasa: Number(empleado.arl_tasa ?? normativa.arlClaseI),
      exoneradoSaludSenaIcbf: Boolean(empleado.exonerado_salud_sena_icbf),
      recibeAuxilioTransporte: empleado.recibe_auxilio_transporte !== false,
      otrosDevengados: Number(empleado.bonos_adicionales ?? empleado.otros_devengados ?? 0),
      otrasDeducciones: Number(empleado.otras_deducciones ?? 0),
      normativa,
    });
    return {
      conceptosDetalle: calculo.conceptos
        .map((calculado) => {
          const concepto = conceptos.find((item) => item.codigo === calculado.codigo);
          return concepto
            ? { id: concepto.id, monto: calculado.monto, observaciones: calculado.observaciones }
            : null;
        })
        .filter(Boolean),
      totalIngresos: calculo.totalIngresos,
      totalDescuentos: calculo.totalDescuentos,
      totalAportes: calculo.totalAportes,
      netoPagar: calculo.netoPagar,
    };
  }

  private calcularEmpleadoPersonalizado(
    empleado: any,
    conceptos: any[],
    normativa: NormativaPeruPeriodo = NORMATIVA_PERU_2026_DEFAULT,
    periodo?: string,
    historialQuinta?: { percibido: number; retenido: number },
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
      const tasaComisionAFP2 = contratoEmpleado?.tasa_comision_afp ??
        contratoEmpleado?.metadata?.tasa_comision_afp ??
        normativa.afpComisionFlujoDefault;
      const tasaSeguroAFP2 = contratoEmpleado?.tasa_seguro_afp ??
        contratoEmpleado?.metadata?.tasa_seguro_afp ??
        normativa.afpPrimaSeguro;
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

    // Esta ruta no liquida gratificaciones, así que el total del mes es la
    // remuneración ordinaria sobre la que se proyecta el ejercicio.
    const impuestoRenta = this.calcularRetencionQuintaDelMes({
      periodo,
      remuneracionOrdinariaMes: totalIngresos,
      historial: historialQuinta,
      normativa,
    });
    const conceptoImpuesto = conceptos.find(c => c.codigo === CODIGO_CONCEPTO_QUINTA);
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
  async pagarPlanillaCompleta(
    planillaId: string,
    pagoData: {
      metodo_pago: 'efectivo' | 'transferencia';
      idempotency_key: string;
      cuenta_bancaria_id?: string;
      sesion_caja_id?: string;
      referencia?: string;
      fecha_pago?: string;
    },
    tenantId?: string,
    usuarioId = 'sistema',
  ) {
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para pagar una planilla');
    }

    this.logger.debug(`💰 [RRHH] Pago atómico de planilla ${planillaId} por ${pagoData?.metodo_pago}`);
    const { data, error } = await this.supabaseService.getClient().rpc(
      'pagar_planilla_con_tesoreria_tx_495',
      {
        p_tenant_id: tenantId,
        p_planilla_id: planillaId,
        p_pago: pagoData,
        p_actor_id: usuarioId,
      },
    );

    if (error) this.throwPlanillaRpcError(error);
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
   * Alias compatible de la antigua ruta parcial. Sólo acepta el conjunto
   * completo de detalles y termina delegando en la misma RPC atómica.
   */
  async pagarEmpleadosSeleccionados(
    planillaId: string,
    pagoData: any,
    tenantId?: string,
    usuarioId = 'sistema',
  ) {
    if (!tenantId) {
      throw new BadRequestException('El tenant es obligatorio para pagar una planilla');
    }
    const metodoPago = String(pagoData?.metodo_pago || '').trim().toLowerCase();
    if (metodoPago !== 'efectivo' && metodoPago !== 'transferencia') {
      throw new BadRequestException('Método de pago no permitido');
    }

    const { data: detalles, error } = await this.supabaseService.getClient()
      .from('empleado_planilla')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('planilla_id', planillaId);
    if (error) throw error;
    if (!detalles?.length) {
      throw new BadRequestException('La planilla no contiene empleados calculados');
    }

    const seleccionados: string[] = Array.isArray(pagoData?.empleados_ids)
      ? [...new Set<string>(pagoData.empleados_ids.map((id: unknown) => String(id)))]
      : [];
    const idsEsperados = new Set(detalles.map((detalle: any) => String(detalle.id)));
    if (
      Array.isArray(pagoData?.empleados_ids)
      && (seleccionados.length !== idsEsperados.size
        || seleccionados.some((id) => !idsEsperados.has(id)))
    ) {
      throw new ConflictException(
        'Los pagos parciales por empleado fueron retirados; debe pagar la planilla completa',
      );
    }

    return this.pagarPlanillaCompleta(
      planillaId,
      {
        ...pagoData,
        metodo_pago: metodoPago as 'efectivo' | 'transferencia',
      },
      tenantId,
      usuarioId,
    );
  }

  /**
   * Alias de /rrhh/pagos/:id/procesar. El registro es sólo una proyección: la
   * autoridad sigue siendo la cabecera de planilla y su RPC de pago completo.
   */
  async procesarPagoLegado(pagoId: string, tenantId: string, usuarioId = 'sistema') {
    const { data: pago, error } = await this.supabaseService.getClient()
      .from('rrhh_pagos')
      .select('id, planilla_id, metodo_pago')
      .eq('id', pagoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!pago) throw new NotFoundException('Pago RRHH no encontrado para el tenant');
    if (!pago.planilla_id) {
      throw new ConflictException(
        'El pago legado no está vinculado a una planilla y no puede procesarse aisladamente',
      );
    }

    const metodoPago = String(pago.metodo_pago || '').trim().toLowerCase();
    if (metodoPago !== 'efectivo' && metodoPago !== 'transferencia') {
      throw new BadRequestException(
        'El pago legado no tiene un método válido; pague desde la planilla aprobada',
      );
    }
    throw new ConflictException(
      'El pago legado no contiene destino de tesorería ni clave idempotente; pague desde la planilla aprobada',
    );
  }

  async getEstadoDevengoContable(planillaId: string, tenantId: string) {
    const { data: planilla, error: planillaError } = await this.supabaseService.getClient()
      .from('planillas')
      .select('id, estado, asientos_generados, fecha_asientos, metadata')
      .eq('id', planillaId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (planillaError) throw planillaError;
    if (!planilla) throw new NotFoundException('Planilla no encontrada para el tenant');

    const { data: evento, error: eventoError } = await this.supabaseService.getClient()
      .from('outbox_events')
      .select('event_id, status, processed_at, error_message')
      .eq('tenant_id', tenantId)
      .eq('event_type', 'planilla.liquidada')
      .eq('aggregate_id', planillaId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (eventoError) throw eventoError;
    if (!evento) {
      throw new ConflictException(
        'El devengo se crea al aprobar la planilla; primero complete esa transición',
      );
    }

    return {
      success: true,
      message: evento.status === 'processed'
        ? 'El devengo contable ya fue procesado'
        : 'El devengo contable está encolado de forma durable',
      data: {
        planilla_id: planillaId,
        estado_planilla: planilla.estado,
        asientos_generados: String(planilla.asientos_generados || '').toLowerCase() === 'true',
        fecha_asientos: planilla.fecha_asientos,
        event_id: evento.event_id,
        estado_evento: evento.status,
        procesado_en: evento.processed_at,
        error: evento.error_message,
      },
    };
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
   * Implementación histórica sin llamadores runtime. Se conserva temporalmente
   * para no mezclar este cierre con la extracción del generador contable; el
   * endpoint público consulta getEstadoDevengoContable y nunca entra aquí.
   */
  private async generarAsientosContablesLegacyDeshabilitado(planillaId: string, tenantId?: string) {
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
      const paisPlanilla = await this.obtenerPaisLaboral(tenantIdPlanilla);
      const esArgentina = paisPlanilla === 'AR';
      const esColombia = paisPlanilla === 'CO';

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
              paisCodigo: paisPlanilla,
              moneda: this.monedaPais(paisPlanilla),
              eventId,
            },
          });

          const { error: outboxError } = await this.supabaseService.getClient()
            .rpc('enqueue_outbox_event_tx', { p_event: outboxEvent });

          if (outboxError) {
            throw new Error(`No se pudo encolar evento contable de planilla: ${outboxError.message}`);
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
      if (cuentaEssalud) {
        this.logger.debug(
          `   - ${
            esArgentina
              ? 'Contribuciones patronales/ART'
              : esColombia
                ? 'Seguridad social, PILA y prestaciones'
                : 'ESSALUD'
          } (407): ${cuentaEssalud}`,
        );
      }

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

      // Aportes patronales: DEBE 627, HABER 407. El cálculo proviene del
      // motor normativo del país (ESSALUD en PE; SIPA/obra social/ART en AR).
      if (totalAportes > 0 && cuentaSeguridadSocial && cuentaEssalud) {
        detallesAsiento.push(
          {
            tenant_id: tenantIdPlanilla,
            asiento_id: asientoCreado.id,
            cuenta_id: cuentaSeguridadSocial,
            debe: totalAportes,
            haber: 0,
            fecha: fechaAsiento,
            nombre: `${
              esArgentina
                ? 'Contribuciones patronales, obra social y ART'
                : esColombia
                  ? 'Seguridad social, parafiscales y prestaciones'
                  : 'ESSALUD patronal'
            } ${planilla.periodo}`
          },
          {
            tenant_id: tenantIdPlanilla,
            asiento_id: asientoCreado.id,
            cuenta_id: cuentaEssalud,
            debe: 0,
            haber: totalAportes,
            fecha: fechaAsiento,
            nombre: `${
              esArgentina
                ? 'Cargas sociales y ART por pagar'
                : esColombia
                  ? 'PILA, parafiscales y prestaciones por pagar'
                  : 'ESSALUD por pagar'
            } ${planilla.periodo}`
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
