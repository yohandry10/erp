import { requireTenantRecord } from '../../shared/utils/require-tenant-record';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import PDFDocument from 'pdfkit';
import { contratoVigenteDe } from './planillas.service';
import {
  calcularCts,
  calcularGratificacionTrunca,
  calcularIndemnizacionDespido,
  calcularVacacionesTruncas,
  diasVacacionesPendientes,
  mesesDelSemestreGratificatorio,
  remuneracionComputableCts,
  periodoGratificacionParaCts,
  regimenBonificacionGratificacionPeru,
  mesesGratificablesDelPeriodo,
  parseFechaLocal,
  semestreCts,
  tiempoComputableCts,
  tiempoDeServicios,
} from './liquidacion-peru.util';
import { calcularLiquidacionArgentina, validarCuilArgentina } from './planillas-argentina.util';
import { calcularLiquidacionColombia } from './liquidacion-colombia.util';
import { RrhhCountryService } from './rrhh-country.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { decryptText, encryptText } from '../../shared/utils/secure-config.utils';
import { fechaHoyDelTenant } from '../../shared/utils/fecha-tenant.util';
import { fechaHoyEnPeru, rangoDelDiaEnPais } from '../../shared/utils/fecha-peru.util';
import { lecturaRrhhFallida, relanzarLecturaRrhh } from './rrhh-errors';
import { readCompleteCatalog } from '../../shared/utils/complete-catalog-read';
import { escapeHtml } from '../../shared/email/templates/sanitize';
import type { GratificacionPreviaDto, GratificacionPreviaEmpleadoDto, RemuneracionGratificacionPreviaDto, RemuneracionPreviaEmpleadoDto } from './dto/rrhh-acciones.dto';
import { TIPOS_SOLICITUD_RRHH } from './dto/rrhh-operaciones.dto';
import type { NormativaPeruPeriodoDto } from './dto/normativa-peru.dto';

// Respaldo si normativa_peru_periodos no tiene fila para el periodo consultado.
const RMV_PERU_FALLBACK = 1130;

@Injectable()
export class RrhhService {
  private readonly logger = new Logger(RrhhService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Optional() private readonly eventBus?: EventBusService,
    @Optional() private readonly countryService?: RrhhCountryService,
    @Optional() private readonly configService?: ConfigService,
  ) { }

  /**
   * Única salida de escritura para RRHH operativo. El fallback de llave sólo
   * conserva compatibilidad con clientes anteriores; la Web 475 envía una
   * intención explícita y los reintentos deben reutilizarla.
   */
  private async ejecutarOperacionRrhh(
    operacion: string,
    payload: Record<string, any>,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    if (!actorId) throw new ForbiddenException('Actor autenticado requerido para modificar RRHH');
    const key = String(idempotencyKey || '').trim()
      || `rrhh-compat-${operacion.toLowerCase()}-${randomUUID()}`;
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key debe tener entre 8 y 200 caracteres');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'ejecutar_operacion_rrhh_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_operacion: operacion,
        p_payload: payload || {},
        p_idempotency_key: key,
      },
    );
    if (!error && data) return data;

    this.rechazarOperacionRrhh(error);
  }

  private rechazarOperacionRrhh(error: { code?: string; message?: string } | null): never {
    const message = String(error?.message || 'No se pudo completar la operación de RRHH');
    if (error?.code === '42501') throw new ForbiddenException(message);
    if (error?.code === 'P0002') throw new NotFoundException(message);
    // 610: el trigger de solicitudes rechaza ausencias vigentes que se cruzan.
    const cruce = /^RRHH_REQUEST_OVERLAP: estado=(\w+) tipo=(\w+) desde=(\d{4}-\d{2}-\d{2}) hasta=(\d{4}-\d{2}-\d{2})/.exec(message);
    if (cruce) {
      const fecha = (valor: string) => valor.split('-').reverse().join('/');
      throw new ConflictException(`El colaborador ya tiene una solicitud ${cruce[1]} de ${cruce[2]} `
        + `del ${fecha(cruce[3])} al ${fecha(cruce[4])} que se cruza con estas fechas`);
    }
    if (error?.code === '23505') throw new ConflictException(
      message.includes('RRHH_EMPLOYEE_DOCUMENT_DUPLICATE')
        ? 'Ya existe un empleado con el mismo documento de identidad' : message,
    );
    throw new BadRequestException(message);
  }

  private idempotencyPilaResultado(idempotencyKey: string | undefined, resultado: string) {
    const base = String(idempotencyKey || '').trim() || `pila-${randomUUID()}`;
    const candidate = `${base}:${resultado}`;
    if (candidate.length <= 200) return candidate;
    return `pila-${createHash('sha256').update(candidate, 'utf8').digest('hex')}`;
  }

  private async obtenerPaisLaboral(tenantId: string): Promise<'PE' | 'AR' | 'CO'> {
    if (!this.countryService) return 'PE';
    return (await this.countryService.obtenerContexto(tenantId)).codigo;
  }

  // ===== EMPLEADOS =====
  async getEmpleados(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await readCompleteCatalog(this.supabaseService.getClient(), 'empleados', `
        *,
        departamentos!empleados_id_departamento_fkey_runtime(nombre),
        contratos!contratos_id_empleado_fkey_runtime(*),
        rrhh_peru_fichas_laborales(*),
        empleado_horarios!empleado_horarios_id_empleado_fkey(
          id,
          horarios_trabajo!empleado_horarios_id_horario_fkey(*)
        )
      `, query => query.eq('tenant_id', currentTenantId), row => row.tenant_id === currentTenantId);

    return {
      success: true,
      data,
      tenant_id: currentTenantId,
      total: data.length,
      fuentes_empleados: { complete: true, total: data.length, page_size: 1000 },
    };
  }

  async getDepartamentos(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('departamentos')
      .select('*')
      .eq('tenant_id', currentTenantId); // ✅ Filtro de tenant

    if (error) throw lecturaRrhhFallida('los departamentos');
    return data;
  }

  async getNormativaPeruPeriodo(tenantId: string, periodo: string) {
    if (!tenantId || typeof periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
      throw new BadRequestException('Empresa y período YYYY-MM válido son obligatorios');
    }
    if (await this.obtenerPaisLaboral(tenantId) !== 'PE') {
      throw new BadRequestException('La normativa peruana corresponde únicamente a empresas Perú');
    }
    const client = this.supabaseService.getClient();
    const calculationPeriods = [periodo];
    if (periodo.endsWith('-06')) calculationPeriods.push(`${periodo.slice(0,4)}-07`);
    if (periodo.endsWith('-11')) calculationPeriods.push(`${periodo.slice(0,4)}-12`);
    const [own, global, payrolls] = await Promise.all([
      client.from('normativa_peru_periodos').select('*').eq('tenant_id', tenantId).eq('periodo', periodo).order('created_at', {ascending: false}),
      client.from('normativa_peru_periodos').select('*').is('tenant_id', null).eq('periodo', periodo).eq('activo', true).maybeSingle(),
      client.from('planillas').select('id,estado').eq('tenant_id', tenantId).in('periodo', calculationPeriods).in('estado', ['calculada','aprobada','pagada']),
    ]);
    if (own.error || global.error || payrolls.error) throw lecturaRrhhFallida('la normativa del período');
    const versions = own.data || [];
    const active = versions.find((row: any) => row.activo === true);
    return {success: true, data: {periodo, normativa: active || global.data || null,
      origen: active ? 'EMPRESA' : global.data ? 'GLOBAL' : 'SIN_CONFIGURAR',
      bloqueada: (payrolls.data || []).length > 0, versiones: versions}};
  }

  async guardarNormativaPeruPeriodo(tenantId: string, actorId: string, normativa: NormativaPeruPeriodoDto, idempotencyKey?: string) {
    const key = String(idempotencyKey || '').trim();
    if (!tenantId || !actorId) throw new ForbiddenException('Empresa y administrador autenticado son obligatorios');
    if (key.length < 8 || key.length > 200) throw new BadRequestException('Idempotency-Key debe tener entre 8 y 200 caracteres');
    const {data, error} = await this.supabaseService.getClient().rpc('guardar_normativa_peru_periodo_tx_570', {
      p_tenant_id: tenantId, p_actor_id: actorId, p_payload: normativa, p_idempotency_key: key,
    });
    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  async getConfiguracionLaboral(tenantId: string) {
    const pais = await this.obtenerPaisLaboral(tenantId);
    if (pais === 'PE') {
      const periodo = (await fechaHoyDelTenant(this.supabaseService.getClient(), tenantId)).slice(0, 7);
      const client = this.supabaseService.getClient();
      const selectNormativa =
        'periodo, uit, rmv, asignacion_familiar, afp_aporte, afp_prima_seguro, afp_comision_flujo_default, afp_remuneracion_max_asegurable, onp_aporte, essalud_aporte, quinta_deduccion_uit, bancarizacion_pen_min, bancarizacion_usd_min, igv_tasa, fuente';
      const [{ data: tenantNormativa, error: tenantError }, { data: globalNormativa, error: globalError }] =
        await Promise.all([
          client
            .from('normativa_peru_periodos')
            .select(selectNormativa)
            .eq('tenant_id', tenantId)
            .eq('activo', true)
            .eq('periodo', periodo)
            .order('periodo', { ascending: false })
            .limit(1)
            .maybeSingle(),
          client
            .from('normativa_peru_periodos')
            .select(selectNormativa)
            .is('tenant_id', null)
            .eq('activo', true)
            .eq('periodo', periodo)
            .order('periodo', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (tenantError) throw tenantError;
      if (globalError) throw globalError;
      const normativa = tenantNormativa || globalNormativa;
      // La planilla rechaza calcular la prima AFP sin este tope
      // (calcularPrimaSeguroAfp); declarar lista la configuración sin él es
      // anunciar una planilla que no se puede calcular.
      const topeAfp = Number(normativa?.afp_remuneracion_max_asegurable);
      const missing = !normativa
        ? ['normativa peruana vigente por período']
        : !(Number.isFinite(topeAfp) && topeAfp > 0)
          ? [`remuneración máxima asegurable AFP de ${normativa.periodo || periodo}`]
          : [];
      return {
        success: true,
        data: {
          pais: 'PE',
          moneda: 'PEN',
          documento_laboral: 'DNI',
          conceptos: ['AFP', 'ONP', 'EsSalud', 'quinta categoría', 'gratificaciones', 'CTS'],
          normativa,
          readiness: {
            ready: missing.length === 0,
            periodo: normativa?.periodo || periodo,
            missing,
          },
          ready: missing.length === 0,
        },
      };
    }

    const client = this.supabaseService.getClient();
    if (pais === 'CO') {
      const [{ data: configuracion, error }, { data: readiness, error: readinessError }] =
        await Promise.all([
          client
            .from('rrhh_configuracion_colombia')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle(),
          client.rpc('validar_rrhh_colombia_readiness', { p_tenant_id: tenantId }),
        ]);
      if (error) throw error;
      if (readinessError) throw readinessError;
      return {
        success: true,
        data: {
          pais: 'CO',
          moneda: 'COP',
          documento_laboral: 'CC',
          autoridad: 'UGPP / DIAN',
          configuracion: configuracion
            ? {
                ...configuracion,
                pila_api_token: configuracion.pila_api_token ? 'CONFIGURADO' : null,
                nomina_software_pin: configuracion.nomina_software_pin ? 'CONFIGURADO' : null,
              }
            : null,
          readiness,
        },
      };
    }
    const [{ data: configuracion, error }, { data: readiness, error: readinessError }] =
      await Promise.all([
        client
          .from('rrhh_configuracion_argentina')
          .select('*')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        client.rpc('validar_rrhh_argentina_readiness', { p_tenant_id: tenantId }),
      ]);
    if (error) throw error;
    if (readinessError) throw readinessError;
    return {
      success: true,
      data: {
        pais: 'AR',
        moneda: 'ARS',
        documento_laboral: 'CUIL',
        autoridad: 'ARCA',
        configuracion,
        readiness,
      },
    };
  }

  async updateConfiguracionLaboralArgentina(
    tenantId: string,
    input: any,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if ((await this.obtenerPaisLaboral(tenantId)) !== 'AR') {
      throw new BadRequestException(
        'La configuración solicitada sólo corresponde a tenants de Argentina.',
      );
    }
    const permitidos = new Set([
      'tipo_empleador',
      'jurisdiccion_laboral',
      'actividad_codigo',
      'convenio_colectivo_codigo',
      'convenio_colectivo_descripcion',
      'categoria_default',
      'art_cuit',
      'art_razon_social',
      'art_tasa',
      'obra_social_codigo_default',
      'sindicato_codigo_default',
      'sindicato_aporte_default',
      'contribucion_patronal',
      'seguro_vida_monto',
      'periodo_prueba_max_meses',
      'sistema_indemnizacion',
      'libro_sueldos_digital_habilitado',
      'simplificacion_registral_habilitada',
      'formulario_931_habilitado',
      'siradig_habilitado',
      'configuracion_confirmada',
      'metadata',
    ]);
    const payload = Object.fromEntries(
      Object.entries(input || {})
        .filter(([key]) => permitidos.has(key))
        .filter(([, value]) => value !== '' && value !== undefined),
    );
    if (payload.art_tasa !== undefined && Number(payload.art_tasa) <= 0) {
      throw new BadRequestException('La alícuota ART debe ser mayor que cero');
    }
    if (
      payload.art_cuit !== undefined &&
      !validarCuilArgentina(String(payload.art_cuit))
    ) {
      throw new BadRequestException(
        'El CUIT de la ART debe tener 11 dígitos y un dígito verificador válido',
      );
    }
    if (payload.configuracion_confirmada === true) {
      const convenio = String(payload.convenio_colectivo_codigo || '').trim();
      const art = Number(payload.art_tasa || 0);
      if (!convenio || art <= 0) {
        throw new BadRequestException(
          'Para confirmar RRHH Argentina debe indicar convenio colectivo y alícuota ART.',
        );
      }
    }

    const data = await this.ejecutarOperacionRrhh(
      'CONFIG_AR_UPDATE', payload, tenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async updateConfiguracionLaboralColombia(
    tenantId: string,
    input: any,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if ((await this.obtenerPaisLaboral(tenantId)) !== 'CO') {
      throw new BadRequestException(
        'La configuración solicitada sólo corresponde a tenants de Colombia.',
      );
    }
    const permitidos = new Set([
      'tipo_aportante',
      'actividad_economica_ciiu',
      'operador_pila',
      'pila_integracion_modo',
      'pila_operador_codigo',
      'pila_api_url',
      'pila_api_usuario',
      'pila_api_token',
      'eps_default',
      'fondo_pension_default',
      'arl_default',
      'arl_clase_riesgo',
      'arl_tasa',
      'caja_compensacion_default',
      'sena_habilitado',
      'icbf_habilitado',
      'exonerado_salud_sena_icbf',
      'nomina_electronica_habilitada',
      'nomina_software_id',
      'nomina_software_pin',
      'nomina_test_set_id',
      'pila_habilitada',
      'salario_minimo',
      'auxilio_transporte',
      'configuracion_confirmada',
      'metadata',
    ]);
    const payload = Object.fromEntries(
      Object.entries(input || {})
        .filter(([key]) => permitidos.has(key))
        .filter(([, value]) => value !== '' && value !== undefined),
    );
    const existingPilaToken = input?.pila_api_token === 'CONFIGURADO';
    const existingNominaPin = input?.nomina_software_pin === 'CONFIGURADO';
    for (const secretField of ['pila_api_token', 'nomina_software_pin']) {
      if (payload[secretField] === 'CONFIGURADO') delete payload[secretField];
      else if (payload[secretField]) {
        if (!this.configService) throw new BadRequestException('Cifrado de secretos no disponible');
        payload[secretField] = encryptText(this.configService, String(payload[secretField]));
      }
    }
    if (payload.arl_tasa !== undefined && Number(payload.arl_tasa) <= 0) {
      throw new BadRequestException('La tasa ARL debe ser mayor que cero');
    }
    if (payload.configuracion_confirmada === true) {
      const required = [
        'operador_pila',
        'eps_default',
        'fondo_pension_default',
        'arl_default',
        'caja_compensacion_default',
      ].filter((field) => !String(payload[field] || '').trim());
      if (required.length > 0 || Number(payload.arl_tasa || 0) <= 0) {
        throw new BadRequestException(
          'Para confirmar RRHH Colombia debe indicar PILA, EPS, fondo de pensión, ARL, tasa ARL y caja de compensación.',
        );
      }
      const pilaMode = String(payload.pila_integracion_modo || 'ARCHIVO_OPERADOR');
      if (pilaMode === 'API_PROVEEDOR' && (!payload.pila_api_url || (!payload.pila_api_token && !existingPilaToken))) {
        throw new BadRequestException(
          'La integración API del operador PILA requiere URL HTTPS y token.',
        );
      }
      if (payload.nomina_electronica_habilitada !== false) {
        const missingNomina = [
          !payload.nomina_software_id && 'nomina_software_id',
          !payload.nomina_test_set_id && 'nomina_test_set_id',
          !payload.nomina_software_pin && !existingNominaPin && 'nomina_software_pin',
        ].filter(Boolean);
        if (missingNomina.length) {
          throw new BadRequestException(
            `Nómina electrónica DIAN incompleta: ${missingNomina.join(', ')}.`,
          );
        }
      }
    }
    const data = await this.ejecutarOperacionRrhh(
      'CONFIG_CO_UPDATE', payload, tenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async probarIntegracionPilaColombia(
    tenantId: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if ((await this.obtenerPaisLaboral(tenantId)) !== 'CO') {
      throw new BadRequestException('La prueba PILA sólo corresponde a tenants de Colombia.');
    }
    const client = this.supabaseService.getClient();
    const [{ data: config, error }, { data: empresa, error: empresaError }] = await Promise.all([
      client.from('rrhh_configuracion_colombia').select('*').eq('tenant_id', tenantId).maybeSingle(),
      client.from('empresa_config').select('is_demo').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    if (error) throw error;
    if (empresaError) throw empresaError;
    if (!config) throw new BadRequestException('Configuración colombiana no encontrada.');
    if (empresa?.is_demo === true) {
      await this.ejecutarOperacionRrhh(
        'PILA_TEST_RESULT', { estado: 'SIMULADA' }, tenantId, actorId,
        this.idempotencyPilaResultado(idempotencyKey, 'simulada'),
      );
      return {
        success: true,
        mode: 'SIMULATED_DEMO',
        transmitted: false,
        message: 'Operador PILA sintético listo para demostración; no se enviaron datos externos.',
      };
    }

    const commonMissing = ['operador_pila', 'eps_default', 'fondo_pension_default', 'arl_default', 'caja_compensacion_default']
      .filter((field) => !String(config[field] || '').trim());
    if (commonMissing.length) {
      await this.ejecutarOperacionRrhh(
        'PILA_TEST_RESULT', { estado: 'INCOMPLETA' }, tenantId, actorId,
        this.idempotencyPilaResultado(idempotencyKey, 'incompleta'),
      );
      return { success: false, mode: config.pila_integracion_modo, missing: commonMissing };
    }

    if (config.pila_integracion_modo !== 'API_PROVEEDOR') {
      await this.ejecutarOperacionRrhh(
        'PILA_TEST_RESULT', { estado: 'CONFIGURADA' }, tenantId, actorId,
        this.idempotencyPilaResultado(idempotencyKey, 'configurada'),
      );
      return {
        success: true,
        mode: 'ARCHIVO_OPERADOR',
        transmitted: false,
        operator: config.operador_pila,
        message: 'Configuración lista para generar y cargar la planilla mediante el operador autorizado.',
      };
    }

    const url = this.assertSafeProviderUrl(config.pila_api_url);
    if (!config.pila_api_token || !this.configService) {
      return { success: false, mode: 'API_PROVEEDOR', missing: ['pila_api_token'] };
    }
    try {
      const token = decryptText(this.configService, config.pila_api_token);
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 500,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(config.pila_api_usuario ? { 'X-PILA-User': config.pila_api_usuario } : {}),
        },
      });
      const ok = response.status >= 200 && response.status < 400;
      await this.ejecutarOperacionRrhh(
        'PILA_TEST_RESULT', { estado: ok ? 'CONFIGURADA' : 'ERROR' }, tenantId, actorId,
        this.idempotencyPilaResultado(idempotencyKey, `http-${response.status}`),
      );
      return {
        success: ok,
        mode: 'API_PROVEEDOR',
        transmitted: false,
        status: response.status,
        message: ok ? 'API del operador PILA accesible.' : 'El operador rechazó la prueba de conectividad.',
      };
    } catch (requestError) {
      await this.ejecutarOperacionRrhh(
        'PILA_TEST_RESULT', { estado: 'ERROR' }, tenantId, actorId,
        this.idempotencyPilaResultado(idempotencyKey, 'error'),
      );
      return {
        success: false,
        mode: 'API_PROVEEDOR',
        transmitted: false,
        message: axios.isAxiosError(requestError)
          ? `No se pudo conectar con el operador (${requestError.code || 'ERROR'}).`
          : 'No se pudo conectar con el operador.',
      };
    }
  }

  private assertSafeProviderUrl(input: unknown): string {
    let parsed: URL;
    try {
      parsed = new URL(String(input || ''));
    } catch {
      throw new BadRequestException('URL de API PILA inválida.');
    }
    const hostname = parsed.hostname.toLowerCase();
    const privateHost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      || hostname.endsWith('.local');
    if (parsed.protocol !== 'https:' || privateHost || parsed.username || parsed.password) {
      throw new BadRequestException('La API PILA debe usar HTTPS público y no incluir credenciales en la URL.');
    }
    return parsed.toString();
  }

  // ✅ FIX: Lista de campos permitidos para prevenir inyección de datos
  private readonly CAMPOS_EMPLEADO_PERMITIDOS = [
    'nombres', 'apellidos', 'tipo_documento', 'numero_documento',
    'email', 'telefono', 'direccion', 'fecha_nacimiento', 'fecha_ingreso',
    'id_departamento', 'puesto', 'estado', 'genero', 'estado_civil',
    'nacionalidad', 'ubigeo', 'tiene_hijos', 'cantidad_hijos',
    'asignacion_familiar', 'cuenta_bancaria', 'banco', 'tipo_cuenta',
    'contacto_emergencia', 'telefono_emergencia', 'foto_url',
    'cuil', 'obra_social_codigo', 'sindicato_codigo',
    'eps_codigo', 'fondo_pension_codigo', 'arl_codigo', 'caja_compensacion_codigo',
    'situacion_revista_codigo', 'modalidad_contratacion_codigo',
    'condicion_codigo', 'actividad_codigo', 'zona_codigo',
  ];

  /**
   * Deriva el derecho a asignacion familiar de tener hijos.
   *
   * La Ley 25129 concede la asignacion a quien tiene hijos menores de 18 -o
   * hasta 24 si siguen estudios-, de modo que tener hijos ES la condicion del
   * derecho. El formulario capturaba tiene_hijos pero nadie derivaba
   * asignacion_familiar, asi que ambos campos quedaban en contradiccion y la
   * planilla no pagaba los S/ 113 que corresponden.
   */
  private derivarAsignacionFamiliar(datos: any, paisLaboral: string) {
    const tieneHijos =
      datos?.tiene_hijos === true || Number(datos?.cantidad_hijos ?? 0) > 0;

    if (tieneHijos) {
      datos.tiene_hijos = true;
      datos.asignacion_familiar = true;
    } else if (paisLaboral === 'PE' && datos?.tiene_hijos === false && datos?.cantidad_hijos === 0) {
      // Una edición explícita de ambos campos debe retirar el indicador derivado.
      // Las ediciones parciales de otros datos conservan el valor persistido.
      datos.asignacion_familiar = false;
    }

    return datos;
  }

  private limpiarEmpleadoData(empleadoData: any) {
    return Object.fromEntries(
      Object.entries(empleadoData || {})
        .filter(([key]) => this.CAMPOS_EMPLEADO_PERMITIDOS.includes(key))
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
  }

  private validarEmpleadoData(
    datos: Record<string, any>,
    partial = false,
    paisLaboral: 'PE' | 'AR' | 'CO' = 'PE',
  ) {
    const requeridos = ['nombres', 'apellidos', 'numero_documento'];
    if (!partial) {
      const faltantes = requeridos.filter((campo) => !datos[campo]);
      if (faltantes.length > 0) {
        throw new BadRequestException(`Campos requeridos faltantes: ${faltantes.join(', ')}`);
      }
    }

    const tiposPermitidos =
      paisLaboral === 'AR'
        ? ['CUIL', 'CUIT', 'DNI', 'PASAPORTE', 'OTRO']
        : paisLaboral === 'CO'
          ? ['CC', 'CE', 'TI', 'NIT', 'PASAPORTE', 'OTRO']
          : ['DNI', 'CE', 'PASAPORTE', 'RUC', 'OTRO'];
    const tipoDocumento = String(datos.tipo_documento || '').toUpperCase();
    if (tipoDocumento && !tiposPermitidos.includes(tipoDocumento)) {
      throw new BadRequestException('Tipo de documento inválido');
    }

    if (tipoDocumento === 'DNI' && datos.numero_documento && !/^\d{7,8}$/.test(String(datos.numero_documento))) {
      if (paisLaboral === 'AR' && /^\d{7,8}$/.test(String(datos.numero_documento))) {
        // DNI argentino: siete u ocho dígitos.
      } else {
        throw new BadRequestException('El DNI debe tener 8 dígitos');
      }
    }

    if (
      paisLaboral === 'AR' &&
      (tipoDocumento === 'CUIL' || datos.cuil) &&
      !validarCuilArgentina(String(datos.cuil || datos.numero_documento || ''))
    ) {
      throw new BadRequestException('El CUIL debe tener 11 dígitos y dígito verificador válido');
    }

    if (paisLaboral === 'PE' && tipoDocumento === 'DNI' && datos.numero_documento && !/^\d{8}$/.test(String(datos.numero_documento))) {
      throw new BadRequestException('El DNI debe tener 8 dígitos');
    }
    if (paisLaboral === 'CO' && tipoDocumento === 'CC' && datos.numero_documento && !/^\d{6,10}$/.test(String(datos.numero_documento))) {
      throw new BadRequestException('La cédula de ciudadanía debe contener entre 6 y 10 dígitos');
    }

    if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(datos.email))) {
      throw new BadRequestException('Email inválido');
    }

    if (datos.cantidad_hijos !== undefined && Number(datos.cantidad_hijos) < 0) {
      throw new BadRequestException('La cantidad de hijos no puede ser negativa');
    }
  }

  private estadoActivoPatch(estado: unknown) {
    if (typeof estado !== 'string') return {};
    const normalizado = estado.trim().toLowerCase();
    if (normalizado === 'activo') return { estado: 'activo', activo: true };
    if (normalizado === 'inactivo') return { estado: 'inactivo', activo: false };
    throw new BadRequestException('Estado de empleado inválido');
  }

  async createEmpleado(
    empleadoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id al crear
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const paisLaboral = await this.obtenerPaisLaboral(currentTenantId);

    const datosLimpios = this.derivarAsignacionFamiliar(this.limpiarEmpleadoData(empleadoData), paisLaboral);
    this.validarEmpleadoData(datosLimpios, false, paisLaboral);
    if (paisLaboral === 'AR') {
      datosLimpios.cuil = String(datosLimpios.cuil || datosLimpios.numero_documento).replace(/\D/g, '');
      datosLimpios.numero_documento = datosLimpios.cuil;
      datosLimpios.tipo_documento = 'CUIL';
      datosLimpios.nacionalidad = datosLimpios.nacionalidad || 'AR';
    } else if (paisLaboral === 'CO') {
      datosLimpios.tipo_documento = datosLimpios.tipo_documento || 'CC';
      datosLimpios.nacionalidad = datosLimpios.nacionalidad || 'CO';
    }
    // La unicidad documental se comprueba bajo lock en el writer 475, después
    // de recuperar una intención anterior. La consulta previa impedía un replay.

    return this.ejecutarOperacionRrhh(
      'EMPLOYEE_CREATE',
      {
        ...datosLimpios,
        tipo_documento:
          datosLimpios.tipo_documento ||
          (paisLaboral === 'AR' ? 'CUIL' : paisLaboral === 'CO' ? 'CC' : 'DNI'),
        ...this.estadoActivoPatch(datosLimpios.estado || 'activo'),
      },
      currentTenantId,
      actorId,
      idempotencyKey,
    );
  }

  async updateEmpleado(
    id: string,
    empleadoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant al actualizar
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const paisLaboral = await this.obtenerPaisLaboral(currentTenantId);

    const datosLimpios = this.derivarAsignacionFamiliar(this.limpiarEmpleadoData(empleadoData), paisLaboral);
    this.validarEmpleadoData(datosLimpios, true, paisLaboral);
    if (paisLaboral === 'AR' && (datosLimpios.cuil || datosLimpios.tipo_documento === 'CUIL')) {
      datosLimpios.cuil = String(datosLimpios.cuil || datosLimpios.numero_documento).replace(/\D/g, '');
      datosLimpios.numero_documento = datosLimpios.cuil;
      datosLimpios.tipo_documento = 'CUIL';
    }


    return this.ejecutarOperacionRrhh(
      'EMPLOYEE_UPDATE',
      { id, ...datosLimpios, ...this.estadoActivoPatch(datosLimpios.estado) },
      currentTenantId,
      actorId,
      idempotencyKey,
    );
  }

  async deleteEmpleado(
    id: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant al eliminar
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'EMPLOYEE_DEACTIVATE', { id }, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, message: 'Empleado inactivado exitosamente', data };
  }

  async createDepartamento(
    departamentoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    return this.ejecutarOperacionRrhh(
      'DEPARTMENT_CREATE', departamentoData, currentTenantId, actorId, idempotencyKey,
    );
  }

  // ===== RECLUTAMIENTO Y VACANTES =====
  async getVacantes(tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('vacantes')
      .select(`
        *,
        departamentos(nombre),
        candidatos!candidatos_id_vacante_fkey(count)
      `)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (error) throw lecturaRrhhFallida('las vacantes');
    return { success: true, data: data || [] };
  }

  async createVacante(
    vacanteData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    // Validación mínima (el endpoint recibe `any`): evita vacantes vacías/basura.
    const titulo = (vacanteData?.titulo ?? '').toString().trim();
    const puesto = (vacanteData?.puesto_solicitado ?? '').toString().trim();
    if (!titulo || !puesto) {
      throw new BadRequestException('La vacante requiere al menos un título y el puesto solicitado');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'VACANCY_CREATE', vacanteData, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async getCandidatos(vacanteId?: string, tenantId?: string) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('candidatos')
      .select(`
        *,
        vacantes!candidatos_id_vacante_fkey(titulo, puesto_solicitado)
      `)
      .eq('tenant_id', currentTenantId)
      .order('fecha_postulacion', { ascending: false });

    if (vacanteId) {
      query = query.eq('id_vacante', vacanteId);
    }

    const { data, error } = await query;
    if (error) throw lecturaRrhhFallida('los candidatos');

    return { success: true, data: data || [] };
  }

  private normalizarPerfilCandidato(input: Record<string, unknown> = {}) {
    const { experiencia_años: alias, ...payload } = input ?? {};
    if (alias !== undefined && alias !== null) {
      if (payload.experiencia_anos !== undefined && payload.experiencia_anos !== null
        && payload.experiencia_anos !== alias) {
        throw new BadRequestException('Los años de experiencia enviados no coinciden');
      }
      payload.experiencia_anos = alias;
    }
    return payload;
  }

  async createCandidato(
    candidatoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    // El endpoint recibe `any` (sin DTO), así que la validación mínima de identidad
    // vive aquí para no insertar candidatos vacíos/basura en la tabla.
    const nombres = (candidatoData?.nombres ?? '').toString().trim();
    const apellidos = (candidatoData?.apellidos ?? '').toString().trim();
    if (!nombres || !apellidos) {
      throw new BadRequestException('El candidato requiere al menos nombres y apellidos');
    }
    const currentTenantId = tenantId;

    // Postgres rechaza '' en columnas date/numeric. El modal envía '' en campos
    // opcionales (fecha_nacimiento, etc.) → se normalizan a null antes de insertar,
    // evitando el 500 "invalid input syntax for type date".
    const sanitized = Object.fromEntries(
      Object.entries(this.normalizarPerfilCandidato(candidatoData)).map(([k, v]) => [k, v === '' ? null : v]),
    );

    const data = await this.ejecutarOperacionRrhh(
      'CANDIDATE_CREATE', sanitized, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async updateCandidato(
    candidatoId: string,
    candidatoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const sanitized = Object.fromEntries(
      Object.entries(this.normalizarPerfilCandidato(candidatoData)).map(([key, value]) => [key, value === '' ? null : value]),
    );
    const data = await this.ejecutarOperacionRrhh(
      'CANDIDATE_UPDATE', { id: candidatoId, ...sanitized }, tenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async updateEstadoCandidato(
    candidatoId: string,
    estado: string,
    observaciones?: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'CANDIDATE_STATUS', { id: candidatoId, estado, observaciones },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== ASISTENCIA Y TIEMPO =====
  async registrarAsistencia(
    empleadoId: string,
    tipo: 'entrada' | 'salida',
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    if (!actorId) throw new ForbiddenException('Actor autenticado requerido para modificar RRHH');
    if (!empleadoId || !['entrada', 'salida'].includes(tipo)) {
      throw new BadRequestException('Empleado y tipo de asistencia válidos son obligatorios');
    }
    const key = String(idempotencyKey || '').trim() || `rrhh-compat-attendance_mark-${randomUUID()}`;
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException('Idempotency-Key debe tener entre 8 y 200 caracteres');
    }
    // La DB captura el reloj civil del país una sola vez y confirma el replay
    // bajo el mismo lock/recibo475. Un reintento no genera otra hora ni evento.
    const { data: result, error } = await this.supabaseService.getClient().rpc(
      'registrar_asistencia_actual_tx', {
        p_tenant_id: tenantId, p_actor_id: actorId, p_empleado_id: empleadoId,
        p_tipo: tipo, p_idempotency_key: key,
      },
    );
    if (error) this.rechazarOperacionRrhh(error);
    const data = result?.data;
    const time = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/;
    if (typeof result?.replayed !== 'boolean' || !data || typeof data.id !== 'string' || !data.id
      || data.tenant_id !== tenantId || data.id_empleado !== empleadoId || data.empleado_id !== empleadoId
      || data.marcado_por !== actorId || !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha || '')
      || !time.test(data.hora_entrada || '') || (tipo === 'salida' && !time.test(data.hora_salida || ''))) {
      throw lecturaRrhhFallida('el resultado confirmado de asistencia');
    }
    const hoy = data.fecha;

    if (tipo === 'entrada') {

      // 🎯 EMITIR EVENTO DE ASISTENCIA (si eventBus está disponible)
      if (this.eventBus && !result.replayed) {
        this.eventBus.emitEmpleadoAsistencia({
          empleadoId: empleadoId,
          fecha: hoy,
          horaEntrada: data.hora_entrada,
          horasExtras: 0,
          tipoTurno: 'REGULAR',
          estado: 'PRESENTE',
          requierePlanilla: true,
        });
        this.logger.log('✅ [RRHH] Evento de entrada de empleado emitido');
      }

      return { success: true, data, message: 'Entrada registrada' };
    } else {
      // 🎯 EMITIR EVENTO DE ASISTENCIA COMPLETADA (si eventBus está disponible)
      const horasTrabajadas = Number(data?.horas_trabajadas || 0);
      const horasExtras = Math.max(0, horasTrabajadas - 8);

      if (this.eventBus && !result.replayed) {
        this.eventBus.emitEmpleadoAsistencia({
          empleadoId: empleadoId,
          fecha: hoy,
          horaEntrada: data?.hora_entrada,
          horaSalida: data.hora_salida,
          horasExtras: horasExtras,
          tipoTurno: 'REGULAR',
          estado: 'PRESENTE',
          requierePlanilla: true,
        });
        this.logger.log(
          `✅ [RRHH] Evento de salida emitido - ${horasTrabajadas.toFixed(2)} horas trabajadas`,
        );
      }

      return { success: true, data, message: 'Salida registrada' };
    }
  }

  async getAsistencia(
    empleadoId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
    tenantId?: string,
  ) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('asistencia')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento)
      `,
      )
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .order('fecha', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (fechaDesde) query = query.gte('fecha', fechaDesde);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

    const { data, error } = await query.limit(100);
    if (error) throw lecturaRrhhFallida('la asistencia');

    return { success: true, data: data || [] };
  }

  // ===== SOLICITUDES (Vacaciones, Licencias) =====
  async getSolicitudes(
    empleadoId?: string,
    estado?: string,
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('solicitudes')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento)
      `,
      )
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw lecturaRrhhFallida('las solicitudes');

    return { success: true, data: data || [] };
  }

  async createSolicitud(
    solicitudData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const fechaValida = (valor: unknown) => {
      if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
      const fecha = parseFechaLocal(valor);
      return !Number.isNaN(fecha.getTime()) && fecha.getFullYear() === Number(valor.slice(0, 4))
        && fecha.getMonth() + 1 === Number(valor.slice(5, 7)) && fecha.getDate() === Number(valor.slice(8, 10));
    };
    if (!TIPOS_SOLICITUD_RRHH.includes(solicitudData?.tipo)
      || !fechaValida(solicitudData?.fecha_inicio) || !fechaValida(solicitudData?.fecha_fin)
      || solicitudData.fecha_fin < solicitudData.fecha_inicio) {
      throw new BadRequestException('La solicitud requiere un tipo válido y fechas reales de inicio y fin en orden');
    }
    const desde = parseFechaLocal(solicitudData.fecha_inicio);
    const hasta = parseFechaLocal(solicitudData.fecha_fin);
    const dias = (Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
      - Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())) / 86400000 + 1;
    if (solicitudData.dias !== undefined && solicitudData.dias !== dias) {
      throw new BadRequestException('Los días de la solicitud deben coincidir con su rango de fechas inclusivo');
    }
    const data = await this.ejecutarOperacionRrhh(
      'REQUEST_CREATE', { ...solicitudData, dias }, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async aprobarSolicitud(
    solicitudId: string,
    _aprobadoPor: string,
    observaciones?: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'REQUEST_DECIDE', { id: solicitudId, decision: 'aprobada', observaciones },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async rechazarSolicitud(
    solicitudId: string,
    _aprobadoPor: string,
    observaciones: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'REQUEST_DECIDE', { id: solicitudId, decision: 'rechazada', observaciones },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== BENEFICIOS =====
  async getBeneficios(tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const client = this.supabaseService.getClient();
    const data = await readCompleteCatalog(client, 'beneficios', '*',
      query => query.eq('tenant_id', tenantId).eq('activo', true),
      row => row.tenant_id === tenantId, [['nombre', true], ['id', true]]);
    return { success: true, data };
  }

  async getBeneficiosEmpleado(empleadoId: string, tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const client = this.supabaseService.getClient();
    await requireTenantRecord(client, 'empleados', tenantId, empleadoId, 'Empleado');
    const data = await readCompleteCatalog(client, 'empleado_beneficios', '*,beneficios!empleado_beneficios_id_beneficio_fkey(*)',
      query => query.eq('tenant_id', tenantId).eq('id_empleado', empleadoId).eq('estado', 'activo'),
      row => row.tenant_id === tenantId && row.id_empleado === empleadoId && row.beneficios?.id === row.id_beneficio && row.beneficios?.tenant_id === tenantId, [['id', true]]);
    return { success: true, data };
  }

  async asignarBeneficio(
    empleadoId: string,
    beneficioId: string,
    fechaInicio: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'BENEFIT_ASSIGN',
      { empleado_id: empleadoId, beneficio_id: beneficioId, fecha_inicio: fechaInicio },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== EVALUACIONES DE DESEMPEÑO =====
  async getEvaluaciones(empleadoId?: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    let query = this.supabaseService
      .getClient()
      .from('evaluaciones')
      .select(
        `
        *,
        empleados(nombres, apellidos, numero_documento, puesto)
      `,
      )
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .order('fecha_evaluacion', { ascending: false });

    if (empleadoId) query = query.eq('id_empleado', empleadoId);

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: data || [] };
  }

  async createEvaluacion(
    evaluacionData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'EVALUATION_CREATE', evaluacionData, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async updateEvaluacion(
    id: string,
    evaluacionData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'EVALUATION_UPDATE', { id, ...evaluacionData }, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== CAPACITACIONES =====
  async getCapacitaciones(tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const client = this.supabaseService.getClient();
    const data = await readCompleteCatalog(client, 'capacitaciones', '*',
      query => query.eq('tenant_id', tenantId).eq('activo', true),
      row => row.tenant_id === tenantId, [['fecha_inicio', false], ['id', true]]);
    return { success: true, data };
  }

  async getCapacitacionesEmpleado(empleadoId: string, tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const client = this.supabaseService.getClient();
    await requireTenantRecord(client, 'empleados', tenantId, empleadoId, 'Empleado');
    const data = await readCompleteCatalog(client, 'empleado_capacitaciones', '*,capacitaciones!empleado_capacitaciones_id_capacitacion_fkey(*)',
      query => query.eq('tenant_id', tenantId).eq('id_empleado', empleadoId),
      row => row.tenant_id === tenantId && row.id_empleado === empleadoId && row.capacitaciones?.id === row.id_capacitacion && row.capacitaciones?.tenant_id === tenantId, [['fecha_inscripcion', false], ['id', false]]);
    return { success: true, data };
  }

  async inscribirCapacitacion(
    empleadoId: string,
    capacitacionId: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'TRAINING_ENROLL', { empleado_id: empleadoId, capacitacion_id: capacitacionId },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== LIQUIDACIONES =====
  async calcularLiquidacion(
    empleadoId: string,
    motivoTerminacion: string,
    fechaTerminacion: string,
    tenantId?: string,
    usuarioId?: string,
    gratificacionPrevia?: GratificacionPreviaDto,
    remuneracionGratificacionPrevia?: RemuneracionGratificacionPreviaDto,
  ) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new BadRequestException('Tenant requerido para RRHH');
    }
    if (!usuarioId) {
      throw new BadRequestException('Actor requerido para calcular la liquidación');
    }
    const currentTenantId = tenantId;
    const paisLaboral = await this.obtenerPaisLaboral(currentTenantId);

    // Obtener datos del empleado y contrato
    const empleadoQuery = this.supabaseService.getClient()
        .from('empleados')
        .select(
          `
        *,
        contratos!inner(*),
        rrhh_peru_fichas_laborales(regimen_salud_codigo,regimen_laboral_codigo,eps_servicios_propios_codigo,activo)
      `,
        )
        .eq('id', empleadoId)
        .eq('tenant_id', currentTenantId);
    if (paisLaboral !== 'PE') {
      empleadoQuery.in('contratos.estado', ['vigente', 'renovado', 'en_periodo_prueba']);
    }
    const { data: empleado, error: empError } = await empleadoQuery.single();

    if (empError && empError.code !== 'PGRST116') throw empError;
    if (!empleado) throw new NotFoundException('Empleado no encontrado');

    const contrato = (empleado.contratos || []).find((item: any) =>
      ['vigente', 'renovado', 'en_periodo_prueba'].includes(
        String(item?.estado || '').toLowerCase(),
      ),
    );
    if (!contrato) {
      throw new ConflictException('El empleado no tiene un contrato laboral activo');
    }
    const sueldoMensual = parseFloat(contrato.sueldo_bruto);
    if (!Number.isFinite(sueldoMensual) || sueldoMensual <= 0) {
      throw new ConflictException('El contrato activo no tiene una remuneración válida');
    }
    if (paisLaboral === 'AR') {
      const configMetadata =
        contrato?.metadata && typeof contrato.metadata === 'object' ? contrato.metadata : {};
      const calculoArgentina = calcularLiquidacionArgentina({
        fechaIngreso: empleado.fecha_ingreso,
        fechaTerminacion,
        sueldoMensual,
        mejorRemuneracionNormalHabitual: Number(
          contrato.mejor_remuneracion_normal_habitual ??
            configMetadata.mejor_remuneracion_normal_habitual ??
            sueldoMensual,
        ),
        topeConvenio:
          contrato.tope_indemnizatorio_convenio ??
          configMetadata.tope_indemnizatorio_convenio ??
          null,
        motivoTerminacion,
        preavisoOmitido: Boolean(
          contrato.preaviso_omitido ?? configMetadata.preaviso_omitido ?? true,
        ),
        fondoCeseReemplazaIndemnizacion: Boolean(
          contrato.fondo_cese_reemplaza_indemnizacion ??
            configMetadata.fondo_cese_reemplaza_indemnizacion ??
            false,
        ),
      });

      return this.guardarLiquidacionCalculada(currentTenantId, usuarioId, {
        id_empleado: empleadoId,
        motivo_terminacion: motivoTerminacion,
        fecha_terminacion: fechaTerminacion,
        ultimo_dia_trabajado: fechaTerminacion,
        vacaciones_pendientes: calculoArgentina.diasVacacionesProporcionales,
        dias_cts: 0,
        monto_cts: 0,
        indemnizacion: calculoArgentina.indemnizacionAntiguedad,
        total_liquidacion: calculoArgentina.total,
        estado: 'calculada',
        tenant_id: currentTenantId,
        pais_codigo: 'AR',
        moneda: 'ARS',
        metadata: {
          normativa: 'LCT_ARGENTINA',
          version_normativa: '2026-03',
          base_indemnizacion: calculoArgentina.baseIndemnizacion,
          anios_indemnizables: calculoArgentina.aniosIndemnizables,
          vacaciones_no_gozadas: calculoArgentina.vacacionesNoGozadas,
          sac_proporcional: calculoArgentina.sacProporcional,
          preaviso: calculoArgentina.preaviso,
          sac_sobre_preaviso: calculoArgentina.sacSobrePreaviso,
          integracion_mes_despido: calculoArgentina.integracionMesDespido,
          sac_sobre_integracion: calculoArgentina.sacSobreIntegracion,
          fondo_cese_aplicado: calculoArgentina.fondoCeseAplicado,
        },
      });
    }

    if (paisLaboral === 'CO') {
      const metadata =
        contrato?.metadata && typeof contrato.metadata === 'object' ? contrato.metadata : {};
      const { data: config } = await this.supabaseService
        .getClient()
        .from('rrhh_configuracion_colombia')
        .select('salario_minimo, auxilio_transporte')
        .eq('tenant_id', currentTenantId)
        .maybeSingle();
      const calculo = calcularLiquidacionColombia({
        fechaIngreso: empleado.fecha_ingreso,
        fechaTerminacion,
        prestacionesPagadasHasta: metadata.prestaciones_pagadas_hasta,
        sueldoMensual,
        auxilioTransporteMensual: Number(
          metadata.recibe_auxilio_transporte === false ? 0 : config?.auxilio_transporte ?? 249_095,
        ),
        motivoTerminacion,
        tipoContrato: contrato.tipo_contrato,
        fechaFinContrato: contrato.fecha_fin,
        salarioMinimo: Number(config?.salario_minimo ?? 1_750_905),
        vacacionesDiasGozados: Number(metadata.vacaciones_dias_gozados ?? 0),
      });
      return this.guardarLiquidacionCalculada(currentTenantId, usuarioId, {
        id_empleado: empleadoId,
        motivo_terminacion: motivoTerminacion,
        fecha_terminacion: fechaTerminacion,
        ultimo_dia_trabajado: fechaTerminacion,
        vacaciones_pendientes: calculo.diasVacacionesPendientes,
        dias_cts: 0,
        monto_cts: 0,
        indemnizacion: calculo.indemnizacion,
        total_liquidacion: calculo.total,
        estado: 'calculada',
        tenant_id: currentTenantId,
        pais_codigo: 'CO',
        moneda: 'COP',
        metadata: {
          normativa: 'CST_COLOMBIA',
          version_normativa: '2026-01',
          dias_servicio: calculo.diasServicio,
          dias_prestaciones_pendientes: calculo.diasPrestaciones,
          cesantias: calculo.cesantias,
          intereses_cesantias: calculo.interesesCesantias,
          prima_servicios: calculo.primaServicios,
          vacaciones: calculo.vacaciones,
        },
      });
    }

    const fechaIngreso = parseFechaLocal(empleado.fecha_ingreso);
    const fechaTerminacionDate = parseFechaLocal(fechaTerminacion);
    // El día del cese se trabaja: el servicio termina al iniciar el día
    // siguiente. Con el cese exclusivo un 31 de octubre perdía un mes de
    // gratificación trunca.
    const finServicios = new Date(
      fechaTerminacionDate.getFullYear(),
      fechaTerminacionDate.getMonth(),
      fechaTerminacionDate.getDate() + 1,
    );
    // La asignación familiar es remuneración computable (Ley 25129) para
    // vacaciones, gratificación, CTS e indemnización, igual que en la CTS semestral.
    const asignacionFamiliar = this.tieneHijosEmpleado(empleado)
      ? Number(((await this.obtenerRmvVigente(fechaTerminacion.slice(0, 7), currentTenantId)) * 0.1).toFixed(2))
      : 0;
    const remuneracionMensual = Number((sueldoMensual + asignacionFamiliar).toFixed(2));

    // La ley liquida por dozavos y treintavos, no por años decimales.
    const tiempoTotal = tiempoDeServicios(fechaIngreso, finServicios);

    // Se adeudan tanto las vacaciones vencidas de periodos ya cumplidos como las
    // truncas del periodo en curso, así que ambas salen del tiempo total de
    // servicios menos los días efectivamente gozados.
    const vacacionesUsadas = await this.calcularVacacionesUsadas(
      empleadoId,
      fechaIngreso,
      fechaTerminacionDate,
      currentTenantId,
    );

    const vacacionesPendientes = diasVacacionesPendientes(tiempoTotal, vacacionesUsadas);
    const montoVacaciones = calcularVacacionesTruncas(remuneracionMensual, tiempoTotal, vacacionesUsadas);

    const gratificacionCts = await this.obtenerGratificacionPercibidaCts(
      currentTenantId, empleadoId, fechaIngreso, fechaTerminacionDate, usuarioId, gratificacionPrevia,
    );
    const remuneracionCts = remuneracionComputableCts(remuneracionMensual, gratificacionCts.monto);

    // Un depósito semestral calculado pero aún no depositado también se incluye
    // en la liquidación. Los ya DEPOSITADOS jamás se vuelven a pagar.
    const { data: depositosCts, error: depositosError } = await this.supabaseService
      .getClient()
      .from('depositos_cts')
      .select('id,periodo,monto,meses_computables,dias_computables,semestre_fin,estado')
      .eq('tenant_id', currentTenantId)
      .eq('empleado_id', empleadoId)
      .in('estado', ['CALCULADO', 'DEPOSITADO'])
      .lte('semestre_fin', fechaTerminacion);
    if (depositosError) throw depositosError;
    const depositosPendientes = (depositosCts || []).filter((d: any) => d.estado === 'CALCULADO');

    // La CTS trunca cubre el tiempo que ningún semestre depositado o pendiente
    // cubre: desde el día siguiente al último de ellos hasta el fin de servicios.
    const ultimoSemestreCubierto = (depositosCts || [])
      .map((d: any) => String(d.semestre_fin))
      .sort()
      .pop();
    const inicioCtsTrunca = ultimoSemestreCubierto
      ? (() => {
          const fin = parseFechaLocal(ultimoSemestreCubierto);
          const siguiente = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
          return siguiente > fechaIngreso ? siguiente : fechaIngreso;
        })()
      : fechaIngreso;
    const tiempoCtsPendiente = tiempoDeServicios(inicioCtsTrunca, finServicios);
    const ctsTrunca = calcularCts(remuneracionCts, tiempoCtsPendiente);

    const ctsSemestresPendientes = (depositosPendientes || []).reduce(
      (total: number, deposito: any) => total + Number(deposito.monto || 0),
      0,
    );
    const montoCts = Number((ctsTrunca + ctsSemestresPendientes).toFixed(2));
    const diasCts = tiempoCtsPendiente.meses * 30 + tiempoCtsPendiente.dias
      + (depositosPendientes || []).reduce(
        (total: number, deposito: any) => total
          + Number(deposito.meses_computables || 0) * 30
          + Number(deposito.dias_computables || 0),
        0,
      );

    const mesesGratificacionTrunca = mesesDelSemestreGratificatorio(fechaIngreso, fechaTerminacionDate);
    const baseGratificacionTrunca = await this.obtenerBaseGratificacionTrunca(
      empleado, fechaTerminacionDate, currentTenantId, usuarioId,
      mesesGratificacionTrunca, remuneracionGratificacionPrevia,
    );
    const regimenBonificacion = regimenBonificacionGratificacionPeru(empleado);
    const gratificacionTruncaCalculada = calcularGratificacionTrunca(
      baseGratificacionTrunca.monto, mesesGratificacionTrunca, regimenBonificacion,
    );
    // La gratificación de diciembre pertenece al mismo semestre del cese.
    // Lo ya percibido no vuelve a pagarse como beneficio trunco.
    const gratificacionDelMismoSemestre = fechaTerminacionDate.getMonth() === 11;
    const gratificacionPendiente = Number(Math.max(0, gratificacionTruncaCalculada.gratificacion
      - (gratificacionDelMismoSemestre ? gratificacionCts.monto : 0)).toFixed(2));
    const bonificacionPendiente = Number(Math.max(0, gratificacionTruncaCalculada.bonificacionExtraordinaria
      - (gratificacionDelMismoSemestre ? gratificacionCts.bonificacion_extraordinaria : 0)).toFixed(2));
    const gratificacionTrunca = {
      gratificacion: gratificacionPendiente, bonificacionExtraordinaria: bonificacionPendiente,
      total: Number((gratificacionPendiente + bonificacionPendiente).toFixed(2)),
    };

    const indemnizacion =
      motivoTerminacion === 'despido'
        ? calcularIndemnizacionDespido(remuneracionMensual, tiempoTotal)
        : 0;

    const totalLiquidacion = Number(
      (montoCts + montoVacaciones + gratificacionTrunca.total + indemnizacion).toFixed(2),
    );

    return this.guardarLiquidacionCalculada(currentTenantId, usuarioId, {
      id_empleado: empleadoId,
      motivo_terminacion: motivoTerminacion,
      fecha_terminacion: fechaTerminacion,
      ultimo_dia_trabajado: fechaTerminacion,
      vacaciones_pendientes: vacacionesPendientes,
      dias_cts: diasCts,
      monto_cts: montoCts,
      indemnizacion: indemnizacion,
      total_liquidacion: totalLiquidacion,
      estado: 'calculada',
      tenant_id: currentTenantId, // ✅ Incluir tenant
      pais_codigo: 'PE',
      moneda: 'PEN',
      // La tabla no tiene columnas para vacaciones truncas ni gratificación
      // trunca; el desglose queda aquí para poder auditar el importe pagado.
      metadata: {
        remuneracion_mensual: remuneracionMensual,
        asignacion_familiar: asignacionFamiliar,
        tiempo_servicios: tiempoTotal,
        remuneracion_computable_cts: remuneracionCts,
        gratificacion_cts: gratificacionCts,
        tiempo_cts_trunca: tiempoCtsPendiente,
        monto_cts_trunca: ctsTrunca,
        depositos_cts_pendientes: depositosPendientes || [],
        monto_cts_semestres_pendientes: Number(ctsSemestresPendientes.toFixed(2)),
        monto_vacaciones_truncas: montoVacaciones,
        gratificacion_trunca: gratificacionTrunca.gratificacion,
        base_gratificacion_trunca: baseGratificacionTrunca,
        regimen_bonificacion_gratificacion: regimenBonificacion,
        tasa_bonificacion_gratificacion: regimenBonificacion === 'EPS' ? 0.0675 : 0.09,
        bonificacion_extraordinaria: gratificacionTrunca.bonificacionExtraordinaria,
        bonificacion_extraordinaria_9: gratificacionTrunca.bonificacionExtraordinaria,
        vacaciones_dias_gozados: vacacionesUsadas,
      },
    });
  }

  private async obtenerBaseGratificacionTrunca(
    empleado: any, cese: Date, tenantId: string, actorId: string,
    mesesComputables: number, declaracion?: RemuneracionGratificacionPreviaDto,
  ): Promise<Record<string, any> & { monto: number }> {
    const cierre = new Date(cese.getFullYear(), cese.getMonth(), 0);
    const periodo = `${cierre.getFullYear()}-${String(cierre.getMonth() + 1).padStart(2, '0')}`;
    if (declaracion) {
      if (declaracion.periodo !== periodo || !Number.isFinite(declaracion.monto)
        || declaracion.monto <= 0 || Math.abs(declaracion.monto * 100 - Math.round(declaracion.monto * 100)) > 1e-6
        || !String(declaracion.referencia || '').trim()) {
        throw new BadRequestException(`La base computable declarada debe corresponder a ${periodo}, con importe positivo y referencia`);
      }
      return {
        periodo, monto: declaracion.monto, fuente: 'FUENTE_EXTERNA_DECLARADA',
        referencia: declaracion.referencia.trim(), declarado_por: actorId,
      };
    }
    if (mesesComputables === 0) return { periodo, monto: 0, fuente: 'SIN_DERECHO' };

    // La base de la trunca es la vigente en el mes anterior al cese (D.S.
    // 005-2002-TR, art.5.3), no el salario de un contrato iniciado este mes.
    const fechaCierre = `${periodo}-${String(cierre.getDate()).padStart(2, '0')}`;
    const contratos = (empleado.contratos || []).filter((c: any) =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(c.fecha_inicio || ''))
      && c.fecha_inicio <= fechaCierre
      && (!c.fecha_fin || c.fecha_fin >= fechaCierre)
      && !['borrador', 'anulado', 'cancelado'].includes(String(c.estado || '').toLowerCase()),
    ).sort((a: any, b: any) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
    const anterior = contratos[0];
    const sueldo = Number(anterior?.sueldo_bruto);
    if (!anterior || !Number.isFinite(sueldo) || sueldo <= 0) {
      throw new ConflictException(`No hay remuneración histórica verificable para ${periodo}; declare la base computable de ese mes y su referencia`);
    }
    if (contratos[1]?.fecha_inicio === anterior.fecha_inicio && Number(contratos[1].sueldo_bruto) !== sueldo) {
      throw new ConflictException(`Hay contratos históricos incompatibles para ${periodo}; revise los contratos o declare la base computable con su referencia`);
    }
    const asignacionFamiliar = this.tieneHijosEmpleado(empleado)
      ? Number(((await this.obtenerRmvVigente(periodo, tenantId)) * 0.1).toFixed(2)) : 0;
    return {
      periodo, monto: Number((sueldo + asignacionFamiliar).toFixed(2)),
      sueldo_bruto: sueldo, asignacion_familiar: asignacionFamiliar,
      contrato_id: anterior.id, fuente: 'CONTRATO_HISTORICO',
    };
  }

  private async guardarLiquidacionCalculada(
    tenantId: string,
    usuarioId: string,
    liquidacion: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabaseService.getClient().rpc(
      'guardar_liquidacion_calculada_tx',
      {
        p_tenant_id: tenantId,
        p_liquidacion: liquidacion,
        p_usuario_id: usuarioId,
      },
    );
    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  async confirmarLiquidacion(liquidacionId: string, tenantId: string, usuarioId: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    if (!usuarioId) throw new BadRequestException('Actor requerido para confirmar la liquidación');

    const { data, error } = await this.supabaseService.getClient().rpc(
      'confirmar_liquidacion_tx',
      {
        p_tenant_id: tenantId,
        p_liquidacion_id: liquidacionId,
        p_usuario_id: usuarioId,
      },
    );

    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  async getLiquidaciones(tenantId: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const { data, error } = await this.supabaseService.getClient()
      .from('liquidaciones')
      .select('*, empleados!liquidaciones_id_empleado_fkey(id,nombres,apellidos,numero_documento)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data) || data.some((row: any) => !row?.empleados || row.empleados.id !== row.id_empleado)) throw lecturaRrhhFallida('las liquidaciones');
    return { success: true, data };
  }

  async getDestinosBancariosLaborales(tenantId: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para pagos laborales');
    const { data, error } = await this.supabaseService.getClient()
      .from('cuentas_bancarias')
      .select('id,nombre,banco,numero_cuenta,moneda')
      .eq('tenant_id', tenantId).eq('activa', true).eq('activo', true)
      .order('nombre', { ascending: true });
    if (error || !Array.isArray(data)) throw lecturaRrhhFallida('los destinos bancarios de pagos laborales');
    return { success: true, data };
  }

  async pagarLiquidacion(
    liquidacionId: string,
    pago: {
      metodo_pago: 'efectivo' | 'transferencia';
      cuenta_bancaria_id?: string;
      referencia?: string;
      fecha_pago?: string;
      idempotency_key?: string;
    },
    tenantId: string,
    usuarioId: string,
  ) {
    if (!tenantId || !usuarioId) {
      throw new BadRequestException('Tenant y actor son obligatorios para pagar la liquidación');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'pagar_liquidacion_tx',
      {
        p_tenant_id: tenantId,
        p_liquidacion_id: liquidacionId,
        p_pago: pago,
        p_usuario_id: usuarioId,
      },
    );
    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  async revertirPagoLiquidacion(
    liquidacionId: string,
    motivo: string,
    tenantId: string,
    usuarioId: string,
  ) {
    if (!tenantId || !usuarioId) {
      throw new BadRequestException('Tenant y actor son obligatorios para revertir el pago');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'revertir_pago_liquidacion_tx',
      {
        p_tenant_id: tenantId,
        p_liquidacion_id: liquidacionId,
        p_motivo: motivo,
        p_usuario_id: usuarioId,
      },
    );
    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  private async obtenerGratificacionPercibidaCts(
    tenantId: string, empleadoId: string, ingreso: Date, alDia: Date, actorId: string,
    declaracion?: GratificacionPreviaDto,
  ): Promise<{
    periodo: string; monto: number; bonificacion_extraordinaria: number;
    fuente: 'PLANILLA_PAGADA' | 'FUENTE_EXTERNA_DECLARADA' | 'SIN_DERECHO';
    fecha_pago?: string; referencia?: string; planilla_ids?: string[]; declarado_por?: string;
  }> {
    const periodo = periodoGratificacionParaCts(alDia);
    const corte = new Date(alDia.getFullYear(), alDia.getMonth(), alDia.getDate() + 1);
    const cortePagoUtc = rangoDelDiaEnPais('PE', new Date(Date.UTC(
      alDia.getFullYear(), alDia.getMonth(), alDia.getDate(), 12,
    ))).hasta;
    if (declaracion) {
      const fechaPago = parseFechaLocal(declaracion.fecha_pago);
      const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(declaracion.fecha_pago)
        && !Number.isNaN(fechaPago.getTime())
        && fechaPago.getFullYear() === Number(declaracion.fecha_pago.slice(0, 4))
        && fechaPago.getMonth() + 1 === Number(declaracion.fecha_pago.slice(5, 7))
        && fechaPago.getDate() === Number(declaracion.fecha_pago.slice(8, 10));
      if (declaracion.periodo !== periodo || !Number.isFinite(declaracion.monto)
        || declaracion.monto < 0 || Math.abs(Math.round(declaracion.monto * 100) - declaracion.monto * 100) > 1e-6
        || (declaracion.bonificacion_extraordinaria !== undefined
          && (!Number.isFinite(declaracion.bonificacion_extraordinaria) || declaracion.bonificacion_extraordinaria < 0))
        || !fechaValida || fechaPago >= corte || fechaPago < parseFechaLocal(`${periodo}-01`)
        || !String(declaracion.referencia || '').trim()) {
        throw new BadRequestException(`La gratificación previa requiere período ${periodo}, importe válido, referencia y fecha de percepción anterior al cierre`);
      }
    }
    if (!(mesesGratificablesDelPeriodo(periodo, ingreso) ?? 0)) {
      if (declaracion && declaracion.monto !== 0) {
        throw new BadRequestException('No corresponde una gratificación previa de un semestre sin meses completos trabajados');
      }
      return { periodo, monto: 0, bonificacion_extraordinaria: 0, fuente: 'SIN_DERECHO' };
    }
    try {
      const client = this.supabaseService.getClient();
      const { data: planillas, error: planillasError } = await client.from('planillas')
        .select('id,fecha_pago').eq('tenant_id', tenantId).eq('periodo', periodo)
        .eq('estado', 'pagada').lt('fecha_pago', cortePagoUtc);
      if (planillasError) throw lecturaRrhhFallida('las gratificaciones pagadas');
      const planillaIds = (planillas || []).map((p: any) => String(p.id));
      if (planillaIds.length) {
        const { data: catalogo, error: conceptoError } = await client.from('conceptos_planilla')
          .select('id,codigo').eq('tenant_id', tenantId).in('codigo', ['006', '007']);
        if (conceptoError) throw lecturaRrhhFallida('el concepto de gratificación');
        const concepto = (catalogo || []).find((c: any) => c.codigo === '006');
        const bono = (catalogo || []).find((c: any) => c.codigo === '007');
        if (concepto) {
          const { data: detalles, error: detallesError } = await client.from('empleado_planilla')
            .select('id,planilla_id').eq('tenant_id', tenantId).eq('empleado_id', empleadoId)
            .in('planilla_id', planillaIds);
          if (detallesError) throw lecturaRrhhFallida('las gratificaciones del empleado');
          const detalleIds = (detalles || []).map((d: any) => String(d.id));
          if (detalleIds.length) {
            const { data: conceptos, error: montosError } = await client.from('empleado_planilla_conceptos')
              .select('empleado_planilla_id,concepto_id,monto').eq('tenant_id', tenantId)
              .in('concepto_id', [concepto.id, bono?.id].filter(Boolean)).in('empleado_planilla_id', detalleIds);
            if (montosError) throw lecturaRrhhFallida('los importes de gratificación');
            const gratificaciones = (conceptos || []).filter((c: any) => c.concepto_id === concepto.id);
            if (gratificaciones.length) {
              const montos = (conceptos || []).map((c: any) => Number(c.monto));
              if (montos.some((m: number) => !Number.isFinite(m) || m < 0)) {
                throw new ConflictException('El historial de gratificación tiene importes inválidos; regularice la planilla');
              }
              const monto = Number(gratificaciones.reduce((s: number, c: any) => s + Number(c.monto), 0).toFixed(2));
              const bonificacion = Number((conceptos || []).filter((c: any) => c.concepto_id === bono?.id)
                .reduce((s: number, c: any) => s + Number(c.monto), 0).toFixed(2));
              if (declaracion && (declaracion.monto !== monto
                || (declaracion.bonificacion_extraordinaria !== undefined && declaracion.bonificacion_extraordinaria !== bonificacion))) {
                throw new ConflictException('La gratificación declarada difiere del importe pagado registrado en la planilla');
              }
              const detallesUsados = new Set(conceptos.map((c: any) => String(c.empleado_planilla_id)));
              const ids = [...new Set<string>((detalles || []).filter((d: any) => detallesUsados.has(String(d.id)))
                .map((d: any) => String(d.planilla_id)))];
              const fechas = (planillas || []).filter((p: any) => ids.includes(String(p.id)))
                .map((p: any) => String(p.fecha_pago)).sort();
              return {
                periodo, monto, bonificacion_extraordinaria: bonificacion,
                fuente: 'PLANILLA_PAGADA', planilla_ids: ids, fecha_pago: fechas.at(-1),
              };
            }
          }
        }
      }
    } catch (error) {
      relanzarLecturaRrhh(error, 'la gratificación percibida para CTS');
    }
    if (!declaracion) {
      throw new ConflictException(`Falta la gratificación percibida de ${periodo}; indique el importe y la referencia de su fuente histórica, incluso si fue cero`);
    }
    // Documenta la base CTS; no registra ni simula un pago de gratificación.
    return {
      periodo, monto: declaracion.monto, bonificacion_extraordinaria: declaracion.bonificacion_extraordinaria ?? 0,
      fuente: 'FUENTE_EXTERNA_DECLARADA',
      fecha_pago: declaracion.fecha_pago, referencia: declaracion.referencia.trim(), declarado_por: actorId,
    };
  }

  async getDepositosCts(tenantId: string, periodo?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    let query = this.supabaseService.getClient()
      .from('depositos_cts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('periodo', { ascending: false });
    if (periodo) query = query.eq('periodo', periodo);
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.some((item: any) => !item?.empleado_id)) throw lecturaRrhhFallida('los depósitos CTS');
    const empleadoIds = [...new Set(data.map((item: any) => item.empleado_id))];
    if (empleadoIds.length === 0) return { success: true, data };
    const { data: empleados, error: empleadosError } = await this.supabaseService.getClient()
      .from('empleados')
      .select('id,nombres,apellidos,numero_documento')
      .eq('tenant_id', tenantId)
      .in('id', empleadoIds);
    if (empleadosError || !Array.isArray(empleados)) throw lecturaRrhhFallida('los empleados de los depósitos CTS');
    const empleadosPorId = new Map(empleados.map((empleado: any) => [empleado.id, empleado]));
    if (empleadoIds.some(id => !empleadosPorId.has(id))) throw lecturaRrhhFallida('los empleados de los depósitos CTS');
    return {
      success: true,
      data: data.map((item: any) => ({ ...item, empleados: empleadosPorId.get(item.empleado_id) })),
    };
  }

  async depositarCts(
    depositoId: string,
    pago: { cuenta_bancaria_id: string; referencia: string; fecha_deposito?: string },
    tenantId: string,
    usuarioId: string,
  ) {
    if (!tenantId || !usuarioId) {
      throw new BadRequestException('Tenant y actor son obligatorios para depositar CTS');
    }
    const { data, error } = await this.supabaseService.getClient().rpc(
      'depositar_cts_tx',
      {
        p_tenant_id: tenantId,
        p_deposito_id: depositoId,
        p_pago: pago,
        p_usuario_id: usuarioId,
      },
    );
    if (error) this.throwRrhhLifecycleRpcError(error);
    return data;
  }

  private throwRrhhLifecycleRpcError(error: any): never {
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error?.code === '42501') throw new ForbiddenException(error.message);
    if (['22003', '22007', '22008', '22023', '22P02'].includes(error?.code)) {
      throw new BadRequestException(error.message);
    }
    if (['23503', '23505', '23514', '40001'].includes(error?.code)) {
      throw new ConflictException(error.message);
    }
    throw error;
  }

  private async calcularVacacionesUsadas(
    empleadoId: string,
    desde: Date,
    hasta: Date,
    tenantId: string,
  ): Promise<number> {
    // La liquidación conserva todo el récord desde el ingreso hasta el cese,
    // incluidos aniversarios; cada fecha gozada se descuenta una sola vez.
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const parse = (value: unknown): number => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw lecturaRrhhFallida('las fechas de vacaciones gozadas');
      const stamp = Date.parse(`${value}T00:00:00Z`);
      if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) throw lecturaRrhhFallida('las fechas de vacaciones gozadas');
      return stamp;
    };
    const startDate = key(desde);
    const endDate = key(hasta);
    const start = parse(startDate), end = parse(endDate);
    if (end < start) throw new BadRequestException('La fecha de cese no puede ser anterior al ingreso');

    const { data, error } = await this.supabaseService
      .getClient()
      .from('solicitudes')
      .select('fecha_inicio,fecha_fin')
      .eq('id_empleado', empleadoId)
      // Sin filtrar el tipo, una licencia, un permiso o un descanso médico
      // descontaban días del récord vacacional y recortaban la liquidación.
      .eq('tipo', 'vacaciones')
      .eq('estado', 'aprobada')
      .lte('fecha_inicio', endDate)
      .gte('fecha_fin', startDate)
      .eq('tenant_id', tenantId);

    if (error || !Array.isArray(data)) {
      this.logger.warn(
        `Error calculando vacaciones usadas: ${error?.message || 'respuesta incompleta'}`,
      );
      throw lecturaRrhhFallida('las vacaciones gozadas para la liquidación');
    }

    const fechasGozadas = new Set<number>();
    for (const row of data) {
      const inicio = parse(row?.fecha_inicio), fin = parse(row?.fecha_fin);
      if (fin < inicio) throw lecturaRrhhFallida('las fechas de vacaciones gozadas');
      for (let day = Math.max(start, inicio); day <= Math.min(end, fin); day += 86400000) fechasGozadas.add(day);
    }
    return fechasGozadas.size;
  }


  // ===== HORARIOS =====
  async getHorarios(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('horarios_trabajo')
      .select('*')
      .eq('tenant_id', currentTenantId) // ✅ Filtro de tenant
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    return { success: true, data: data || [] };
  }

  async asignarHorario(
    empleadoId: string,
    horarioId: string,
    fechaInicio: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'SCHEDULE_ASSIGN',
      { empleado_id: empleadoId, horario_id: horarioId, fecha_inicio: fechaInicio },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== EXPEDIENTE =====
  async getExpediente(empleadoId: string, tenantId?: string) {
    if (!tenantId) throw new BadRequestException('Tenant requerido para RRHH');
    const client = this.supabaseService.getClient();
    await requireTenantRecord(client, 'empleados', tenantId, empleadoId, 'Empleado');
    const data = await readCompleteCatalog(client, 'expediente_documentos', '*',
      query => query.eq('tenant_id', tenantId).eq('id_empleado', empleadoId).eq('activo', true),
      row => row.tenant_id === tenantId && row.id_empleado === empleadoId, [['fecha_subida', false], ['id', false]]);
    return { success: true, data };
  }

  async subirDocumento(
    empleadoId: string,
    tipoDocumento: string,
    nombreArchivo: string,
    archivoUrl: string,
    _subidoPor: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'FILE_ADD',
      {
        empleado_id: empleadoId,
        tipo_documento: tipoDocumento,
        nombre_archivo: nombreArchivo,
        archivo_url: archivoUrl,
      },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  // ===== DASHBOARD Y REPORTES =====
  async getDashboardRrhh(tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const client = this.supabaseService.getClient();

    // Empleados activos
    const { count: empleadosActivosCount } = await client
      .from('empleados')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'activo');

    // Solicitudes pendientes
    const { count: solicitudesPendientesCount } = await client
      .from('solicitudes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'pendiente');

    // Evaluaciones pendientes
    const { count: evaluacionesPendientesCount } = await client
      .from('evaluaciones')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'borrador');

    // Próximos cumpleaños
    const { data: cumpleanos } = await client
      .from('empleados')
      .select('nombres, apellidos, fecha_nacimiento')
      .eq('tenant_id', currentTenantId)
      .eq('estado', 'activo')
      .limit(5);

    return {
      success: true,
      data: {
        empleadosActivos: empleadosActivosCount || 0,
        solicitudesPendientes: solicitudesPendientesCount || 0,
        evaluacionesPendientes: evaluacionesPendientesCount || 0,
        proximosCumpleanos: cumpleanos || [],
      },
    };
  }

  // ===== PAGOS Y COMPROBANTES =====
  async getPagos(
    periodo?: string,
    empleadoId?: string,
    tenantId?: string,
  ) {
    try {
      if (!tenantId) {
        throw new Error('Tenant requerido para RRHH');
      }
      const currentTenantId = tenantId;

      this.logger.log('🔍 [RRHH] Obteniendo pagos desde rrhh_pagos...', {
        periodo,
        empleadoId,
        tenantId: currentTenantId,
      });

      let query = this.supabaseService
        .getClient()
        .from('rrhh_pagos')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });

      if (periodo) query = query.eq('periodo', periodo);
      if (empleadoId) query = query.eq('empleado_id', empleadoId);

      const { data, error } = await query;
      if (error) {
        this.logger.error('❌ Error en getPagos:', error);
        throw error;
      }

      this.logger.log(
        `💰 [RRHH] Encontrados ${data?.length || 0} pagos en rrhh_pagos`,
      );

      if (!data || data.length === 0) {
        this.logger.warn('⚠️ No hay pagos en rrhh_pagos - tabla vacía');
        return { success: true, data: [] };
      }

      // Obtener datos de empleados por separado
      const pagosConEmpleados = await Promise.all(
        data.map(async (pago) => {
          const { data: empleado, error: empleadoError } = await this.supabaseService
            .getClient()
            .from('empleados')
            .select('nombres, apellidos, numero_documento')
            .eq('id', pago.empleado_id)
            .eq('tenant_id', currentTenantId)
            .maybeSingle();
          // Un empleado ausente se muestra N/A; una lectura fallida no.
          if (empleadoError) throw lecturaRrhhFallida('los empleados de los pagos');

          const resultado = {
            ...pago,
            empleado: empleado || {
              nombres: 'N/A',
              apellidos: 'N/A',
              numero_documento: 'N/A',
            },
          };

          this.logger.log('👤 Pago procesado:', {
            id: pago.id,
            empleado_id: pago.empleado_id,
            periodo: pago.periodo,
            monto_neto: pago.monto_neto,
            estado: pago.estado,
            empleado_nombre: empleado
              ? `${empleado.nombres} ${empleado.apellidos}`
              : 'N/A',
          });

          return resultado;
        }),
      );

      this.logger.log(
        `✅ [RRHH] Devolviendo ${pagosConEmpleados.length} pagos con datos de empleados`,
      );

      return { success: true, data: pagosConEmpleados };
    } catch (error: any) {
      this.logger.error('❌ Error completo en getPagos:', error);
      relanzarLecturaRrhh(error, 'los pagos de RRHH');
    }
  }

  async generarComprobantePago(pagoId: string, tenantId?: string): Promise<Buffer> {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    const client = this.supabaseService.getClient();
    const { data: pago, error: pagoError } = await client
      .from('rrhh_pagos')
      .select('*')
      .eq('id', pagoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (pagoError) {
      throw new BadRequestException(`No se pudo leer el pago: ${pagoError.message}`);
    }
    if (!pago) {
      throw new NotFoundException('Pago de RRHH no encontrado');
    }
    const pais = await this.obtenerPaisLaboral(tenantId);
    const moneda = String(pago.moneda || this.monedaLaboralPorPais(pais)).toUpperCase();

    let empleado: any = null;
    if (pago.empleado_id) {
      const { data } = await client
        .from('empleados')
        .select('*')
        .eq('id', pago.empleado_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      empleado = data;
    }

    return this.createRrhhPdf((doc) => {
      const empleadoNombre = [empleado?.nombres, empleado?.apellidos].filter(Boolean).join(' ') || 'No consignado';
      const documento = empleado?.numero_documento || empleado?.documento_numero || 'No consignado';
      const montoNeto = Number(pago.monto_neto ?? pago.monto ?? pago.total_neto ?? 0);

      doc.fontSize(20).text('COMPROBANTE DE PAGO RRHH', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Comprobante: ${pago.id}`);
      doc.text(`Empleado: ${empleadoNombre}`);
      doc.text(`Documento: ${documento}`);
      doc.text(`Periodo: ${pago.periodo || 'No consignado'}`);
      doc.text(`Fecha de pago: ${pago.fecha_pago || pago.created_at || 'No consignada'}`);
      doc.text(`Método: ${pago.metodo_pago || pago.metodo || 'No consignado'}`);
      doc.text(`Estado: ${pago.estado || 'No consignado'}`);
      doc.moveDown();
      doc.fontSize(14).text(`Monto neto: ${this.formatearMonedaLaboral(montoNeto, moneda)}`, {
        align: 'right',
      });
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#555555').text(
        'Documento generado por el ERP a partir del registro persistido del pago.',
      );
    });
  }

  async generarBoletaPago(empleadoId: string, mes: string, tenantId?: string) {
    try {
      if (!tenantId) {
        throw new Error('Tenant requerido para RRHH');
      }
      const currentTenantId = tenantId;

      this.logger.log(
        `📄 [RRHH] Generando boleta de pago para empleado ${empleadoId}, mes ${mes}, tenant: ${currentTenantId}`,
      );

      // Obtener datos del empleado
      const { data: empleado, error: empleadoError } =
        await this.supabaseService
          .getClient()
          .from('empleados')
          .select('*')
          .eq('id', empleadoId)
          .eq('tenant_id', currentTenantId)
          .maybeSingle();

      if (empleadoError && empleadoError.code !== '22P02') {
        throw lecturaRrhhFallida('el empleado');
      }
      if (!empleado) {
        throw new NotFoundException('Empleado no encontrado');
      }

      // Obtener pagos del mes
      const { data: pagos, error: pagosError } =
        await this.supabaseService
          .getClient()
          .from('rrhh_pagos')
          .select('*')
          .eq('empleado_id', empleadoId)
          .eq('tenant_id', currentTenantId)
          .like('periodo', `${mes}%`)
          .order('created_at', { ascending: false });

      if (pagosError) {
        throw lecturaRrhhFallida('los pagos del empleado');
      }

      if (!pagos || pagos.length === 0) {
        throw new NotFoundException(`No se encontraron pagos para el empleado en ${mes}`);
      }
      const pais = await this.obtenerPaisLaboral(currentTenantId);
      const moneda = String(
        pagos.find((pago: any) => pago.moneda)?.moneda || this.monedaLaboralPorPais(pais),
      ).toUpperCase();

      // Calcular totales
      const totalBruto = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.monto_bruto) || 0),
        0,
      );
      const totalDescuentos = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.descuentos) || 0),
        0,
      );
      const totalNeto = pagos.reduce(
        (sum: number, p: any) => sum + (parseFloat(p.monto_neto) || 0),
        0,
      );

      // Generar HTML de la boleta
      const boletaHTML = this.generarBoletaHTML(empleado, pagos, {
        totalBruto,
        totalDescuentos,
        totalNeto,
        mes,
        pais,
        moneda,
      });

      return {
        success: true,
        data: {
          empleado: `${empleado.nombres} ${empleado.apellidos}`,
          mes: mes,
          totalPagos: pagos.length,
          totalNeto: totalNeto,
          boleta_html: boletaHTML,
        },
        message: 'Boleta de pago generada exitosamente',
      };
    } catch (error: any) {
      this.logger.error('❌ Error generando boleta de pago:', error);
      relanzarLecturaRrhh(error, 'la boleta de pago');
    }
  }

  private generarBoletaHTML(empleado: any, pagos: any[], totales: any) {
    const titulo =
      totales.pais === 'CO'
        ? 'Desprendible de Nómina'
        : totales.pais === 'AR'
          ? 'Recibo de Sueldo'
          : 'Boleta de Pago';
    const locale =
      totales.pais === 'AR' ? 'es-AR' : totales.pais === 'CO' ? 'es-CO' : 'es-PE';
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${titulo} - ${escapeHtml(empleado.nombres)} ${escapeHtml(empleado.apellidos)}</title>
    </head>
    <body>
        <div class="boleta">
            <div class="header">
                <div class="company">NEON SYSTEM</div>
                <div class="title">${titulo}</div>
                <div class="periodo">Período: ${escapeHtml(totales.mes)}</div>
            </div>

            <div class="empleado-info">
                <div class="info-section">
                    <div class="info-label">Empleado:</div>
                    <div class="info-value">${escapeHtml(empleado.nombres)} ${escapeHtml(empleado.apellidos)}</div>
                    <div class="info-label">Documento:</div>
                    <div class="info-value">${escapeHtml(empleado.numero_documento || 'N/A')}</div>
                    <div class="info-label">Email:</div>
                    <div class="info-value">${escapeHtml(empleado.email || 'N/A')}</div>
                </div>
                <div class="info-section">
                    <div class="info-label">Puesto:</div>
                    <div class="info-value">${escapeHtml(empleado.puesto || 'N/A')}</div>
                    <div class="info-label">Departamento:</div>
                    <div class="info-value">${escapeHtml(empleado.departamento || 'N/A')}</div>
                    <div class="info-label">Fecha de Ingreso:</div>
                    <div class="info-value">${empleado.fecha_ingreso ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-PE') : 'N/A'}</div>
                </div>
            </div>

            <div class="pagos-detalle">
                <h3>Detalle de Pagos</h3>
                <table class="pagos-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Método</th>
                            <th class="numero">Sueldo Bruto</th>
                            <th class="numero">Descuentos</th>
                            <th class="numero">Neto Pagado</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pagos
        .map((pago) => {
          const fechaPago = pago.fecha_pago
            ? new Date(pago.fecha_pago).toLocaleDateString(
              locale,
            )
            : 'N/A';
          return `
                            <tr>
                                <td>${fechaPago}</td>
                                <td>${pago.metodo_pago === 'efectivo'
              ? '💵 Efectivo'
              : '🏦 Transferencia'
            }</td>
                                <td class="numero">${this.formatearMonedaLaboral(parseFloat(
              pago.monto_bruto || 0,
            ), totales.moneda)}</td>
                                <td class="numero">${this.formatearMonedaLaboral(parseFloat(
              pago.descuentos || 0,
            ), totales.moneda)}</td>
                                <td class="numero">${this.formatearMonedaLaboral(parseFloat(
              pago.monto_neto || 0,
            ), totales.moneda)}</td>
                                <td>${escapeHtml(pago.estado)}</td>
                            </tr>
                        `;
        })
        .join('')}
                    </tbody>
                </table>
            </div>

            <div class="resumen">
                <h3>Resumen Total</h3>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <div class="resumen-label">Total Bruto</div>
                        <div class="resumen-valor bruto">${this.formatearMonedaLaboral(
          totales.totalBruto,
          totales.moneda,
        )}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Descuentos</div>
                        <div class="resumen-valor descuentos">${this.formatearMonedaLaboral(
          totales.totalDescuentos,
          totales.moneda,
        )}</div>
                    </div>
                    <div class="resumen-item">
                        <div class="resumen-label">Total Neto</div>
                        <div class="resumen-valor neto">${this.formatearMonedaLaboral(
          totales.totalNeto,
          totales.moneda,
        )}</div>
                    </div>
                </div>
            </div>

            <div class="footer">
                <p>Este documento certifica los pagos realizados al empleado durante el período ${escapeHtml(totales.mes)
      }</p>
                <p>Sistema ERP - Generado automáticamente el ${new Date().toLocaleDateString(
        locale,
      )}</p>
            </div>
        </div>
    </body>
    </html>`;
  }

  // ===== CONTRATOS =====
  async getContratos(empleadoId?: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    return readCompleteCatalog(this.supabaseService.getClient(), 'contratos', `
        *,
        empleados(nombres, apellidos, numero_documento)
      `, query => {
        query = query.eq('tenant_id', currentTenantId);
        return empleadoId ? query.eq('id_empleado', empleadoId) : query;
      }, row => row.tenant_id === currentTenantId && typeof row.id_empleado === 'string' && !!row.id_empleado && (!empleadoId || row.id_empleado === empleadoId), [['fecha_inicio', false], ['id', true]]);
  }

  /**
   * Calcula el depósito semestral de CTS de todos los empleados activos
   * (D.S. 001-97-TR, art. 21): mayo liquida noviembre-abril y noviembre liquida
   * mayo-octubre.
   *
   * La CTS no es un concepto de planilla: no se paga con la remuneración del mes
   * ni está afecta a aportes o a renta, por eso tiene su propio libro. Recalcular
   * un semestre actualiza el importe en vez de duplicar el depósito.
   */
  async calcularDepositosCts(
    periodo: string, tenantId: string, usuarioId: string,
    gratificacionesPrevias: GratificacionPreviaEmpleadoDto[] = [],
    remuneracionesPrevias: RemuneracionPreviaEmpleadoDto[] = [],
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant requerido para RRHH');
    }
    if (!usuarioId) {
      throw new BadRequestException('Actor requerido para calcular los depósitos CTS');
    }
    if ((await this.obtenerPaisLaboral(tenantId)) !== 'PE') {
      throw new BadRequestException(
        'CTS es un beneficio exclusivo de la normativa peruana; Colombia usa cesantías y Argentina su liquidación LCT.',
      );
    }

    const semestre = semestreCts(periodo);
    if (!semestre) {
      throw new BadRequestException(
        `La CTS se deposita en mayo y noviembre. El periodo "${periodo}" no corresponde a un depósito.`,
      );
    }
    // Calcular antes de que termine el semestre contaba meses no trabajados y,
    // si se depositaba, una liquidación posterior volvía a pagar ese tramo.
    const finSemestreFecha = `${semestre.fin.getFullYear()}-${String(semestre.fin.getMonth() + 1).padStart(2, '0')}-01`;
    if (fechaHoyEnPeru() < finSemestreFecha) {
      throw new BadRequestException(
        `El semestre de la CTS ${periodo} aún no termina; se calcula a partir del ${semestre.fin.toISOString().slice(0, 10)}.`,
      );
    }

    const client = this.supabaseService.getClient();
    const { data: empleados, error } = await client
      .from('empleados')
      .select('*, contratos(*)')
      .eq('tenant_id', tenantId)
      .eq('estado', 'activo');

    if (error) throw error;

    const declaraciones = new Map<string, GratificacionPreviaEmpleadoDto>();
    for (const declaracion of gratificacionesPrevias) {
      if (declaraciones.has(declaracion.empleado_id)
        || !(empleados || []).some((e: any) => e.id === declaracion.empleado_id)) {
        throw new BadRequestException('Las gratificaciones previas deben corresponder a empleados activos distintos de esta empresa');
      }
      declaraciones.set(declaracion.empleado_id, declaracion);
    }

    const basesDeclaradas = new Map<string, RemuneracionPreviaEmpleadoDto>();
    for (const declaracion of remuneracionesPrevias) {
      if (basesDeclaradas.has(declaracion.empleado_id)
        || !(empleados || []).some((e: any) => e.id === declaracion.empleado_id)) {
        throw new BadRequestException('Las remuneraciones previas deben corresponder a empleados activos distintos de esta empresa');
      }
      basesDeclaradas.set(declaracion.empleado_id, declaracion);
    }
    const depositos = [];

    for (const empleado of empleados || []) {
      const tiempo = tiempoComputableCts(periodo, parseFechaLocal(empleado.fecha_ingreso));
      if (!tiempo || (tiempo.meses === 0 && tiempo.dias === 0)) continue;

      // Base real del cierre abril/octubre; los aumentos posteriores no alteran
      // un semestre histórico. La declaración admite base computable externa
      // con remuneraciones variables documentadas, excluyendo el1/6 añadido abajo.
      const baseCts = await this.obtenerBaseGratificacionTrunca(empleado, semestre.fin, tenantId, usuarioId,
        tiempo.meses || tiempo.dias ? 1 : 0, basesDeclaradas.get(empleado.id));
      const remuneracion = baseCts.monto;
      const ingreso = parseFechaLocal(empleado.fecha_ingreso);
      const gratificacionCts = await this.obtenerGratificacionPercibidaCts(
        tenantId, empleado.id, ingreso, new Date(semestre.fin.getTime() - 86400000),
        usuarioId, declaraciones.get(empleado.id),
      );
      const computable = remuneracionComputableCts(remuneracion, gratificacionCts.monto);

      depositos.push({
        tenant_id: tenantId,
        empleado_id: empleado.id,
        periodo,
        semestre_inicio: semestre.inicio.toISOString().slice(0, 10),
        semestre_fin: new Date(semestre.fin.getTime() - 86400000).toISOString().slice(0, 10),
        remuneracion_computable: computable,
        meses_computables: tiempo.meses,
        dias_computables: tiempo.dias,
        monto: calcularCts(computable, tiempo),
        estado: 'CALCULADO',
        metadata: {
          remuneracion_mensual: remuneracion,
          asignacion_familiar_incluida: Number(baseCts.asignacion_familiar ?? 0) > 0,
          base_remuneracion_cts: baseCts,
          gratificacion_cts: gratificacionCts,
        },
      });
    }

    if (depositos.length === 0) {
      return { success: true, periodo, depositos: [], total: 0 };
    }

    const { data: persisted, error: persistError } = await client.rpc(
      'guardar_depositos_cts_calculados_tx',
      {
        p_tenant_id: tenantId,
        p_periodo: periodo,
        p_depositos: depositos,
        p_usuario_id: usuarioId,
      },
    );
    if (persistError) this.throwRrhhLifecycleRpcError(persistError);

    const ids = Array.isArray(persisted?.depositosIds) ? persisted.depositosIds : [];
    const { data, error: reloadError } = ids.length > 0
      ? await client.from('depositos_cts').select('*').eq('tenant_id', tenantId).in('id', ids)
      : { data: [], error: null };
    if (reloadError) throw reloadError;

    return {
      success: true,
      periodo,
      depositos: data || [],
      total: Number(persisted?.total || 0),
    };
  }

  /** Igual criterio que la planilla para decidir si corresponde asignación familiar. */
  private tieneHijosEmpleado(empleado: any): boolean {
    return Boolean(empleado?.tiene_hijos) || Number(empleado?.cantidad_hijos ?? 0) > 0;
  }

  // RMV vigente para el periodo del contrato. Prioriza la fila del tenant sobre la global.
  private async obtenerRmvVigente(periodo: string, tenantId: string): Promise<number> {
    const client = this.supabaseService.getClient();
    const base = () =>
      client
        .from('normativa_peru_periodos')
        .select('rmv')
        .eq('pais_codigo', 'PE')
        .eq('activo', true)
        .lte('periodo', periodo)
        .order('periodo', { ascending: false })
        .limit(1);

    const { data: propia } = await base().eq('tenant_id', tenantId).maybeSingle();
    if (propia?.rmv) return Number(propia.rmv);

    const { data: global } = await base().is('tenant_id', null).maybeSingle();
    return Number(global?.rmv) || RMV_PERU_FALLBACK;
  }

  // Valida el contrato contra la normativa laboral peruana (D.S. 003-97-TR).
  private async validarContratoPeru(contratoData: any, tenantId: string): Promise<void> {
    const tipo = String(contratoData?.tipo_contrato ?? '').trim().toLowerCase();
    const jornada = String(contratoData?.jornada_laboral ?? '').trim().toLowerCase();
    const sueldo = Number(contratoData?.sueldo_bruto ?? contratoData?.salario ?? 0);
    const fechaInicio = String(contratoData?.fecha_inicio ?? '').slice(0, 10);
    const fechaFin = String(contratoData?.fecha_fin ?? '').slice(0, 10);

    // Periodo de prueba: 3 meses de regla general, ampliable a 6 (calificados o de
    // confianza) y 12 (personal de direccion). LPCL art. 10.
    const periodoPrueba = Number(contratoData?.periodo_prueba_meses ?? 0);
    if (Number.isFinite(periodoPrueba) && periodoPrueba > 12) {
      throw new BadRequestException(
        'El periodo de prueba no puede superar 12 meses (máximo legal para personal de dirección).',
      );
    }

    // Contratos sujetos a modalidad: duracion maxima de 5 anios. LPCL art. 74.
    if (tipo === 'temporal' && fechaInicio && fechaFin) {
      const inicio = new Date(`${fechaInicio}T00:00:00`);
      const topeLegal = new Date(inicio);
      topeLegal.setFullYear(topeLegal.getFullYear() + 5);
      if (new Date(`${fechaFin}T00:00:00`) > topeLegal) {
        throw new BadRequestException(
          'Un contrato sujeto a modalidad no puede exceder 5 años de duración (D.S. 003-97-TR art. 74).',
        );
      }
    }

    // RMV: exigible en contratos laborales dependientes a jornada completa. No aplica a
    // part time ni a locacion de servicios (contrato civil, no laboral).
    const esContratoLaboral = tipo === 'indefinido' || tipo === 'temporal';
    const esJornadaCompleta = jornada === '' || jornada === 'tiempo_completo';
    if (esContratoLaboral && esJornadaCompleta && sueldo > 0) {
      const periodo = (fechaInicio || (await fechaHoyDelTenant(this.supabaseService.getClient(), tenantId))).slice(0, 7);
      const rmv = await this.obtenerRmvVigente(periodo, tenantId);
      if (sueldo < rmv) {
        throw new BadRequestException(
          `La remuneración de un contrato a jornada completa no puede ser menor a la RMV vigente (S/ ${rmv.toFixed(2)}).`,
        );
      }
    }

    // El régimen pensionario define cuánto se le descuenta al trabajador y no
    // admite valor por defecto: elegir entre AFP y ONP es una decisión suya. Sin
    // él la planilla no puede calcularse, así que se exige al crear el contrato en
    // vez de dejar que reviente meses después al liquidar. Se valida al final para
    // no tapar los errores de RMV, modalidad o periodo de prueba, que son más
    // específicos y ya existían.
    const regimen = String(contratoData?.regimen_pensionario ?? '').trim().toUpperCase();
    if (esContratoLaboral && !['AFP', 'ONP'].includes(regimen)) {
      throw new BadRequestException(
        'Debe indicar el régimen pensionario del trabajador (AFP u ONP) en un contrato laboral peruano.',
      );
    }
    if (regimen === 'AFP') {
      const administradora = String(contratoData?.afp_codigo ?? '').trim();
      const tipoComision = String(contratoData?.tipo_comision_afp ?? '').trim().toUpperCase();
      if (!administradora) {
        throw new BadRequestException(
          'Un contrato afiliado a AFP debe indicar la administradora (afp_codigo).',
        );
      }
      if (!['FLUJO', 'SALDO', 'MIXTA'].includes(tipoComision)) {
        throw new BadRequestException(
          'Un contrato afiliado a AFP debe indicar el tipo de comisión (FLUJO, SALDO o MIXTA).',
        );
      }

      // Las tasas también se declaran. Las publica la SBS, cambian por trimestre y
      // difieren entre las cuatro administradoras: el motor caía a las de Integra
      // para todas, así que un afiliado a Prima, Profuturo o Hábitat se liquidaba
      // con una comisión que no era la suya. Cablear un catálogo aquí sólo
      // trasladaría el problema a la fecha en que la SBS lo cambie.
      const comision = Number(contratoData?.tasa_comision_afp);
      const seguro = Number(contratoData?.tasa_seguro_afp);
      for (const [valor, campo] of [[comision, 'la comisión'], [seguro, 'la prima de seguro']] as const) {
        if (!Number.isFinite(valor) || valor < 0 || valor > 0.5) {
          throw new BadRequestException(
            `Un contrato afiliado a AFP debe indicar ${campo} vigente de su administradora, `
            + 'expresada en fracción (por ejemplo 0.0155 para 1.55 %).',
          );
        }
      }
    }
  }

  private async validarContratoArgentina(contratoData: any, tenantId: string): Promise<void> {
    const client = this.supabaseService.getClient();
    const { data: config, error } = await client
      .from('rrhh_configuracion_argentina')
      .select(
        'convenio_colectivo_codigo, art_tasa, periodo_prueba_max_meses, configuracion_confirmada',
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;

    const moneda = String(contratoData?.moneda || 'ARS').trim().toUpperCase();
    if (moneda !== 'ARS') {
      throw new BadRequestException('Los contratos del tenant argentino deben liquidarse en ARS');
    }

    const tipo = String(contratoData?.tipo_contrato || '').trim().toLowerCase();
    const esRelacionDependencia = !['locacion_servicios', 'servicios'].includes(tipo);
    const convenio = String(
      contratoData?.convenio_colectivo_codigo || config?.convenio_colectivo_codigo || '',
    ).trim();
    const categoria = String(contratoData?.categoria_convenio || '').trim();
    if (esRelacionDependencia && (!convenio || !categoria)) {
      throw new BadRequestException(
        'El contrato argentino requiere convenio colectivo y categoría salarial para liquidar correctamente.',
      );
    }

    const periodoPrueba = Number(contratoData?.periodo_prueba_meses ?? 0);
    const maximo = Math.max(0, Number(config?.periodo_prueba_max_meses ?? 6));
    if (!Number.isFinite(periodoPrueba) || periodoPrueba < 0 || periodoPrueba > maximo) {
      throw new BadRequestException(
        `El período de prueba configurado para este empleador no puede superar ${maximo} meses (LCT art. 92 bis).`,
      );
    }

    const artTasa = Number(contratoData?.art_tasa ?? config?.art_tasa ?? 0);
    if (esRelacionDependencia && (!Number.isFinite(artTasa) || artTasa <= 0)) {
      throw new BadRequestException(
        'Debe confirmar una alícuota ART antes de activar un contrato argentino.',
      );
    }

    if (config && config.configuracion_confirmada === false) {
      throw new BadRequestException(
        'La configuración laboral Argentina debe ser confirmada antes de crear contratos.',
      );
    }
  }

  private async validarContratoColombia(contratoData: any, tenantId: string): Promise<void> {
    const { data: config, error } = await this.supabaseService
      .getClient()
      .from('rrhh_configuracion_colombia')
      .select(
        'eps_default, fondo_pension_default, arl_default, arl_tasa, caja_compensacion_default, salario_minimo, configuracion_confirmada',
      )
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;

    const moneda = String(contratoData?.moneda || 'COP').trim().toUpperCase();
    if (moneda !== 'COP') {
      throw new BadRequestException('Los contratos del tenant colombiano deben liquidarse en COP');
    }
    const tipo = String(contratoData?.tipo_contrato || '').trim().toLowerCase();
    const jornada = String(contratoData?.jornada_laboral || '').trim().toLowerCase();
    const esDependiente = !['prestacion_servicios', 'locacion_servicios', 'servicios'].includes(tipo);
    const jornadaCompleta = jornada === '' || jornada === 'tiempo_completo';
    const sueldo = Number(contratoData?.sueldo_bruto ?? contratoData?.salario ?? 0);
    const salarioMinimo = Number(config?.salario_minimo ?? 1_750_905);
    if (esDependiente && jornadaCompleta && sueldo > 0 && sueldo < salarioMinimo) {
      throw new BadRequestException(
        `El salario de jornada completa no puede ser inferior al SMMLV vigente (COP ${salarioMinimo.toFixed(0)}).`,
      );
    }
    const required = [
      contratoData?.eps_codigo || config?.eps_default,
      contratoData?.fondo_pension_codigo || config?.fondo_pension_default,
      contratoData?.arl_codigo || config?.arl_default,
      contratoData?.caja_compensacion_codigo || config?.caja_compensacion_default,
    ];
    if (esDependiente && required.some((value) => !String(value || '').trim())) {
      throw new BadRequestException(
        'El contrato colombiano requiere EPS, fondo de pensión, ARL y caja de compensación.',
      );
    }
    const arlTasa = Number(contratoData?.arl_tasa ?? config?.arl_tasa ?? 0);
    if (esDependiente && (!Number.isFinite(arlTasa) || arlTasa <= 0)) {
      throw new BadRequestException('Debe configurar la clase y tasa ARL antes de activar el contrato.');
    }
    if (config && config.configuracion_confirmada === false) {
      throw new BadRequestException(
        'La configuración laboral Colombia debe ser confirmada antes de crear contratos.',
      );
    }
  }

  async createContrato(
    contratoData: any,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Agregar tenant_id
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;
    const empleadoId = contratoData?.id_empleado || contratoData?.empleado_id;
    if (!empleadoId) {
      throw new BadRequestException('Debe enviar empleado_id para crear contrato');
    }

    const paisLaboral = await this.obtenerPaisLaboral(currentTenantId);
    if (paisLaboral === 'AR') {
      contratoData = {
        ...contratoData,
        moneda: 'ARS',
        regimen_pensionario: 'SIN_REGIMEN',
        regimen_seguridad_social:
          contratoData?.regimen_seguridad_social || 'SIPA',
      };
      await this.validarContratoArgentina(contratoData, currentTenantId);
    } else if (paisLaboral === 'CO') {
      contratoData = {
        ...contratoData,
        moneda: 'COP',
        regimen_pensionario:
          contratoData?.regimen_pensionario || 'PENSION_COLOMBIA',
        regimen_seguridad_social:
          contratoData?.regimen_seguridad_social || 'PILA',
      };
      await this.validarContratoColombia(contratoData, currentTenantId);
    } else {
      await this.validarContratoPeru(contratoData, currentTenantId);
    }

    const metadataBase =
      contratoData?.metadata && typeof contratoData.metadata === 'object' && !Array.isArray(contratoData.metadata)
        ? contratoData.metadata
        : {};
    const metadata = {
      ...metadataBase,
      ...(contratoData?.cargo ? { cargo: String(contratoData.cargo).trim() } : {}),
      // La administradora y el tipo de comisión ya vienen validados arriba: no se
      // inventan. Antes se caía a Integra/FLUJO en silencio, de modo que un
      // afiliado a otra AFP quedaba registrado con datos que no eran los suyos.
      // Las tasas sí conservan un valor por defecto porque son las vigentes del
      // mercado y el motor las usa como referencia; declararlas sigue siendo
      // preferible y por eso se respeta lo que envíe el empleador.
      ...(paisLaboral === 'PE' && String(contratoData?.regimen_pensionario ?? '').toUpperCase() === 'AFP'
        ? {
            afp_codigo: String(contratoData.afp_codigo).trim().toUpperCase(),
            tipo_comision_afp: String(contratoData.tipo_comision_afp).trim().toUpperCase(),
            tasa_comision_afp: Number(contratoData.tasa_comision_afp),
            tasa_seguro_afp: Number(contratoData.tasa_seguro_afp),
          }
        : {}),
    };
    const camposPermitidos = [
      'id',
      'id_empleado',
      'empleado_id',
      'tipo_contrato',
      'fecha_inicio',
      'fecha_fin',
      'sueldo_bruto',
      'salario',
      'moneda',
      'beneficios',
      'regimen_pensionario',
      'jornada_laboral',
      'periodo_prueba_meses',
      'fecha_firma',
      'estado',
      'activo',
      'metadata',
      'regimen_seguridad_social',
      'convenio_colectivo_codigo',
      'categoria_convenio',
      'modalidad_contratacion_codigo',
      'situacion_revista_codigo',
      'obra_social_codigo',
      'sindicato_codigo',
      'sindicato_aporte_tasa',
      'art_cuit',
      'art_tasa',
      'eps_codigo',
      'fondo_pension_codigo',
      'arl_codigo',
      'caja_compensacion_codigo',
      'ganancias_retencion_mensual',
      'seguro_vida_monto',
      'mejor_remuneracion_normal_habitual',
      'tope_indemnizatorio_convenio',
      'fondo_cese_reemplaza_indemnizacion',
    ];
    const datosLimpios = Object.fromEntries(
      Object.entries({
        ...contratoData,
        id_empleado: empleadoId,
        empleado_id: empleadoId,
        sueldo_bruto: contratoData?.sueldo_bruto ?? contratoData?.salario,
        salario: contratoData?.salario ?? contratoData?.sueldo_bruto,
      })
        .filter(([key]) => camposPermitidos.includes(key))
        .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );
    if (Object.keys(metadata).length > 0) {
      datosLimpios.metadata = metadata;
    }
    // Compatibilidad con el formulario histórico: "activo" significaba
    // contrato vigente, pero nunca fue un estado válido de la tabla.
    if (String(datosLimpios.estado || '').toLowerCase() === 'activo') {
      datosLimpios.estado = 'vigente';
    }
    const data = await this.ejecutarOperacionRrhh(
      'CONTRACT_CREATE', datosLimpios, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async renovarContrato(
    contratoId: string,
    meses: number,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'CONTRACT_RENEW', { id: contratoId, meses }, currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async finalizarContrato(
    contratoId: string,
    motivoFinalizacion: string,
    fechaFinalizacion: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'CONTRACT_FINALIZE',
      { id: contratoId, motivo_finalizacion: motivoFinalizacion, fecha_finalizacion: fechaFinalizacion },
      currentTenantId, actorId, idempotencyKey,
    );
    return { success: true, data };
  }

  async generarContratoPDF(contratoId: string, tenantId?: string): Promise<Buffer> {
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }

    const client = this.supabaseService.getClient();
    const { data: contrato, error: contratoError } = await client
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (contratoError) {
      throw new BadRequestException(`No se pudo leer el contrato: ${contratoError.message}`);
    }
    if (!contrato) {
      throw new NotFoundException('Contrato laboral no encontrado');
    }
    const pais = await this.obtenerPaisLaboral(tenantId);
    const moneda = String(contrato.moneda || this.monedaLaboralPorPais(pais)).toUpperCase();

    const empleadoId = contrato.empleado_id || contrato.id_empleado;
    let empleado: any = null;
    if (empleadoId) {
      const { data } = await client
        .from('empleados')
        .select('*')
        .eq('id', empleadoId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      empleado = data;
    }

    return this.createRrhhPdf((doc) => {
      const empleadoNombre = [empleado?.nombres, empleado?.apellidos].filter(Boolean).join(' ') || 'No consignado';
      const documento = empleado?.numero_documento || empleado?.documento_numero || 'No consignado';
      const salario = Number(
        contrato.sueldo_bruto ?? contrato.salario ?? contrato.sueldo ?? contrato.remuneracion ?? 0,
      );

      doc.fontSize(20).text('CONTRATO LABORAL', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Contrato: ${contrato.id}`);
      doc.text(`Empleado: ${empleadoNombre}`);
      doc.text(`Documento: ${documento}`);
      doc.text(`Puesto: ${empleado?.puesto || contrato.puesto || 'No consignado'}`);
      doc.text(`Tipo: ${contrato.tipo_contrato || contrato.tipo || 'No consignado'}`);
      doc.text(`Inicio: ${contrato.fecha_inicio || 'No consignado'}`);
      doc.text(`Fin: ${contrato.fecha_fin || 'Indefinido'}`);
      doc.text(`Estado: ${contrato.estado || 'No consignado'}`);
      doc.text(`Remuneración: ${this.formatearMonedaLaboral(salario, moneda)}`);
      if (contrato.observaciones) {
        doc.moveDown();
        doc.text(`Observaciones: ${contrato.observaciones}`);
      }
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#555555').text(
        'Representación generada desde el contrato persistido. La validez legal y firma corresponden al proceso laboral aplicable.',
      );
    });
  }

  private createRrhhPdf(render: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Creator: 'ERP RRHH' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      render(doc);
      doc.end();
    });
  }

  // ===== ASISTENCIAS MEJORADAS =====
  async getAsistenciasPorFecha(fecha: string, tenantId?: string) {
    // ✅ MULTI-TENANT: Filtrar por tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('asistencia')
      .select(
        `
        *,
        empleados(
          nombres,
          apellidos,
          numero_documento,
          departamentos(nombre)
        )
      `,
      )
      .eq('tenant_id', currentTenantId)
      .eq('fecha', fecha)
      .order('hora_entrada', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async marcarAsistencia(
    empleadoId: string,
    fecha: string,
    tipo: 'entrada' | 'salida',
    hora: string,
    tenantId?: string,
    actorId?: string,
    idempotencyKey?: string,
  ) {
    // ✅ MULTI-TENANT: Validar tenant
    if (!tenantId) {
      throw new Error('Tenant requerido para RRHH');
    }
    const currentTenantId = tenantId;

    const data = await this.ejecutarOperacionRrhh(
      'ATTENDANCE_MARK', { empleado_id: empleadoId, fecha, tipo, hora },
      currentTenantId, actorId, idempotencyKey,
    );
    return {
      success: true,
      data,
      message: tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada',
    };
  }

  private monedaLaboralPorPais(pais: string): 'PEN' | 'ARS' | 'COP' {
    if (pais === 'AR') return 'ARS';
    if (pais === 'CO') return 'COP';
    return 'PEN';
  }

  private formatearMonedaLaboral(monto: number, moneda: string): string {
    const codigo = String(moneda || 'PEN').toUpperCase();
    const locale = codigo === 'ARS' ? 'es-AR' : codigo === 'COP' ? 'es-CO' : 'es-PE';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: codigo,
      minimumFractionDigits: 2,
    }).format(Number(monto || 0));
  }
}
