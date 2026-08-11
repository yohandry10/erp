import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import * as crypto from 'crypto';

export enum CashAuditEvent {
    CONSULTA_SALDO = 'CONSULTA_SALDO',
    INTENTO_CIERRE_FALLIDO = 'INTENTO_CIERRE_FALLIDO',
    APERTURA_FORZOSA = 'APERTURA_FORZOSA',
    MODIFICACION_CONFIGURACION = 'MODIFICACION_CONFIGURACION',
    ACCESO_REPORTES = 'ACCESO_REPORTES',
    RETIRO_AUTORIZADO = 'RETIRO_AUTORIZADO',
    RETIRO_RECHAZADO = 'RETIRO_RECHAZADO',
    CAMBIO_TURNO_INICIADO = 'CAMBIO_TURNO_INICIADO',
    CAMBIO_TURNO_COMPLETADO = 'CAMBIO_TURNO_COMPLETADO',
    DIFERENCIA_DETECTADA = 'DIFERENCIA_DETECTADA',
    ANOMALIA_DETECTADA = 'ANOMALIA_DETECTADA',
}

export interface AuditFilters {
    sesion_caja_id?: string;
    usuario_id?: string;
    evento?: CashAuditEvent | CashAuditEvent[];
    fecha_desde?: string;
    fecha_hasta?: string;
    limite?: number;
}

export interface AuditEvent {
    id: string;
    evento: CashAuditEvent;
    sesion_caja_id?: string;
    usuario_id?: string;
    ip_address?: string;
    user_agent?: string;
    parametros?: Record<string, any>;
    resultado?: string;
    timestamp: string;
    tenant_id: string;
}

/**
 * Servicio para auditoría dedicada de operaciones de caja
 * 
 * Responsabilidades:
 * - Registrar eventos específicos de caja con retención extendida
 * - Capturar metadata completa (IP, user agent, parámetros)
 * - Consultar historial de eventos con filtros avanzados
 * - Garantizar inmutabilidad de registros (append-only)
 * - Retención de 7 años para cumplimiento fiscal
 */
@Injectable()
export class CashAuditService {
    private readonly logger = new Logger(CashAuditService.name);

    // Retención de datos: 7 años (2555 días)
    private readonly RETENCION_DIAS = 2555;

    constructor(private readonly supabase: SupabaseService) { }

    /**
     * Registra un evento de auditoría de caja
     */
    async registrarEvento(
        evento: CashAuditEvent,
        tenantId: string,
        userId?: string,
        sesionCajaId?: string,
        metadata: Record<string, any> = {},
    ): Promise<void> {
        this.logger.log(`Registrando evento de auditoría: ${evento}`);
        if (!userId) {
            this.logger.warn(`Auditoría ${evento} omitida: no existe actor autenticado`);
            return;
        }
        const canonical = JSON.stringify({
            evento,
            tenantId,
            userId,
            sesionCajaId: sesionCajaId || null,
            parametros: metadata.parametros || {},
            resultado: metadata.resultado || null,
        });
        const idempotencyKey = `cash-audit-474:${crypto
            .createHash('sha256')
            .update(canonical)
            .digest('hex')}`;
        const { error } = await this.supabase.getClient().rpc(
            'registrar_auditoria_caja_tx',
            {
                p_tenant_id: tenantId,
                p_event: evento,
                p_actor_id: userId,
                p_session_id: sesionCajaId || null,
                p_metadata: {
                    parametros: metadata.parametros || {},
                    resultado: metadata.resultado || null,
                    riesgo: metadata.riesgo || 'BAJO',
                },
                p_idempotency_key: idempotencyKey,
            },
        );

        if (error) {
            this.logger.error(`Error registrando evento de auditoría: ${error.message}`, error);
            // No lanzamos excepción para no afectar el flujo principal
        }
    }

    /**
     * Consulta eventos de auditoría con filtros
     */
    async consultarEventos(filtros: AuditFilters, tenantId: string): Promise<AuditEvent[]> {
        let query = this.supabase
            .getClient()
            .from('caja_audit_log')
            .select('*')
            .eq('tenant_id', tenantId);

        if (filtros.sesion_caja_id) {
            query = query.eq('sesion_caja_id', filtros.sesion_caja_id);
        }

        if (filtros.usuario_id) {
            query = query.eq('usuario_id', filtros.usuario_id);
        }

        if (filtros.evento) {
            if (Array.isArray(filtros.evento)) {
                query = query.in('evento', filtros.evento);
            } else {
                query = query.eq('evento', filtros.evento);
            }
        }

        if (filtros.fecha_desde) {
            query = query.gte('timestamp', filtros.fecha_desde);
        }

        if (filtros.fecha_hasta) {
            query = query.lte('timestamp', filtros.fecha_hasta);
        }

        query = query.order('timestamp', { ascending: false });

        if (filtros.limite) {
            query = query.limit(filtros.limite);
        }

        const { data, error } = await query;

        if (error) {
            throw new BadRequestException(`Error consultando eventos: ${error.message}`);
        }

        return (data || []) as AuditEvent[];
    }

    /**
     * Obtiene todos los eventos de una sesión específica
     */
    async obtenerEventosSesion(sesionId: string, tenantId: string): Promise<AuditEvent[]> {
        return this.consultarEventos({ sesion_caja_id: sesionId }, tenantId);
    }

    /**
     * Obtiene el historial de eventos de un usuario
     */
    async obtenerHistorialUsuario(
        userId: string,
        tenantId: string,
        limite: number = 100,
    ): Promise<AuditEvent[]> {
        return this.consultarEventos({ usuario_id: userId, limite }, tenantId);
    }

    /**
     * Cuenta eventos por tipo en un rango de fechas
     */
    async contarEventosPorTipo(
        fechaDesde: string,
        fechaHasta: string,
        tenantId: string,
    ): Promise<Record<string, number>> {
        const { data, error } = await this.supabase
            .getClient()
            .from('caja_audit_log')
            .select('evento')
            .eq('tenant_id', tenantId)
            .gte('timestamp', fechaDesde)
            .lte('timestamp', fechaHasta);

        if (error) {
            throw new BadRequestException('Error contando eventos');
        }

        // Contar por tipo
        const conteo: Record<string, number> = {};
        (data || []).forEach((registro) => {
            conteo[registro.evento] = (conteo[registro.evento] || 0) + 1;
        });

        return conteo;
    }

    /**
     * Detecta intentos de acceso sospechosos
     * (múltiples intentos fallidos, accesos fuera de horario, etc.)
     */
    async detectarAccesosSospechosos(
        tenantId: string,
        ventanaMinutos: number = 60,
    ): Promise<any[]> {
        const fechaLimite = new Date();
        fechaLimite.setMinutes(fechaLimite.getMinutes() - ventanaMinutos);

        // Buscar múltiples intentos fallidos
        const { data, error } = await this.supabase
            .getClient()
            .from('caja_audit_log')
            .select('usuario_id, evento, ip_address, timestamp')
            .eq('tenant_id', tenantId)
            .in('evento', ['INTENTO_CIERRE_FALLIDO', 'RETIRO_RECHAZADO'])
            .gte('timestamp', fechaLimite.toISOString());

        if (error) {
            throw new BadRequestException('Error detectando accesos sospechosos');
        }

        // Agrupar por usuario y contar
        const intentosPorUsuario: Record<string, any> = {};
        (data || []).forEach((registro) => {
            const userId = registro.usuario_id || 'DESCONOCIDO';
            if (!intentosPorUsuario[userId]) {
                intentosPorUsuario[userId] = {
                    usuario_id: userId,
                    intentos: 0,
                    eventos: [],
                };
            }
            intentosPorUsuario[userId].intentos++;
            intentosPorUsuario[userId].eventos.push(registro);
        });

        // Filtrar usuarios con más de 3 intentos
        const sospechosos = Object.values(intentosPorUsuario).filter(
            (usuario: any) => usuario.intentos > 3,
        );

        if (sospechosos.length > 0) {
            this.logger.warn(`Accesos sospechosos detectados: ${sospechosos.length} usuarios`);
        }

        return sospechosos;
    }

    /**
     * Registra consulta de saldo (para detectar consultas excesivas)
     */
    async registrarConsultaSaldo(
        sesionId: string,
        userId: string,
        tenantId: string,
        ipAddress?: string,
    ): Promise<void> {
        await this.registrarEvento(
            CashAuditEvent.CONSULTA_SALDO,
            tenantId,
            userId,
            sesionId,
            { ip: ipAddress, resultado: 'EXITOSO' },
        );
    }

    /**
     * Registra intento de cierre fallido
     */
    async registrarCierreFallido(
        sesionId: string,
        userId: string,
        razon: string,
        tenantId: string,
    ): Promise<void> {
        await this.registrarEvento(
            CashAuditEvent.INTENTO_CIERRE_FALLIDO,
            tenantId,
            userId,
            sesionId,
            { parametros: { razon }, resultado: 'FALLIDO' },
        );
    }

    /**
     * Registra modificación de configuración
     */
    async registrarModificacionConfig(
        userId: string,
        cambios: Record<string, any>,
        tenantId: string,
    ): Promise<void> {
        await this.registrarEvento(
            CashAuditEvent.MODIFICACION_CONFIGURACION,
            tenantId,
            userId,
            undefined,
            { parametros: { cambios }, resultado: 'COMPLETADO' },
        );
    }

    /**
     * Registra acceso a reportes de caja
     */
    async registrarAccesoReporte(
        userId: string,
        tipoReporte: string,
        tenantId: string,
    ): Promise<void> {
        await this.registrarEvento(
            CashAuditEvent.ACCESO_REPORTES,
            tenantId,
            userId,
            undefined,
            { parametros: { tipo_reporte: tipoReporte }, resultado: 'EXITOSO' },
        );
    }

    /**
     * Limpia eventos antiguos según política de retención
     * Debe ejecutarse periódicamente (cron job)
     */
    async limpiarEventosAntiguos(tenantId: string): Promise<number> {
        this.logger.warn(
            `Retención read-only para ${tenantId}: no se borran eventos desde runtime (${this.RETENCION_DIAS} días configurados)`,
        );
        return 0;
    }

    /**
     * Genera reporte de actividad de auditoría
     */
    async generarReporteActividad(
        fechaDesde: string,
        fechaHasta: string,
        tenantId: string,
    ): Promise<any> {
        const eventos = await this.consultarEventos({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta }, tenantId);
        const conteoTipos = await this.contarEventosPorTipo(fechaDesde, fechaHasta, tenantId);

        return {
            total_eventos: eventos.length,
            conteo_por_tipo: conteoTipos,
            eventos_criticos: eventos.filter((e) =>
                [
                    CashAuditEvent.APERTURA_FORZOSA,
                    CashAuditEvent.ANOMALIA_DETECTADA,
                    CashAuditEvent.DIFERENCIA_DETECTADA,
                ].includes(e.evento as CashAuditEvent),
            ),
            usuarios_mas_activos: this.obtenerUsuariosMasActivos(eventos),
        };
    }

    private obtenerUsuariosMasActivos(eventos: AuditEvent[]): any[] {
        const conteo: Record<string, number> = {};
        eventos.forEach((e) => {
            if (e.usuario_id) {
                conteo[e.usuario_id] = (conteo[e.usuario_id] || 0) + 1;
            }
        });

        return Object.entries(conteo)
            .map(([usuario_id, cantidad]) => ({ usuario_id, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 10);
    }
}
