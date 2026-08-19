import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CreateCajaDto } from './dto/create-caja.dto';
import { UpdateCajaDto } from './dto/update-caja.dto';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { ConfiguracionCajaService } from './services/configuracion-caja.service';
import { AutorizacionesCajaService } from './services/autorizaciones-caja.service';
import { CashReconciliationService, Denominaciones } from './services/cash-reconciliation.service';
import { CashReportsService } from './services/cash-reports.service';
import { CashMovementsService } from './services/cash-movements.service';
import { CashClosingService, DatosCierre } from './services/cash-closing.service';
import { CashAuthorizationService } from './services/cash-authorization.service';
import { CashWithdrawalsService } from './services/cash-withdrawals.service';
import { CashShiftChangesService } from './services/cash-shift-changes.service';
import {
  CompletarCambioTurnoCajaDto,
  ConciliarRetiroCajaDto,
  MovimientoManualCajaDto,
  SolicitarRetiroCajaDto,
} from './dto/cash-operations.dto';

@Injectable()
export class CajasService {
  private readonly logger = new Logger(CajasService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly configuracionService: ConfiguracionCajaService,
    private readonly autorizacionesService: AutorizacionesCajaService,
    private readonly reconciliationService: CashReconciliationService,
    private readonly cashReportsService: CashReportsService,
    private readonly movementsService: CashMovementsService,
    private readonly cashClosingService: CashClosingService,
    private readonly authorizationService: CashAuthorizationService,
    private readonly withdrawalsService: CashWithdrawalsService,
    private readonly shiftChangesService: CashShiftChangesService,
  ) { }

  async listarCajas(tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async crearCaja(
    tenantId: string,
    dto: CreateCajaDto,
    userId: string | undefined,
    idempotencyKey: string,
  ) {
    if (!userId) {
      throw new ForbiddenException('La creación de caja requiere un actor autenticado');
    }
    const { data, error } = await this.supabase.getClient().rpc('crear_caja_tx', {
      p_tenant_id: tenantId,
      p_payload: dto,
      p_actor_id: userId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo crear la caja');
    }
    return (data as any)?.caja ?? data;
  }

  async actualizarCaja(
    tenantId: string,
    id: string,
    dto: UpdateCajaDto,
    userId: string | undefined,
    idempotencyKey: string,
  ) {
    if (!userId) {
      throw new ForbiddenException('La actualización de caja requiere un actor autenticado');
    }
    const { data, error } = await this.supabase.getClient().rpc('actualizar_caja_tx', {
      p_tenant_id: tenantId,
      p_caja_id: id,
      p_payload: dto,
      p_actor_id: userId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo actualizar la caja');
    }
    return (data as any)?.caja ?? data;
  }

  async obtenerOpcionesContables(tenantId: string, userId?: string) {
    if (!userId) {
      throw new ForbiddenException('La consulta contable de caja requiere un actor autenticado');
    }
    const { data, error } = await this.supabase.getClient().rpc(
      'obtener_opciones_contables_caja',
      { p_tenant_id: tenantId, p_actor_id: userId },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudieron obtener las opciones contables');
    }
    return data;
  }

  /**
   * Saldo teórico de una sesión: lo que debería haber en la gaveta según el monto
   * de apertura y los movimientos registrados. Misma fórmula que usa el cierre con
   * arqueo, para que un cierre administrativo no pierda la trazabilidad del efectivo.
   */
  private async calcularSaldoTeoricoSesion(tenantId: string, sesionId: string): Promise<number | null> {
    const client = this.supabase.getClient();

    const { data: sesion } = await client
      .from('sesiones_caja')
      .select('monto_inicio, monto_inicial')
      .eq('tenant_id', tenantId)
      .eq('id', sesionId)
      .maybeSingle();

    const { data: movimientos, error } = await client
      .from('movimientos_caja')
      .select('monto')
      .eq('tenant_id', tenantId)
      .eq('sesion_caja_id', sesionId);

    if (error) {
      return null;
    }

    const apertura = Number((sesion as any)?.monto_inicio ?? (sesion as any)?.monto_inicial ?? 0);
    const suma = (movimientos || []).reduce((total, m: any) => total + Number(m.monto ?? 0), 0);
    const teorico = apertura + suma;

    return Number.isFinite(teorico) ? Number(teorico.toFixed(2)) : null;
  }

  /**
   * Campos de cierre para una sesión que se cierra sin contar el efectivo.
   * Antes se guardaba esperado 0 / contado 0 / diferencia 0, afirmando que la caja
   * estaba vacía y cuadrada y borrando el rastro del efectivo. Ahora se registra el
   * saldo teórico; el trigger app.normalize_sesiones_caja_row fuerza contado a 0 y
   * deriva la diferencia, de modo que la sesión queda marcada como descuadrada y
   * visible en los reportes en vez de pasar como cierre limpio.
   */
  private async construirCierreAdministrativo(
    tenantId: string,
    sesionId: string,
    ahoraIso: string,
    usuarioCierre: string | null,
  ): Promise<Record<string, any>> {
    return {
      estado: 'CERRADA',
      fecha_cierre: ahoraIso,
      hora_cierre: ahoraIso,
      cierre_administrativo: true,
      razon_cierre_administrativo: 'Cierre automático: sesión antigua detectada al abrir nueva caja',
      usuario_cierre: usuarioCierre,
      monto_esperado: await this.calcularSaldoTeoricoSesion(tenantId, sesionId),
      monto_contado: null,
      diferencia: null,
    };
  }

  /**
   * Abre una nueva sesión de caja con validaciones exhaustivas de concurrencia
   * 
   * Validaciones:
   * 1. Caja existe y está activa
   * 2. No hay sesión abierta para esta caja específica
   * 3. Usuario no tiene otra sesión abierta (previene multiples cajas por usuario)
   * 4. Terminal no tiene otra sesión abierta (si se especifica terminal)
   * 5. Monto de apertura está dentro del rango configurado (o supervisor autoriza)
   * 6. Si se proporcionan denominaciones, validar que cuadren con monto_inicio
   * 
   * En caso de sesión colgada (usuario con sesión abierta pero probablemente por corte de luz):
   * - Retorna error con información de la sesión colgada
   * - Usuario puede usar endpoint de cierre administrativo para cerrar la sesión anterior
   */
  async abrirCaja(
    tenantId: string,
    cajaId: string,
    dto: AbrirCajaDto,
    userId?: string,
    ipAddress?: string,
  ) {
    // Validación 1: Caja existe y está activa
    const { data: caja, error: findError } = await this.supabase
      .getClient()
      .from('cajas')
      .select('id, estado, nombre, almacen_id')
      .eq('tenant_id', tenantId)
      .eq('id', cajaId)
      .single();

    if (findError || !caja) {
      throw new NotFoundException('Caja no encontrada');
    }

    if (caja.estado !== 'ACTIVO') {
      throw new BadRequestException(
        `La caja "${caja.nombre}" está ${caja.estado.toLowerCase()}. Debe estar activa para abrir sesión.`,
      );
    }

    if (!caja.almacen_id) {
      throw new BadRequestException(
        `La caja "${caja.nombre}" no tiene un almacén asignado. Configure el almacén antes de abrir una sesión.`,
      );
    }

    // Validación 2: No hay sesión abierta para esta caja específica
    const { data: sesionCajaAbierta } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .select('id, fecha_apertura, hora_apertura, created_at, cajero_id')
      .eq('tenant_id', tenantId)
      .eq('caja_id', cajaId)
      .eq('estado', 'ABIERTA')
      .maybeSingle();

    if (sesionCajaAbierta) {
      throw new BadRequestException(
        `La caja "${caja.nombre}" ya tiene una sesión abierta (${sesionCajaAbierta.id}). ` +
        'Debe cerrarla explícitamente; la apertura nunca auto-cierra ni inventa un arqueo.',
      );
    }
    const cajeroId = dto.cajero_id ?? userId;

    // Validación 3: Usuario no tiene otra sesión abierta en NINGUNA caja
    // Esto previene que un cajero abra múltiples cajas simultáneamente (error operativo común)
    if (cajeroId) {
      const { data: sesionUsuarioAbierta } = await this.supabase
        .getClient()
        .from('sesiones_caja')
        .select('id, caja_id, fecha_apertura, hora_apertura, created_at, cajas(nombre)')
        .eq('tenant_id', tenantId)
        .eq('cajero_id', cajeroId)
        .eq('estado', 'ABIERTA')
        .maybeSingle();

      if (sesionUsuarioAbierta) {
        const cajaAnterior = sesionUsuarioAbierta.cajas as any;
        throw new BadRequestException(
          `Ya tiene una caja abierta: "${cajaAnterior?.nombre || 'Caja desconocida'}" ` +
          `(${sesionUsuarioAbierta.id}). Ciérrela explícitamente antes de abrir otra.`,
        );
      }
    }
    // Validación 4: Terminal no tiene otra sesión abierta (si se especifica)
    if (dto.dispositivo) {
      const { data: sesionTerminalAbierta } = await this.supabase
        .getClient()
        .from('sesiones_caja')
        .select('id, caja_id, fecha_apertura, cajero_id, cajas(nombre)')
        .eq('tenant_id', tenantId)
        .eq('dispositivo', dto.dispositivo)
        .eq('estado', 'ABIERTA')
        .maybeSingle();

      if (sesionTerminalAbierta) {
        const cajaAnterior = sesionTerminalAbierta.cajas as any;
        throw new BadRequestException(
          `El terminal "${dto.dispositivo}" ya tiene una sesión abierta en la caja "${cajaAnterior?.nombre || 'Caja desconocida'}" ` +
          `desde ${new Date(sesionTerminalAbierta.fecha_apertura).toLocaleString()}. ` +
          `ID de sesión: ${sesionTerminalAbierta.id}. ` +
          `Cajero: ${sesionTerminalAbierta.cajero_id || 'No especificado'}. ` +
          `Debe cerrar esa sesión antes de usar este terminal en otra caja.`,
        );
      }
    }

    // Validación 5: Verificar si el monto requiere autorización de supervisor
    const config = await this.configuracionService.obtenerConfiguracion(
      tenantId,
      cajaId,
    );

    const validacionMonto =
      this.configuracionService.validarMontoRequiereAutorizacion(
        dto.monto_inicio,
        config,
      );

    // Variables para tracking de autorización
    let requirioAutorizacion = false;
    let supervisorIdFinal: string | null = null;
    let razonAutorizacionFinal: string | null = null;

    if (validacionMonto.requiere) {
      // Monto fuera de rango - verificar autorización
      if (!dto.supervisor_id || !dto.razon_autorizacion) {
        throw new BadRequestException({
          error: 'AUTHORIZATION_REQUIRED',
          message: validacionMonto.mensaje,
          details: {
            monto_solicitado: dto.monto_inicio,
            monto_min: config.monto_apertura_min,
            monto_max: config.monto_apertura_max,
            requiere_supervisor: true,
            tipo_validacion: validacionMonto.tipo,
          },
        });
      }

      // Validar que el supervisor existe
      const { data: supervisor, error: supError } = await this.supabase
        .getClient()
        .from('usuarios')
        .select('id, nombre, email')
        .eq('id', dto.supervisor_id)
        .eq('tenant_id', tenantId)
        .single();

      if (supError || !supervisor) {
        throw new NotFoundException(
          `Supervisor con ID ${dto.supervisor_id} no encontrado`,
        );
      }

      // Verificar que el supervisor tenga rol apropiado (SUPERVISOR o ADMIN)
      const { data: supervisorRoles } = await this.supabase
        .getClient()
        .from('user_roles')
        .select('roles(nombre)')
        .eq('usuario_sistema_id', dto.supervisor_id)
        .eq('tenant_id', tenantId);

      const roleNames = (supervisorRoles || [])
        .map((ur: any) => (ur.roles as any)?.nombre?.toUpperCase())
        .filter(Boolean);

      if (!roleNames.some((r: string) => ['ADMIN', 'SUPERVISOR'].includes(r))) {
        throw new ForbiddenException(
          'El usuario indicado no tiene rol de SUPERVISOR o ADMIN',
        );
      }

      // Marcar que se requirió autorización
      requirioAutorizacion = true;
      supervisorIdFinal = dto.supervisor_id;
      razonAutorizacionFinal = dto.razon_autorizacion;

      this.logger.warn(
        `⚠️  Apertura con monto atípico requiere autorización: ` +
        `Caja=${caja.nombre}, Monto=$${dto.monto_inicio}, ` +
        `Tipo=${validacionMonto.tipo}, Supervisor=${supervisor.nombre}`,
      );
    }

    // Validación 6: Verificar denominaciones si se proporcionaron
    if (dto.denominaciones_apertura) {
      const validacionDenom = this.reconciliationService.validarApertura(
        dto.monto_inicio,
        dto.denominaciones_apertura as Denominaciones,
        dto.moneda ?? 'PEN',
      );

      if (!validacionDenom.valido) {
        throw new BadRequestException(
          validacionDenom.mensaje ||
          `El arqueo de denominaciones (${validacionDenom.total_calculado.toFixed(2)}) ` +
          `no coincide con el monto declarado (${dto.monto_inicio.toFixed(2)}). ` +
          `Diferencia: ${Math.abs(validacionDenom.diferencia).toFixed(2)}`,
        );
      }

      this.logger.log(
        `✅ Denominaciones validadas correctamente: Total=${validacionDenom.total_calculado}`,
      );
    }

    const actorId = userId ?? cajeroId;
    if (!actorId || !cajeroId) {
      throw new ForbiddenException('La apertura requiere un cajero autenticado');
    }

    // La sesión y su autorización se confirman en una sola transacción. La
    // RPC vuelve a comprobar caja/almacén/actor y serializa caja, usuario y
    // terminal para cerrar la ventana TOCTOU de las validaciones de UX.
    const { data, error } = await this.supabase.getClient().rpc('abrir_caja_tx', {
      p_tenant_id: tenantId,
      p_caja_id: cajaId,
      p_actor_id: actorId,
      p_payload: {
        cajero_id: cajeroId,
        monto_inicio: dto.monto_inicio,
        moneda: dto.moneda ?? 'PEN',
        dispositivo: dto.dispositivo ?? null,
        requirio_autorizacion: requirioAutorizacion,
        supervisor_id: supervisorIdFinal,
        razon_autorizacion: razonAutorizacionFinal,
        tipo_autorizacion: validacionMonto.tipo === 'MONTO_BAJO'
          ? 'APERTURA_MONTO_BAJO'
          : 'APERTURA_MONTO_ALTO',
        monto_min_configurado: config.monto_apertura_min,
        monto_max_configurado: config.monto_apertura_max,
        denominaciones_apertura: dto.denominaciones_apertura ?? null,
        ip_address: ipAddress || dto.ip_address || null,
        geolocalizacion: dto.geolocalizacion ?? null,
        foto_apertura: dto.foto_apertura ?? null,
        user_agent: dto.user_agent ?? null,
      },
    });

    if (error || !data) {
      if (error?.code === '23505') {
        throw new BadRequestException(
          'Conflicto de concurrencia: ya existe una sesión abierta para la caja, cajero o terminal.',
        );
      }
      this.logger.error(`Error al abrir sesión de caja: ${error?.message}`, error);
      throw new BadRequestException(`Error al abrir caja: ${error?.message || 'respuesta vacía'}`);
    }
    const mensajeLog = requirioAutorizacion
      ? `Sesión de caja abierta con autorización de supervisor: Caja=${caja.nombre}, Cajero=${cajeroId}, Monto=$${dto.monto_inicio}, Supervisor=${supervisorIdFinal}`
      : `Sesión de caja abierta: Caja=${caja.nombre}, Cajero=${cajeroId}, Monto=$${dto.monto_inicio}`;

    this.logger.log(mensajeLog);

    return data;
  }

  /**
   * Cierre administrativo de sesión colgada
   * 
   * Permite cerrar una sesión que quedó abierta por eventos inesperados:
   * - Corte de luz
   * - Fallo de sistema
   * - Cajero se fue sin cerrar
   * 
   * Requiere:
   * - Rol de supervisor/admin
   * - Razón detallada
   * - Se registra en auditoría como cierre forzoso
   */
  async cerrarSesionAdministrativa(
    tenantId: string,
    sesionId: string,
    razonCierre: string,
    userId: string,
  ) {
    // Validar que la sesión existe y está abierta
    const { data: sesion, error: findError } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .select('*, cajas(nombre)')
      .eq('tenant_id', tenantId)
      .eq('id', sesionId)
      .eq('estado', 'ABIERTA')
      .single();

    if (findError || !sesion) {
      throw new NotFoundException(
        'Sesión de caja no encontrada o ya está cerrada',
      );
    }

    if (!razonCierre || razonCierre.trim().length < 10) {
      throw new BadRequestException(
        'Debe proporcionar una razón detallada (mínimo 10 caracteres) para el cierre administrativo',
      );
    }

    const caja = sesion.cajas as any;
    const montoEsperado = await this.resolveMontoEsperadoCierre(tenantId, sesion);
    const { data, error } = await this.supabase.getClient().rpc('cerrar_caja_tx', {
      p_tenant_id: tenantId,
      p_sesion_id: sesionId,
      p_actor_id: userId,
      p_payload: {
        monto_contado: montoEsperado,
        cierre_administrativo: true,
        razon_cierre_administrativo: razonCierre.trim(),
        notas: `Cierre administrativo: ${razonCierre.trim()}`,
        denominaciones: {},
      },
    });

    if (error) {
      this.logger.error(
        `Error en cierre administrativo: ${error.message}`,
        error,
      );
      throw new BadRequestException(
        `Error al cerrar sesión administrativamente: ${error.message}`,
      );
    }

    this.logger.warn(
      `⚠️ Cierre administrativo ejecutado: Caja="${caja?.nombre || 'Desconocida'}", ` +
      `Sesión=${sesionId}, Razón="${razonCierre}", Admin=${userId}`,
    );

    return data;
  }

  async cerrarCaja(tenantId: string, cajaId: string, sesionId: string | null, dto: CerrarCajaDto, userId?: string) {
    let query = this.supabase.getClient()
      .from('sesiones_caja')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('caja_id', cajaId)
      .eq('estado', 'ABIERTA');

    if (sesionId) {
      query = query.eq('id', sesionId);
    }

    const { data: sesion, error: findError } = await query.single();
    if (findError || !sesion) throw new NotFoundException('Sesión de caja no encontrada o ya cerrada');

    const contado = dto.monto_cierre ?? dto.monto_contado ?? sesion.monto_contado ?? 0;
    const actorId = userId ?? sesion.cajero_id ?? sesion.usuario_id;
    if (!actorId) {
      throw new ForbiddenException('El cierre requiere un usuario autenticado');
    }

    // Autorización de supervisor. `cerrar_caja_tx` es quien decide si hacía falta
    // (compara la diferencia contra la tolerancia del tenant); aquí sólo se
    // comprueba que, si viene, sea auténtica. Verificar antes de llamar a la RPC
    // evita registrar el cierre y descubrir después que la credencial era falsa.
    if (dto.supervisor_id) {
      if (dto.supervisor_id === actorId) {
        throw new ForbiddenException(
          'El supervisor que autoriza no puede ser el mismo cajero que cierra',
        );
      }
      await this.authorizationService.validarAutorizacionSupervisor(
        dto.supervisor_id,
        dto.codigo_supervisor ?? '',
        tenantId,
      );
    }

    const { data, error } = await this.supabase.getClient().rpc('cerrar_caja_tx', {
      p_tenant_id: tenantId,
      p_sesion_id: sesion.id,
      p_actor_id: actorId,
      p_payload: {
        monto_contado: contado,
        notas: dto.notas ?? sesion.notas ?? null,
        resumen: dto.resumen ?? null,
        denominaciones: {},
        cierre_administrativo: false,
        supervisor_id: dto.supervisor_id ?? null,
      },
    });
    if (error || !data) {
      throw new BadRequestException(error?.message || 'No se pudo confirmar el cierre de caja');
    }

    return data;
  }

  private async resolveMontoEsperadoCierre(tenantId: string, sesion: any): Promise<number> {
    const montoEsperado = Number(sesion.monto_esperado ?? 0);
    if (montoEsperado > 0) {
      return montoEsperado;
    }

    const { data: ultimoMovimiento, error } = await this.supabase.getClient()
      .from('movimientos_caja')
      .select('saldo_nuevo')
      .eq('tenant_id', tenantId)
      .eq('sesion_caja_id', sesion.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(`No se pudo calcular monto esperado desde movimientos de caja: ${error.message}`);
    }

    const saldoNuevo = Number(ultimoMovimiento?.saldo_nuevo ?? 0);
    if (saldoNuevo > 0) {
      return saldoNuevo;
    }

    return Number(sesion.monto_inicial ?? sesion.monto_inicio ?? 0);
  }

  async listarSesiones(tenantId: string, filters: { fecha_desde?: string; fecha_hasta?: string; estado?: string; cajero_id?: string }) {
    let query = this.supabase.getClient()
      .from('sesiones_caja')
      // Embebe el cajero y la caja para que la UI muestre "Por:" y el nombre de
      // caja sin lookups extra. Antes select('*') dejaba "Por:" siempre vacío.
      .select('*, usuario:usuarios_sistema!cajero_id(nombres, apellidos, nombre, apellido, email), caja:cajas!caja_id(nombre, codigo)')
      .eq('tenant_id', tenantId);

    if (filters.estado) {
      query = query.eq('estado', filters.estado);
    }
    if (filters.cajero_id) {
      query = query.eq('cajero_id', filters.cajero_id);
    }
    if (filters.fecha_desde) {
      query = query.gte('fecha_apertura', filters.fecha_desde);
    }
    if (filters.fecha_hasta) {
      query = query.lte('fecha_apertura', filters.fecha_hasta);
    }

    const { data, error } = await query.order('fecha_apertura', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async listarCortes(tenantId: string, filtros: { fecha_desde?: string; fecha_hasta?: string; caja_id?: string }) {
    let query = this.supabase.getClient()
      .from('cortes_caja')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filtros.caja_id) query = query.eq('caja_id', filtros.caja_id);
    if (filtros.fecha_desde) query = query.gte('fecha_corte', filtros.fecha_desde);
    if (filtros.fecha_hasta) query = query.lte('fecha_corte', filtros.fecha_hasta);

    const { data, error } = await query.order('fecha_corte', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async obtenerCorte(tenantId: string, corteId: string) {
    return this.cashReportsService.obtenerCortePersistido(tenantId, corteId);
  }

  async exportarCortePdf(tenantId: string, corteId: string) {
    const corte = await this.obtenerCorte(tenantId, corteId);
    return this.cashReportsService.generarReporteCierrePDF(corte.sesion_caja_id, tenantId);
  }

  async exportarCorteCsv(tenantId: string, corteId: string) {
    const corte = await this.obtenerCorte(tenantId, corteId);
    return this.cashReportsService.generarCorteCSV(corte.sesion_caja_id, tenantId);
  }

  async obtenerCorteZ(tenantId: string, sesionId: string) {
    if (!sesionId) {
      throw new BadRequestException('Se requiere sesionId para generar el reporte');
    }
    // Reutiliza el servicio de reportes de caja (ventas, métodos de pago, fiscal, movimientos)
    return this.cashReportsService.obtenerDatosReporteCierre(sesionId, tenantId);
  }

  async validarPrecierre(tenantId: string, sesionId: string) {
    return this.cashClosingService.validarPrecierre(sesionId, tenantId);
  }

  async obtenerSaldoEsperado(tenantId: string, sesionId: string) {
    const saldo = await this.movementsService.recalcularSaldoEsperado(sesionId, tenantId);
    return { saldo };
  }

  /**
   * Supervisores del tenant que pueden autorizar una diferencia de cierre: rol
   * SUPERVISOR o ADMIN y un PIN activo registrado. Se filtra por PIN porque un
   * supervisor sin PIN no puede autorizar nada, y ofrecerlo en el selector sólo
   * llevaría al cajero a un rechazo sin explicación.
   *
   * Nunca se devuelve `hash_pin` ni `codigo`.
   */
  async listarSupervisoresAutorizados(tenantId: string) {
    const client = this.supabase.getClient();

    const { data: pines, error: pinesError } = await client
      .from('supervisor_pins')
      .select('usuario_id')
      .eq('tenant_id', tenantId)
      .eq('activo', true);

    if (pinesError) {
      throw new BadRequestException('No se pudieron consultar los supervisores habilitados');
    }

    const conPin = [...new Set((pines || []).map((p: any) => p.usuario_id).filter(Boolean))];
    if (conPin.length === 0) {
      return [];
    }

    const { data: roles, error: rolesError } = await client
      .from('user_roles')
      .select('usuario_sistema_id, roles(nombre)')
      .eq('tenant_id', tenantId)
      .in('usuario_sistema_id', conPin);

    if (rolesError) {
      throw new BadRequestException('No se pudieron resolver los roles de supervisor');
    }

    const habilitados = [...new Set(
      (roles || [])
        .filter((fila: any) => {
          const nombre = String((fila.roles as any)?.nombre ?? '').toUpperCase();
          return nombre === 'SUPERVISOR' || nombre === 'ADMIN';
        })
        .map((fila: any) => fila.usuario_sistema_id),
    )];

    if (habilitados.length === 0) {
      return [];
    }

    const { data: usuarios, error: usuariosError } = await client
      .from('usuarios_sistema')
      .select('id, nombre, apellido')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .in('id', habilitados);

    if (usuariosError) {
      throw new BadRequestException('No se pudieron obtener los datos de los supervisores');
    }

    return (usuarios || [])
      .map((u: any) => ({
        id: u.id,
        nombre: [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || 'Supervisor',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async cerrarCajaAvanzado(
    tenantId: string,
    sesionId: string,
    datos: DatosCierre,
    userId: string,
    supervisorId?: string,
    codigoAutorizacion?: string,
  ) {
    return this.cashClosingService.cerrarCaja(
      sesionId,
      datos,
      userId,
      tenantId,
      supervisorId,
      codigoAutorizacion,
    );
  }

  async solicitarRetiro(
    tenantId: string,
    sesionId: string,
    dto: SolicitarRetiroCajaDto,
    userId: string,
    idempotencyKey: string,
  ) {
    return this.withdrawalsService.solicitarRetiro(
      tenantId,
      sesionId,
      dto,
      userId,
      idempotencyKey,
    );
  }

  async conciliarRetiro(
    tenantId: string,
    retiroId: string,
    data: ConciliarRetiroCajaDto,
    userId: string,
    idempotencyKey: string,
  ) {
    return this.withdrawalsService.conciliarRetiro(
      tenantId,
      retiroId,
      data,
      userId,
      idempotencyKey,
    );
  }

  async iniciarCambioTurno(
    tenantId: string,
    sesionId: string,
    usuarioSalienteId: string,
    usuarioEntranteId: string,
    idempotencyKey: string,
  ) {
    return this.shiftChangesService.iniciarCambioTurno(
      tenantId,
      sesionId,
      usuarioSalienteId,
      usuarioEntranteId,
      idempotencyKey,
    );
  }

  async completarCambioTurno(
    tenantId: string,
    cambioId: string,
    dto: CompletarCambioTurnoCajaDto,
    userId: string,
    idempotencyKey: string,
  ) {
    return this.shiftChangesService.completarCambioTurno(
      tenantId,
      cambioId,
      dto,
      userId,
      idempotencyKey,
    );
  }

  async cancelarCambioTurno(
    tenantId: string,
    cambioId: string,
    razon: string,
    userId: string,
    idempotencyKey: string,
  ) {
    return this.shiftChangesService.cancelarCambioTurno(
      tenantId,
      cambioId,
      razon,
      userId,
      idempotencyKey,
    );
  }

  async obtenerCambiosTurnoSesion(tenantId: string, sesionId: string) {
    return this.shiftChangesService.obtenerCambiosSesion(sesionId, tenantId);
  }

  async registrarMovimientoManual(
    tenantId: string,
    sesionId: string,
    dto: MovimientoManualCajaDto,
    userId: string,
    idempotencyKey: string,
  ) {
    const { data, error } = await this.supabase.getClient().rpc(
      'registrar_movimiento_manual_caja_tx',
      {
        p_tenant_id: tenantId,
        p_session_id: sesionId,
        p_payload: dto,
        p_actor_id: userId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) {
      throw new BadRequestException(error.message || 'No se pudo registrar el movimiento manual');
    }
    return (data as any)?.movimiento ?? data;
  }

  /**
   * Q15: Reanudar sesión existente
   * 
   * Permite a un cajero retomar una sesión que quedó abierta
   * (ej: después de un corte de luz o cierre accidental del navegador)
   * 
   * Validaciones:
   * - La sesión debe existir y estar ABIERTA
   * - El cajero debe ser el mismo que abrió la sesión (o supervisor)
   * - La sesión no debe estar congelada (cambio de turno en proceso)
   */
  async reanudarSesion(
    tenantId: string,
    sesionId: string,
    userId: string,
  ) {
    // Obtener sesión con detalles
    const { data: sesion, error: findError } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .select('*, cajas(nombre, codigo, ubicacion)')
      .eq('tenant_id', tenantId)
      .eq('id', sesionId)
      .single();

    if (findError || !sesion) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (sesion.estado !== 'ABIERTA') {
      throw new BadRequestException(
        `La sesión ya está ${sesion.estado.toLowerCase()}. No se puede reanudar.`,
      );
    }

    if (sesion.congelada) {
      throw new BadRequestException(
        'La sesión está congelada (cambio de turno en proceso). ' +
        'Complete o cancele el cambio de turno antes de reanudar.',
      );
    }

    // Verificar que el usuario es el cajero original
    if (sesion.cajero_id && sesion.cajero_id !== userId) {
      this.logger.warn(
        `Usuario ${userId} intentando reanudar sesión de otro cajero ${sesion.cajero_id}`,
      );
      throw new BadRequestException(
        'Solo el cajero que abrió la sesión puede reanudarla.',
      );
    }

    // Obtener último movimiento para contexto
    const { data: ultimoMovimiento } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .select('*')
      .eq('sesion_caja_id', sesionId)
      .order('secuencia', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calcular saldo actual
    const saldoActual = ultimoMovimiento?.saldo_nuevo ?? sesion.monto_inicio;

    // Calcular tiempo transcurrido
    const horaApertura = new Date(sesion.fecha_apertura);
    const tiempoTranscurrido = Math.round(
      (Date.now() - horaApertura.getTime()) / (1000 * 60),
    ); // minutos

    const caja = sesion.cajas as any;

    this.logger.log(
      `✅ Sesión reanudada: Caja="${caja?.nombre}", Sesión=${sesionId}, ` +
      `Usuario=${userId}, Tiempo=${tiempoTranscurrido}min`,
    );

    return {
      sesion: {
        id: sesion.id,
        caja_id: sesion.caja_id,
        caja_nombre: caja?.nombre,
        caja_codigo: caja?.codigo,
        caja_ubicacion: caja?.ubicacion,
        fecha_apertura: sesion.fecha_apertura,
        monto_inicio: sesion.monto_inicio,
        moneda: sesion.moneda,
        dispositivo: sesion.dispositivo,
        cajero_id: sesion.cajero_id,
      },
      contexto: {
        saldo_actual: saldoActual,
        tiempo_transcurrido_minutos: tiempoTranscurrido,
        ultimo_movimiento: ultimoMovimiento ? {
          tipo: ultimoMovimiento.tipo_movimiento,
          monto: ultimoMovimiento.monto,
          timestamp: ultimoMovimiento.timestamp,
        } : null,
        total_movimientos: ultimoMovimiento?.secuencia ?? 0,
      },
      mensaje: `Sesión reanudada exitosamente. Saldo actual: ${sesion.moneda} ${saldoActual.toFixed(2)}`,
    };
  }

  /**
   * Q15: Obtener métricas de turnos por cajero
   * 
   * Retorna KPIs de efectividad para un cajero específico
   */
  async obtenerMetricasCajero(
    tenantId: string,
    cajeroId: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ) {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('obtener_metricas_cajero', {
        p_tenant_id: tenantId,
        p_cajero_id: cajeroId,
        p_fecha_desde: fechaDesde || null,
        p_fecha_hasta: fechaHasta || null,
      });

    if (error) {
      this.logger.error(`Error obteniendo métricas de cajero: ${error.message}`);
      throw new BadRequestException('Error obteniendo métricas');
    }

    return data?.[0] || {
      total_turnos: 0,
      duracion_promedio_horas: 0,
      total_ventas: 0,
      promedio_ventas_turno: 0,
      total_diferencias: 0,
      turnos_cuadrados: 0,
      turnos_sobrante: 0,
      turnos_faltante: 0,
      porcentaje_efectividad: 0,
      transacciones_totales: 0,
      transacciones_por_hora: 0,
    };
  }

  /**
   * Q15: Obtener ranking de cajeros por efectividad
   */
  async obtenerRankingCajeros(tenantId: string, limite: number = 10) {
    const { data, error } = await this.supabase
      .getClient()
      .from('vw_ranking_cajeros')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(limite);

    if (error) {
      this.logger.error(`Error obteniendo ranking: ${error.message}`);
      throw new BadRequestException('Error obteniendo ranking de cajeros');
    }

    return data || [];
  }

  /**
   * Q15: Obtener sesiones activas para monitoreo
   */
  async obtenerSesionesActivas(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('vw_sesiones_activas')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      this.logger.error(`Error obteniendo sesiones activas: ${error.message}`);
      throw new BadRequestException('Error obteniendo sesiones activas');
    }

    return data || [];
  }
}
