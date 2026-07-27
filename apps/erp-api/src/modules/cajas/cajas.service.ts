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
import { CashWithdrawalsService, MotivoRetiro, RetiroMetadata } from './services/cash-withdrawals.service';
import { CashShiftChangesService, FirmasDigitales } from './services/cash-shift-changes.service';
import { TipoMovimiento } from './services/cash-movements.service';

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

  async crearCaja(tenantId: string, dto: CreateCajaDto, userId?: string) {
    const nueva = {
      tenant_id: tenantId,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      sucursal_id: dto.sucursal_id ?? null,
      almacen_id: dto.almacen_id,
      dispositivo: dto.dispositivo ?? null,
      tipo: dto.tipo ?? 'TIENDA',
      estado: 'ACTIVO',
      creado_por: userId ?? null,
    };
    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .insert([nueva])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async actualizarCaja(tenantId: string, id: string, dto: UpdateCajaDto) {
    const { data: existing, error: findError } = await this.supabase.getClient()
      .from('cajas')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();
    if (findError || !existing) {
      throw new NotFoundException('Caja no encontrada');
    }

    const updateData = {
      nombre: dto.nombre ?? undefined,
      descripcion: dto.descripcion ?? undefined,
      sucursal_id: dto.sucursal_id ?? undefined,
      almacen_id: dto.almacen_id ?? undefined,
      dispositivo: dto.dispositivo ?? undefined,
      tipo: dto.tipo ?? undefined,
      estado: dto.estado ?? undefined,
      // No tocar updated_at si la columna no existe en esta tabla
    };

    const { data, error } = await this.supabase.getClient()
      .from('cajas')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Saldo teorico de una sesion: lo que deberia haber en la gaveta segun el monto
   * de apertura y los movimientos registrados. Misma formula que usa el cierre con
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
   * Campos de cierre para una sesion que se cierra sin contar el efectivo.
   * Antes se guardaba esperado 0 / contado 0 / diferencia 0, afirmando que la caja
   * estaba vacia y cuadrada y borrando el rastro del efectivo. Ahora se registra el
   * saldo teorico; el trigger app.normalize_sesiones_caja_row fuerza contado a 0 y
   * deriva la diferencia, de modo que la sesion queda marcada como descuadrada y
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
      razon_cierre_administrativo: 'Cierre automatico: sesion antigua detectada al abrir nueva caja',
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
      // Si la sesión abierta es de días anteriores, cerrarla automáticamente (cierre administrativo) y continuar
      const aperturaIso = sesionCajaAbierta.hora_apertura || sesionCajaAbierta.fecha_apertura || sesionCajaAbierta.created_at;
      const apertura = aperturaIso ? new Date(aperturaIso) : null;
      const hoy = new Date();
      const esMismoDia =
        !!apertura &&
        apertura.getFullYear() === hoy.getFullYear() &&
        apertura.getMonth() === hoy.getMonth() &&
        apertura.getDate() === hoy.getDate();

      if (!esMismoDia) {
        const ahoraIso = new Date().toISOString();
        try {
          await this.supabase.getClient()
            .from('sesiones_caja')
            .update(
              await this.construirCierreAdministrativo(
                tenantId,
                sesionCajaAbierta.id,
                ahoraIso,
                userId ?? sesionCajaAbierta.cajero_id ?? null,
              ),
            )
            .eq('tenant_id', tenantId)
            .eq('id', sesionCajaAbierta.id);
          this.logger.warn(
            `⚠️ Sesión antigua auto-cerrada para abrir nueva: Caja=${caja.nombre}, Sesión=${sesionCajaAbierta.id}, Apertura=${aperturaIso}`,
          );
        } catch (cerrarError) {
          this.logger.error(
            `❌ No se pudo cerrar la sesión antigua ${sesionCajaAbierta.id}: ${cerrarError.message}`,
          );
          throw new BadRequestException(
            `No se pudo cerrar la sesión anterior (${sesionCajaAbierta.id}). Intente cierre administrativo manual.`,
          );
        }
      } else {
        throw new BadRequestException(
          `La caja "${caja.nombre}" ya tiene una sesión abierta desde ${new Date(sesionCajaAbierta.fecha_apertura).toLocaleString()}. ` +
          `ID de sesión: ${sesionCajaAbierta.id}. Debe cerrarla antes de abrir una nueva.`,
        );
      }
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
        const aperturaIso =
          (sesionUsuarioAbierta as any).hora_apertura ||
          (sesionUsuarioAbierta as any).fecha_apertura ||
          (sesionUsuarioAbierta as any).created_at;
        const apertura = aperturaIso ? new Date(aperturaIso) : null;
        const hoy = new Date();
        const esMismoDia =
          !!apertura &&
          apertura.getFullYear() === hoy.getFullYear() &&
          apertura.getMonth() === hoy.getMonth() &&
          apertura.getDate() === hoy.getDate();

        if (!esMismoDia) {
          // Cerrar automáticamente la sesión colgada del usuario y continuar
          const ahoraIso = new Date().toISOString();
          try {
            await this.supabase.getClient()
              .from('sesiones_caja')
              .update(
                await this.construirCierreAdministrativo(
                  tenantId,
                  sesionUsuarioAbierta.id,
                  ahoraIso,
                  userId ?? cajeroId ?? null,
                ),
              )
              .eq('tenant_id', tenantId)
              .eq('id', sesionUsuarioAbierta.id);
            this.logger.warn(
              `⚠️ Sesión antigua auto-cerrada para usuario ${cajeroId}: Sesión=${sesionUsuarioAbierta.id}, Apertura=${aperturaIso}`,
            );
          } catch (cerrarError) {
            this.logger.error(
              `❌ No se pudo cerrar la sesión antigua del usuario ${cajeroId} (${sesionUsuarioAbierta.id}): ${cerrarError.message}`,
            );
            throw new BadRequestException(
              `No se pudo cerrar la sesión anterior del usuario (${sesionUsuarioAbierta.id}). Intente cierre administrativo manual.`,
            );
          }
        } else {
          const cajaAnterior = sesionUsuarioAbierta.cajas as any;
          throw new BadRequestException(
            `Ya tiene una caja abierta: "${cajaAnterior?.nombre || 'Caja desconocida'}" desde ${new Date(sesionUsuarioAbierta.fecha_apertura).toLocaleString()}. ` +
            `ID de sesión: ${sesionUsuarioAbierta.id}. ` +
            `Debe cerrarla antes de abrir otra. ` +
            `Si la sesión quedó colgada (ej: corte de luz), use el endpoint de cierre administrativo.`,
          );
        }
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

    // ✅ Todas las validaciones pasaron - Crear nueva sesión
    const nuevaSesion: any = {
      caja_id: cajaId,
      tenant_id: tenantId,
      cajero_id: cajeroId ?? null,
      abierto_por: userId ?? cajeroId ?? null,
      monto_inicio: dto.monto_inicio,
      moneda: dto.moneda ?? 'PEN',
      dispositivo: dto.dispositivo ?? null,
      estado: 'ABIERTA',
      // Campos de autorización
      requirio_autorizacion: requirioAutorizacion,
      autorizacion_supervisor_id: supervisorIdFinal,
      razon_autorizacion: razonAutorizacionFinal,
      // Campos de denominaciones (si se proporcionaron)
      denominaciones_apertura: dto.denominaciones_apertura || null,
      // Q13: Campos de trazabilidad forense
      ip_address: dto.ip_address || null,
      geolocalizacion: dto.geolocalizacion || null,
      foto_apertura: dto.foto_apertura || null,
      user_agent: dto.user_agent || null,
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .insert([nuevaSesion])
      .select()
      .single();

    if (error) {
      // TOCTOU guard: unique partial index prevents duplicate ABIERTA sessions
      if (error.code === '23505') {
        throw new BadRequestException(
          'Conflicto de concurrencia: otra sesión fue abierta simultáneamente para esta caja o cajero. Intente de nuevo.',
        );
      }
      this.logger.error(`Error al abrir sesión de caja: ${error.message}`, error);
      throw new BadRequestException(`Error al abrir caja: ${error.message}`);
    }

    // Si hubo autorización, registrarla en la tabla de autorizaciones
    if (requirioAutorizacion && supervisorIdFinal && razonAutorizacionFinal) {
      try {
        await this.autorizacionesService.registrarAutorizacion(tenantId, {
          sesion_caja_id: data.id,
          tipo_autorizacion:
            validacionMonto.tipo === 'MONTO_BAJO'
              ? 'APERTURA_MONTO_BAJO'
              : 'APERTURA_MONTO_ALTO',
          monto_solicitado: dto.monto_inicio,
          monto_min_configurado: config.monto_apertura_min,
          monto_max_configurado: config.monto_apertura_max,
          supervisor_id: supervisorIdFinal,
          solicitante_id: cajeroId || userId || supervisorIdFinal,
          razon_autorizacion: razonAutorizacionFinal,
          ip_address: ipAddress || null,
          dispositivo: dto.dispositivo || null,
        });

        this.logger.log(
          `✅ Autorización registrada para sesión ${data.id}`,
        );
      } catch (authError) {
        this.logger.error(
          `Error al registrar autorización: ${authError.message}`,
          authError,
        );
        // No lanzamos error - la sesión ya está creada
        // Solo logueamos el problema para investigar
      }
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

    // Calcular duración de la sesión
    const horaApertura = new Date(sesion.fecha_apertura);
    const horaCierre = new Date();
    const duracionHoras = Math.round(
      (horaCierre.getTime() - horaApertura.getTime()) / (1000 * 60 * 60),
    );

    const caja = sesion.cajas as any;

    // Preparar datos de cierre administrativo
    const cierre = {
      estado: 'CERRADA',
      fecha_cierre: horaCierre.toISOString(),
      cerrado_por: userId,
      cierre_administrativo: true,
      razon_cierre_administrativo: razonCierre,
      duracion_horas: duracionHoras,
    };

    // Cerrar sesión con marcador de cierre administrativo
    const { data, error } = await this.supabase
      .getClient()
      .from('sesiones_caja')
      .update(cierre)
      .eq('id', sesionId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

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

    const esperado = await this.resolveMontoEsperadoCierre(tenantId, sesion);
    const contado = dto.monto_cierre ?? dto.monto_contado ?? sesion.monto_contado ?? 0;
    const cierre: any = {
      estado: 'CERRADA',
      fecha_cierre: new Date().toISOString(),
      monto_esperado: esperado,
      monto_contado: contado,
      diferencia: contado - esperado,
      usuario_cierre: userId ?? sesion.usuario_id ?? null,
      notas: dto.notas ?? sesion.notas ?? null,
    };
    // Campo "resumen" no existe en todos los entornos; evitar error de schema cache si no está presente
    if (dto.resumen) {
      cierre.resumen = dto.resumen;
    }

    const { data, error } = await this.supabase.getClient()
      .from('sesiones_caja')
      .update(cierre)
      .eq('id', sesion.id)
      .eq('tenant_id', tenantId)
      .eq('estado', 'ABIERTA')
      .select()
      .single();
    if (error) throw error;

    // Registrar corte y asiento contable de cierre (no bloquea el cierre si falla)
    let advertenciaCierre: string | null = null;
    try {
      await this.cashReportsService.registrarCorte(tenantId, data.id);
      await this.cashReportsService.registrarAsientoCierre(tenantId, data.id);
    } catch (registrarError) {
      advertenciaCierre = `Corte/asiento de cierre no registrado: ${registrarError?.message}`;
      this.logger.error(
        `CIERRE_CORTE_FALLIDO sesion=${data.id} tenant=${tenantId}: ${registrarError?.message}. Requiere registro manual.`,
      );
    }

    return { ...data, ...(advertenciaCierre ? { advertencia: advertenciaCierre } : {}) };
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
    monto: number,
    motivo: MotivoRetiro,
    userId: string,
    metadata: RetiroMetadata,
    supervisorId?: string,
    codigoAutorizacion?: string,
  ) {
    return this.withdrawalsService.solicitarRetiro(
      sesionId,
      monto,
      motivo,
      userId,
      tenantId,
      metadata,
      supervisorId,
      codigoAutorizacion,
    );
  }

  async conciliarRetiro(
    tenantId: string,
    retiroId: string,
    data: {
      banco_destino: string;
      numero_operacion: string;
      fecha_conciliacion: string;
      comprobante_url?: string;
    },
    userId: string,
  ) {
    return this.withdrawalsService.conciliarRetiro(retiroId, data, userId, tenantId);
  }

  async iniciarCambioTurno(
    tenantId: string,
    sesionId: string,
    usuarioSalienteId: string,
    usuarioEntranteId: string,
  ) {
    return this.shiftChangesService.iniciarCambioTurno(
      sesionId,
      usuarioSalienteId,
      usuarioEntranteId,
      tenantId,
    );
  }

  async completarCambioTurno(
    tenantId: string,
    cambioId: string,
    saldoContado: number,
    denominaciones: any,
    fotoArqueo: string,
    firmas: FirmasDigitales,
  ) {
    return this.shiftChangesService.completarCambioTurno(
      cambioId,
      saldoContado,
      denominaciones,
      fotoArqueo,
      firmas,
      tenantId,
    );
  }

  async cancelarCambioTurno(
    tenantId: string,
    cambioId: string,
    razon: string,
    userId: string,
  ) {
    return this.shiftChangesService.cancelarCambioTurno(
      cambioId,
      razon,
      userId,
      tenantId,
    );
  }

  async obtenerCambiosTurnoSesion(tenantId: string, sesionId: string) {
    return this.shiftChangesService.obtenerCambiosSesion(sesionId, tenantId);
  }

  async registrarMovimientoManual(
    tenantId: string,
    sesionId: string,
    tipo: 'INGRESO' | 'GASTO',
    monto: number,
    motivo: string,
    userId: string,
    idempotencyKey?: string,
  ) {
    if (!monto || monto <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    if (!motivo || !motivo.trim()) {
      throw new BadRequestException('Motivo requerido');
    }

    const movimientoTipo = tipo === 'INGRESO' ? TipoMovimiento.INGRESO : TipoMovimiento.AJUSTE;
    const montoAplicado = tipo === 'INGRESO' ? monto : -monto;
    const referenciaDocumento = idempotencyKey?.trim() || tipo;

    if (idempotencyKey?.trim()) {
      const { data: existente, error } = await this.supabase
        .getClient()
        .from('movimientos_caja')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('sesion_caja_id', sesionId)
        .eq('referencia_tipo', 'MANUAL')
        .eq('referencia_documento', referenciaDocumento)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(`Error verificando movimiento de caja existente: ${error.message}`);
      }

      if (existente) {
        return existente;
      }
    }

    return this.movementsService.registrarMovimiento(
      sesionId,
      movimientoTipo,
      montoAplicado,
      {
        usuario_id: userId,
        motivo: `${tipo}: ${motivo}`,
        referencia_tipo: 'MANUAL',
        referencia_documento: referenciaDocumento,
        idempotency_key: idempotencyKey?.trim() || undefined,
      },
      tenantId,
    );
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
