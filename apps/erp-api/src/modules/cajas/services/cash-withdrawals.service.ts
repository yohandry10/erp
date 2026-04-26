import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CashMovementsService, TipoMovimiento } from './cash-movements.service';
import { CashAuthorizationService } from './cash-authorization.service';
import { CashAuditService, CashAuditEvent } from './cash-audit.service';

export enum MotivoRetiro {
    DEPOSITO_BANCARIO = 'DEPOSITO_BANCARIO',
    COMPRA_EMERGENCIA = 'COMPRA_EMERGENCIA',
    BOVEDA = 'BÓVEDA',
    OTRO = 'OTRO',
}

export enum EstadoConciliacion {
    PENDIENTE = 'PENDIENTE',
    CONCILIADO = 'CONCILIADO',
    RECHAZADO = 'RECHAZADO',
}

export interface RetiroMetadata {
    motivo_detalle?: string;
    foto_comprobante?: string;
    banco_destino?: string;
    numero_operacion?: string;
}

export interface RetiroCaja {
    id: string;
    sesion_caja_id: string;
    movimiento_caja_id?: string;
    monto: number;
    motivo: MotivoRetiro;
    motivo_detalle?: string;
    autorizado_por?: string;
    codigo_autorizacion?: string;
    foto_comprobante?: string;
    estado_conciliacion: EstadoConciliacion;
    fecha_conciliacion?: string;
    banco_destino?: string;
    numero_operacion?: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
}

export interface DatosConciliacionBancaria {
    banco_destino: string;
    numero_operacion: string;
    fecha_conciliacion: string;
    comprobante_url?: string;
}

/**
 * Servicio para gestionar retiros de efectivo de caja con controles estrictos
 * 
 * Responsabilidades:
 * - Validar monto de retiro vs límite configurado
 * - Requerir aprobación de supervisor para retiros altos
 * - Validar que el retiro no deje saldo < mínimo operativo
 * - Registrar foto de comprobante bancario
 * - Gestionar conciliación bancaria de retiros
 * - Registrar retiro como movimiento de caja
 * - Auditar todos los retiros (aprobados y rechazados)
 */
@Injectable()
export class CashWithdrawalsService {
    private readonly logger = new Logger(CashWithdrawalsService.name);

    constructor(
        private readonly supabase: SupabaseService,
        private readonly movementsService: CashMovementsService,
        private readonly authService: CashAuthorizationService,
        private readonly auditService: CashAuditService,
    ) { }

    /**
     * Solicita un retiro de efectivo con todas las validaciones necesarias
     */
    async solicitarRetiro(
        sesionId: string,
        monto: number,
        motivo: MotivoRetiro,
        userId: string,
        tenantId: string,
        metadata: RetiroMetadata = {},
        supervisorId?: string,
        codigoAutorizacion?: string,
    ): Promise<RetiroCaja> {
        this.logger.log(
            `Solicitando retiro: sesión=${sesionId}, monto=S/.${monto}, motivo=${motivo}`,
        );

        // Validación 1: Monto positivo
        if (monto <= 0) {
            throw new BadRequestException('El monto del retiro debe ser mayor a cero');
        }

        // Validación 2: Sesión existe y está abierta
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, estado, monto_inicio, congelada, tenant_id')
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
            throw new BadRequestException('La caja está congelada (cambio de turno en proceso)');
        }

        // Validación 3: Requiere autorización de supervisor para montos altos
        const validacionAuth = await this.authService.validarMontoRetiro(
            monto,
            tenantId,
            supervisorId,
            codigoAutorizacion,
        );

        if (validacionAuth.requiere_autorizacion) {
            // Registrar intento rechazado en auditoría
            await this.auditService.registrarEvento(
                CashAuditEvent.RETIRO_RECHAZADO,
                tenantId,
                userId,
                sesionId,
                {
                    parametros: { monto, motivo, razon: 'SIN_AUTORIZACION_SUPERVISOR' },
                    resultado: 'RECHAZADO',
                },
            );

            throw new BadRequestException(validacionAuth.mensaje);
        }

        // Validación 4: Saldo actual suficiente para retiro
        const saldoActual = await this.movementsService.calcularSaldoActual(sesionId, tenantId);

        if (saldoActual < monto) {
            throw new BadRequestException(
                `Saldo insuficiente para retiro. Saldo actual: S/.${saldoActual.toFixed(2)}, Solicitado: S/.${monto.toFixed(2)}`,
            );
        }

        // Validación 5: El retiro no debe dejar saldo < mínimo operativo
        const config = await this.authService.obtenerConfiguracion(tenantId);
        const saldoDespuesRetiro = saldoActual - monto;

        if (saldoDespuesRetiro < config.saldo_minimo_operativo) {
            throw new BadRequestException(
                `El retiro dejaría el saldo (S/.${saldoDespuesRetiro.toFixed(2)}) por debajo del mínimo operativo (S/.${config.saldo_minimo_operativo}).`,
            );
        }

        // Validación 6: Motivo DEPOSITO_BANCARIO requiere foto de comprobante
        if (motivo === MotivoRetiro.DEPOSITO_BANCARIO && !metadata.foto_comprobante) {
            throw new BadRequestException(
                'Los retiros por depósito bancario requieren foto del comprobante',
            );
        }

        // Validación 7: Motivo OTRO requiere detalle
        if (motivo === MotivoRetiro.OTRO && !metadata.motivo_detalle) {
            throw new BadRequestException('El motivo OTRO requiere especificar el detalle');
        }

        // 1. Registrar movimiento de caja (monto negativo)
        const movimiento = await this.movementsService.registrarMovimiento(
            sesionId,
            TipoMovimiento.RETIRO,
            -monto, // Negativo para retiro
            {
                usuario_id: userId,
                supervisor_id: supervisorId,
                motivo: `RETIRO: ${motivo} - ${metadata.motivo_detalle || ''}`,
                referencia_tipo: 'RETIRO_CAJA',
            },
            tenantId,
        );

        // 2. Crear registro de retiro
        const nuevoRetiro = {
            sesion_caja_id: sesionId,
            movimiento_caja_id: movimiento.id,
            monto,
            motivo,
            motivo_detalle: metadata.motivo_detalle || null,
            autorizado_por: supervisorId || null,
            codigo_autorizacion: codigoAutorizacion ? '******' : null, // No guardar el código real por seguridad
            foto_comprobante: metadata.foto_comprobante || null,
            estado_conciliacion: EstadoConciliacion.PENDIENTE,
            banco_destino: metadata.banco_destino || null,
            numero_operacion: metadata.numero_operacion || null,
            tenant_id: tenantId,
        };

        const { data: retiro, error: retiroError } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .insert([nuevoRetiro])
            .select()
            .single();

        if (retiroError) {
            this.logger.error(`Error creando retiro: ${retiroError.message}`, retiroError);
            throw new BadRequestException(`Error al crear retiro: ${retiroError.message}`);
        }

        // 3. Registrar en auditoría
        await this.auditService.registrarEvento(
            CashAuditEvent.RETIRO_AUTORIZADO,
            tenantId,
            userId,
            sesionId,
            {
                parametros: {
                    retiro_id: retiro.id,
                    monto,
                    motivo,
                    supervisor_id: supervisorId,
                    saldo_antes: saldoActual,
                    saldo_despues: saldoDespuesRetiro,
                },
                resultado: 'APROBADO',
            },
        );

        this.logger.log(
            `Retiro creado exitosamente: ID=${retiro.id}, monto=S/.${monto}, nuevo saldo=S/.${saldoDespuesRetiro.toFixed(2)}`,
        );

        return retiro as RetiroCaja;
    }

    /**
     * Concilia un retiro con datos bancarios
     */
    async conciliarRetiro(
        retiroId: string,
        datos: DatosConciliacionBancaria,
        userId: string,
        tenantId: string,
    ): Promise<RetiroCaja> {
        this.logger.log(`Conciliando retiro: ID=${retiroId}`);

        // Validar que el retiro existe y está pendiente
        const { data: retiro, error: findError } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*')
            .eq('id', retiroId)
            .eq('tenant_id', tenantId)
            .single();

        if (findError || !retiro) {
            throw new NotFoundException('Retiro no encontrado');
        }

        if (retiro.estado_conciliacion !== EstadoConciliacion.PENDIENTE) {
            throw new BadRequestException(
                `El retiro ya fue ${retiro.estado_conciliacion.toLowerCase()}`,
            );
        }

        // Validar datos de conciliación
        if (!datos.banco_destino || !datos.numero_operacion) {
            throw new BadRequestException(
                'Se requiere banco destino y número de operación para conciliar',
            );
        }

        // Actualizar retiro
        const { data: retiroActualizado, error: updateError } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .update({
                estado_conciliacion: EstadoConciliacion.CONCILIADO,
                fecha_conciliacion: datos.fecha_conciliacion || new Date().toISOString(),
                banco_destino: datos.banco_destino,
                numero_operacion: datos.numero_operacion,
                foto_comprobante: datos.comprobante_url || retiro.foto_comprobante,
                updated_at: new Date().toISOString(),
            })
            .eq('id', retiroId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (updateError) {
            throw new BadRequestException(`Error al conciliar retiro: ${updateError.message}`);
        }

        this.logger.log(`Retiro conciliado: ID=${retiroId}, operación=${datos.numero_operacion}`);

        return retiroActualizado as RetiroCaja;
    }

    /**
     * Rechaza una conciliación de retiro
     */
    async rechazarConciliacion(
        retiroId: string,
        razon: string,
        userId: string,
        tenantId: string,
    ): Promise<RetiroCaja> {
        this.logger.warn(`Rechazando conciliación de retiro: ID=${retiroId}, razón=${razon}`);

        const { data: retiro, error: findError } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*')
            .eq('id', retiroId)
            .eq('tenant_id', tenantId)
            .single();

        if (findError || !retiro) {
            throw new NotFoundException('Retiro no encontrado');
        }

        const { data: retiroActualizado, error: updateError } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .update({
                estado_conciliacion: EstadoConciliacion.RECHAZADO,
                motivo_detalle: `${retiro.motivo_detalle || ''}\nRECHAZADO: ${razon}`,
                updated_at: new Date().toISOString(),
            })
            .eq('id', retiroId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (updateError) {
            throw new BadRequestException(`Error al rechazar retiro: ${updateError.message}`);
        }

        return retiroActualizado as RetiroCaja;
    }

    /**
     * Obtiene todos los retiros de una sesión
     */
    async obtenerRetirosSesion(sesionId: string, tenantId: string): Promise<RetiroCaja[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(`Error obteniendo retiros: ${error.message}`);
        }

        return (data || []) as RetiroCaja[];
    }

    /**
     * Obtiene retiros pendientes de conciliación
     */
    async obtenerRetirosPendientes(tenantId: string, limite: number = 50): Promise<RetiroCaja[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*, sesiones_caja!inner(hora_apertura, usuario_id)')
            .eq('estado_conciliacion', EstadoConciliacion.PENDIENTE)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
            .limit(limite);

        if (error) {
            throw new BadRequestException(`Error obteniendo retiros pendientes: ${error.message}`);
        }

        return (data || []) as RetiroCaja[];
    }

    /**
     * Calcula total de retiros de una sesión
     */
    async calcularTotalRetiros(sesionId: string, tenantId: string): Promise<number> {
        const retiros = await this.obtenerRetirosSesion(sesionId, tenantId);
        return retiros.reduce((sum, r) => sum + r.monto, 0);
    }

    /**
     * Obtiene estadísticas de retiros por motivo
     */
    async obtenerEstadisticasRetiros(
        fechaDesde: string,
        fechaHasta: string,
        tenantId: string,
    ): Promise<Record<string, { cantidad: number; total: number }>> {
        const { data, error } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('motivo, monto')
            .eq('tenant_id', tenantId)
            .gte('created_at', fechaDesde)
            .lte('created_at', fechaHasta);

        if (error) {
            throw new BadRequestException(`Error obteniendo estadísticas: ${error.message}`);
        }

        const estadisticas: Record<string, { cantidad: number; total: number }> = {};

        (data || []).forEach((retiro) => {
            if (!estadisticas[retiro.motivo]) {
                estadisticas[retiro.motivo] = { cantidad: 0, total: 0 };
            }
            estadisticas[retiro.motivo].cantidad++;
            estadisticas[retiro.motivo].total += retiro.monto;
        });

        return estadisticas;
    }
}
