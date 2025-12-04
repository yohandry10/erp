import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CashMovementsService, TipoMovimiento } from './cash-movements.service';
import { CashReconciliationService, Denominaciones } from './cash-reconciliation.service';
import { CashAuditService, CashAuditEvent } from './cash-audit.service';

export enum EstadoCambioTurno {
    EN_PROCESO = 'EN_PROCESO',
    COMPLETADO = 'COMPLETADO',
    CANCELADO = 'CANCELADO',
}

export interface FirmasDigitales {
    saliente: string;
    entrante: string;
}

export interface CambioTurno {
    id: string;
    sesion_caja_id: string;
    usuario_saliente_id: string;
    usuario_entrante_id: string;
    saldo_sistema: number;
    saldo_contado: number;
    diferencia: number;
    denominaciones?: Denominaciones;
    foto_arqueo?: string;
    firma_digital_saliente?: string;
    firma_digital_entrante?: string;
    timestamp_inicio: string;
    timestamp_fin?: string;
    estado: EstadoCambioTurno;
    tenant_id: string;
    created_at: string;
}

/**
 * Servicio para gestionar cambios de turno de cajeros con arqueo obligatorio
 *
 * Responsabilidades:
 * - Congelar transacciones durante el cambio de turno
 * - Calcular saldo actual del sistema
 * - Requerir arqueo físico por denominaciones
 * - Capturar firmas digitales de ambos usuarios
 * - Registrar foto del dinero contado
 * - Validar diferencias y aplicar tolerancia
 * - Descongelar caja al completar el cambio
 * - Auditar todo el proceso de cambio
 */
@Injectable()
export class CashShiftChangesService {
    private readonly logger = new Logger(CashShiftChangesService.name);

    constructor(
        private readonly supabase: SupabaseService,
        private readonly movementsService: CashMovementsService,
        private readonly reconciliationService: CashReconciliationService,
        private readonly auditService: CashAuditService,
    ) {}

    /**
     * Inicia un cambio de turno
     * - Valida que la sesión esté abierta y no congelada
     * - Congela nuevas transacciones
     * - Calcula saldo actual del sistema
     * - Crea registro de cambio de turno
     */
    async iniciarCambioTurno(
        sesionId: string,
        usuarioSalienteId: string,
        usuarioEntranteId: string,
        tenantId: string,
    ): Promise<CambioTurno> {
        this.logger.log(
            `Iniciando cambio de turno: sesión=${sesionId}, saliente=${usuarioSalienteId}, entrante=${usuarioEntranteId}`,
        );

        // Validación 1: Usuarios diferentes
        if (usuarioSalienteId === usuarioEntranteId) {
            throw new BadRequestException('El usuario saliente y entrante deben ser diferentes');
        }

        // Validación 2: Sesión existe y está abierta
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, estado, congelada, usuario_id, tenant_id')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            throw new NotFoundException('Sesión de caja no encontrada');
        }

        if (sesion.estado !== 'ABIERTA') {
            throw new BadRequestException(`La sesión no está abierta (estado: ${sesion.estado})`);
        }

        if (sesion.congelada) {
            throw new BadRequestException('La caja ya está congelada (cambio de turno en proceso)');
        }

        // Validación 3: Usuario saliente debe ser el dueño de la sesión
        if (sesion.usuario_id !== usuarioSalienteId) {
            throw new BadRequestException(
                `El usuario saliente no coincide con el usuario de la sesión actual`,
            );
        }

        // Validación 4: No debe haber un cambio de turno en proceso
        const { data: cambioEnProceso } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('id')
            .eq('sesion_caja_id', sesionId)
            .eq('estado', EstadoCambioTurno.EN_PROCESO)
            .maybeSingle();

        if (cambioEnProceso) {
            throw new BadRequestException('Ya existe un cambio de turno en proceso');
        }

        // 1. Congelar la caja (bloquear nuevas transacciones)
        const { error: congelarError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({ congelada: true })
            .eq('id', sesionId)
            .eq('tenant_id', tenantId);

        if (congelarError) {
            throw new BadRequestException(`Error congelando caja: ${congelarError.message}`);
        }

        // 2. Calcular saldo actual del sistema
        const saldoSistema = await this.movementsService.calcularSaldoActual(sesionId, tenantId);

        // 3. Crear registro de cambio de turno
        const nuevoCambio = {
            sesion_caja_id: sesionId,
            usuario_saliente_id: usuarioSalienteId,
            usuario_entrante_id: usuarioEntranteId,
            saldo_sistema: saldoSistema,
            saldo_contado: 0, // Se actualizará al completar
            estado: EstadoCambioTurno.EN_PROCESO,
            timestamp_inicio: new Date().toISOString(),
            tenant_id: tenantId,
        };

        const { data: cambio, error: cambioError } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .insert([nuevoCambio])
            .select()
            .single();

        if (cambioError) {
            // Revertir congelamiento si falla la creación
            await this.supabase
                .getClient()
                .from('sesiones_caja')
                .update({ congelada: false })
                .eq('id', sesionId);

            throw new BadRequestException(`Error creando cambio de turno: ${cambioError.message}`);
        }

        // 4. Registrar en auditoría
        await this.auditService.registrarEvento(
            CashAuditEvent.CAMBIO_TURNO_INICIADO,
            tenantId,
            usuarioSalienteId,
            sesionId,
            {
                parametros: {
                    cambio_turno_id: cambio.id,
                    usuario_entrante: usuarioEntranteId,
                    saldo_sistema: saldoSistema,
                },
                resultado: 'INICIADO',
            },
        );

        this.logger.log(
            `Cambio de turno iniciado: ID=${cambio.id}, saldo sistema=S/.${saldoSistema.toFixed(2)}`,
        );

        return cambio as CambioTurno;
    }

    /**
     * Completa un cambio de turno
     * - Valida denominaciones contadas
     * - Calcula diferencia vs saldo sistema
     * - Aplica tolerancia configurada
     * - Registra firmas digitales y foto
     * - Registra movimiento de cambio de turno si hay diferencia
     * - Descongela la caja
     */
    async completarCambioTurno(
        cambioId: string,
        saldoContado: number,
        denominaciones: Denominaciones,
        fotoArqueo: string,
        firmas: FirmasDigitales,
        tenantId: string,
    ): Promise<CambioTurno> {
        this.logger.log(`Completando cambio de turno: ID=${cambioId}`);

        // Validación 1: Cambio existe y está en proceso
        const { data: cambio, error: findError } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('*')
            .eq('id', cambioId)
            .eq('tenant_id', tenantId)
            .single();

        if (findError || !cambio) {
            throw new NotFoundException('Cambio de turno no encontrado');
        }

        if (cambio.estado !== EstadoCambioTurno.EN_PROCESO) {
            throw new BadRequestException(`El cambio de turno ya fue ${cambio.estado.toLowerCase()}`);
        }

        // Validación 2: Saldo contado positivo
        if (saldoContado < 0) {
            throw new BadRequestException('El saldo contado no puede ser negativo');
        }

        // Validación 3: Denominaciones válidas
        const validacionDenom = this.reconciliationService.validarDenominacionesValidas(
            denominaciones,
        );
        if (!validacionDenom.valido) {
            throw new BadRequestException(
                `Denominaciones inválidas: ${validacionDenom.errores.join(', ')}`,
            );
        }

        // Validación 4: Total de denominaciones debe coincidir con saldo contado
        const totalDenominaciones = this.reconciliationService.calcularTotalDenominaciones(
            denominaciones,
        );

        if (Math.abs(totalDenominaciones - saldoContado) > 0.01) {
            throw new BadRequestException(
                `El saldo contado (S/.${saldoContado.toFixed(
                    2,
                )}) no coincide con las denominaciones (S/.${totalDenominaciones.toFixed(2)})`,
            );
        }

        // Validación 5: Firmas de ambos usuarios
        if (!firmas.saliente || !firmas.entrante) {
            throw new BadRequestException('Se requieren las firmas digitales de ambos usuarios');
        }

        // Validación 6: Foto del arqueo
        if (!fotoArqueo) {
            throw new BadRequestException('Se requiere foto del arqueo con ambos usuarios presentes');
        }

        // Calcular diferencia
        const diferencia = saldoContado - cambio.saldo_sistema;

        // Obtener tolerancia configurada
        const { data: config } = await this.supabase
            .getClient()
            .from('configuracion_caja')
            .select('tolerancia_diferencia_cierre')
            .eq('tenant_id', tenantId)
            .single();

        const tolerancia = config?.tolerancia_diferencia_cierre || 10.0;

        // Alertar si diferencia > tolerancia
        if (Math.abs(diferencia) > tolerancia) {
            this.logger.warn(
                `Diferencia en cambio de turno mayor a tolerancia: S/.${diferencia.toFixed(
                    2,
                )} (tolerancia: S/.${tolerancia})`,
            );

            // Registrar alerta en auditoría
            await this.auditService.registrarEvento(
                CashAuditEvent.DIFERENCIA_DETECTADA,
                tenantId,
                cambio.usuario_saliente_id,
                cambio.sesion_caja_id,
                {
                    parametros: {
                        cambio_turno_id: cambioId,
                        diferencia,
                        tolerancia,
                        saldo_sistema: cambio.saldo_sistema,
                        saldo_contado: saldoContado, // <-- FIX
                    },
                    resultado: 'ALERTA',
                },
            );
        }

        // 1. Si hay diferencia significativa, registrar como movimiento de ajuste
        if (Math.abs(diferencia) >= 0.01) {
            await this.movementsService.registrarMovimiento(
                cambio.sesion_caja_id,
                TipoMovimiento.CAMBIO_TURNO,
                diferencia, // Positivo si sobrante, negativo si faltante
                {
                    usuario_id: cambio.usuario_saliente_id,
                    motivo: `Diferencia en cambio de turno: S/.${diferencia.toFixed(
                        2,
                    )} (${diferencia > 0 ? 'SOBRANTE' : 'FALTANTE'})`,
                    referencia_documento: cambioId,
                    referencia_tipo: 'CAMBIO_TURNO',
                },
                tenantId,
            );
        }

        // 2. Actualizar cambio de turno
        const { data: cambioActualizado, error: updateError } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .update({
                saldo_contado: saldoContado,
                denominaciones,
                foto_arqueo: fotoArqueo,
                firma_digital_saliente: firmas.saliente,
                firma_digital_entrante: firmas.entrante,
                timestamp_fin: new Date().toISOString(),
                estado: EstadoCambioTurno.COMPLETADO,
            })
            .eq('id', cambioId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (updateError) {
            throw new BadRequestException(`Error completando cambio de turno: ${updateError.message}`);
        }

        // 3. Actualizar usuario responsable de la sesión
        const { error: sesionUpdateError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({
                usuario_id: cambio.usuario_entrante_id,
                cajero_id: cambio.usuario_entrante_id,
            })
            .eq('id', cambio.sesion_caja_id)
            .eq('tenant_id', tenantId);

        if (sesionUpdateError) {
            this.logger.error(`Error actualizando usuario de sesión: ${sesionUpdateError.message}`);
        }

        // 4. Descongelar la caja
        const { error: descongelarError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({ congelada: false })
            .eq('id', cambio.sesion_caja_id)
            .eq('tenant_id', tenantId);

        if (descongelarError) {
            this.logger.error(`Error descongelando caja: ${descongelarError.message}`);
        }

        // 5. Registrar en auditoría
        await this.auditService.registrarEvento(
            CashAuditEvent.CAMBIO_TURNO_COMPLETADO,
            tenantId,
            cambio.usuario_entrante_id,
            cambio.sesion_caja_id,
            {
                parametros: {
                    cambio_turno_id: cambioId,
                    usuario_saliente: cambio.usuario_saliente_id,
                    diferencia,
                    saldo_sistema: cambio.saldo_sistema,
                    saldo_contado: saldoContado, // <-- FIX
                },
                resultado: 'COMPLETADO',
            },
        );

        // 6. Registrar log de integración (contabilidad/seguimiento)
        try {
            await this.supabase.getClient()
                .from('integration_logs')
                .insert({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    servicio: 'CAJA',
                    operacion: 'CAMBIO_TURNO',
                    status: 'SUCCESS',
                    error_message: null,
                    timestamp: new Date().toISOString(),
                    correlacion_id: cambioId,
                    correlacion_tipo: 'CAMBIO_TURNO',
                    request_summary: null,
                    response_summary: JSON.stringify({
                        sesion_caja_id: cambio.sesion_caja_id,
                        usuario_saliente_id: cambio.usuario_saliente_id,
                        usuario_entrante_id: cambio.usuario_entrante_id,
                        saldo_sistema: cambio.saldo_sistema,
                        saldo_contado: saldoContado,
                        diferencia,
                    }),
                });
        } catch (logErr) {
            this.logger.warn(
                `No se pudo registrar integration_logs para CAMBIO_TURNO ${cambioId}: ${logErr?.message || logErr}`,
            );
        }

        this.logger.log(
            `Cambio de turno completado: ID=${cambioId}, diferencia=S/.${diferencia.toFixed(2)}`,
        );

        return cambioActualizado as CambioTurno;
    }

    /**
     * Cancela un cambio de turno en proceso
     * - Descongela la caja
     * - Marca el cambio como cancelado
     */
    async cancelarCambioTurno(
        cambioId: string,
        razon: string,
        userId: string,
        tenantId: string,
    ): Promise<CambioTurno> {
        this.logger.warn(`Cancelando cambio de turno: ID=${cambioId}, razón=${razon}`);

        const { data: cambio, error: findError } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('*')
            .eq('id', cambioId)
            .eq('tenant_id', tenantId)
            .single();

        if (findError || !cambio) {
            throw new NotFoundException('Cambio de turno no encontrado');
        }

        if (cambio.estado !== EstadoCambioTurno.EN_PROCESO) {
            throw new BadRequestException(`El cambio de turno ya fue ${cambio.estado.toLowerCase()}`);
        }

        // 1. Descongelar la caja
        await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({ congelada: false })
            .eq('id', cambio.sesion_caja_id)
            .eq('tenant_id', tenantId);

        // 2. Cancelar cambio
        const { data: cambioActualizado, error: updateError } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .update({
                estado: EstadoCambioTurno.CANCELADO,
                timestamp_fin: new Date().toISOString(),
            })
            .eq('id', cambioId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (updateError) {
            throw new BadRequestException(`Error cancelando cambio de turno: ${updateError.message}`);
        }

        this.logger.log(`Cambio de turno cancelado: ID=${cambioId}`);

        return cambioActualizado as CambioTurno;
    }

    /**
     * Obtiene todos los cambios de turno de una sesión
     */
    async obtenerCambiosSesion(sesionId: string, tenantId: string): Promise<CambioTurno[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId)
            .order('timestamp_inicio', { ascending: false });

        if (error) {
            throw new BadRequestException(`Error obteniendo cambios de turno: ${error.message}`);
        }

        return (data || []) as CambioTurno[];
    }

    /**
     * Obtiene estadísticas de cambios de turno por usuario
     */
    async obtenerEstadisticasUsuario(
        userId: string,
        tenantId: string,
        limite: number = 30,
    ): Promise<any> {
        const { data, error } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('diferencia, estado, timestamp_inicio, timestamp_fin')
            .or(`usuario_saliente_id.eq.${userId},usuario_entrante_id.eq.${userId}`)
            .eq('tenant_id', tenantId)
            .eq('estado', EstadoCambioTurno.COMPLETADO)
            .order('timestamp_inicio', { ascending: false })
            .limit(limite);

        if (error) {
            throw new BadRequestException(`Error obteniendo estadísticas: ${error.message}`);
        }

        const cambios = data || [];

        return {
            total_cambios: cambios.length,
            diferencia_promedio:
                cambios.length > 0
                    ? cambios.reduce((sum: number, c: any) => sum + c.diferencia, 0) / cambios.length
                    : 0,
            sobrantes: cambios.filter((c: any) => c.diferencia > 0).length,
            faltantes: cambios.filter((c: any) => c.diferencia < 0).length,
            cuadrados: cambios.filter((c: any) => Math.abs(c.diferencia) < 0.01).length,
        };
    }
}
