import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export enum TipoMovimiento {
    VENTA = 'VENTA',
    RETIRO = 'RETIRO',
    INGRESO = 'INGRESO',
    AJUSTE = 'AJUSTE',
    CAMBIO_TURNO = 'CAMBIO_TURNO',
    APERTURA = 'APERTURA',
}

export interface MovimientoMetadata {
    referencia_documento?: string;
    referencia_tipo?: string;
    motivo?: string;
    usuario_id?: string;
    supervisor_id?: string;
    ip_address?: string;
    [key: string]: any;
}

export interface MovimientoCaja {
    id: string;
    sesion_caja_id: string;
    secuencia: number;
    tipo_movimiento: TipoMovimiento;
    monto: number;
    saldo_anterior: number;
    saldo_nuevo: number;
    referencia_documento?: string;
    referencia_tipo?: string;
    motivo?: string;
    usuario_id?: string;
    supervisor_id?: string;
    timestamp: string;
    ip_address?: string;
    metadata?: Record<string, any>;
    tenant_id: string;
    created_at: string;
}

export interface ValidationResult {
    valido: boolean;
    errores: string[];
}

/**
 * Servicio para gestionar movimientos de caja con trazabilidad completa
 *
 * Responsabilidades:
 * - Consultar y validar el ledger inmutable de movimientos
 * - Validar cuadre matemático (saldo_anterior + monto = saldo_nuevo)
 * - Calcular saldo en tiempo real
 * - Detectar gaps en secuencia de movimientos
 * - Garantizar inmutabilidad de registros
 */
@Injectable()
export class CashMovementsService {
    private readonly logger = new Logger(CashMovementsService.name);

    constructor(private readonly supabase: SupabaseService) {}

    /**
     * Compatibilidad fail-closed. Un movimiento aislado no puede demostrar su
     * contrapartida contable, actor/RBAC ni outbox dentro del mismo commit.
     * Los callers productivos deben usar abrir/cerrar 451 o los RPC de negocio
     * 452/456/466/474, según el origen del efectivo.
     */
    async registrarMovimiento(
        sesionId: string,
        tipo: TipoMovimiento,
        monto: number,
        metadata: MovimientoMetadata = {},
        tenantId: string,
    ): Promise<MovimientoCaja> {
        this.logger.warn(
            `Writer aislado bloqueado: sesión=${sesionId}, tipo=${tipo}, monto=${monto}, tenant=${tenantId}`,
        );
        void metadata;
        throw new BadRequestException(
            'El movimiento aislado está bloqueado: use el flujo atómico de negocio con contrapartida contable',
        );
    }

    /**
     * Obtiene todos los movimientos de una sesión ordenados por secuencia
     */
    async obtenerMovimientos(sesionId: string, tenantId: string): Promise<MovimientoCaja[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('movimientos_caja')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId)
            .order('secuencia', { ascending: true });

        if (error) {
            this.logger.error(`Error obteniendo movimientos: ${error.message}`, error);
            throw new BadRequestException(`Error al obtener movimientos: ${error.message}`);
        }

        return (data || []) as MovimientoCaja[];
    }

    /**
     * Obtiene el último movimiento de una sesión
     */
    async obtenerUltimoMovimiento(sesionId: string, tenantId: string): Promise<MovimientoCaja | null> {
        const { data, error } = await this.supabase
            .getClient()
            .from('movimientos_caja')
            .select('*')
            .eq('sesion_caja_id', sesionId)
            .eq('tenant_id', tenantId)
            .order('secuencia', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            this.logger.error(`Error obteniendo último movimiento: ${error.message}`, error);
            throw new BadRequestException(`Error al obtener último movimiento: ${error.message}`);
        }

        return data as MovimientoCaja | null;
    }

    /**
     * Calcula el saldo actual de una sesión basándose en el último movimiento
     */
    async calcularSaldoActual(sesionId: string, tenantId: string): Promise<number> {
        const ultimoMovimiento = await this.obtenerUltimoMovimiento(sesionId, tenantId);

        if (!ultimoMovimiento) {
            // Si no hay movimientos, obtener monto de apertura
            const { data: sesion, error } = await this.supabase
                .getClient()
                .from('sesiones_caja')
                .select('monto_inicio')
                .eq('id', sesionId)
                .eq('tenant_id', tenantId)
                .single();

            if (error || !sesion) {
                throw new NotFoundException('Sesión de caja no encontrada');
            }

            return sesion.monto_inicio || 0;
        }

        return ultimoMovimiento.saldo_nuevo;
    }

    /**
     * Valida la integridad de una sesión usando la función de BD
     * Detecta:
     * - Gaps en secuencia de movimientos
     * - Descuadres matemáticos en saldos
     * - Inconsistencias en montos esperados
     */
    async validarIntegridad(sesionId: string): Promise<ValidationResult> {
        this.logger.log(`Validando integridad de sesión: ${sesionId}`);

        const { data, error } = await this.supabase
            .getClient()
            .rpc('validar_integridad_sesion', {
                p_sesion_caja_id: sesionId,
            });

        if (error) {
            this.logger.error(`Error validando integridad: ${error.message}`, error);
            throw new BadRequestException(`Error al validar integridad: ${error.message}`);
        }

        const result = Array.isArray(data) && data.length > 0 ? data[0] : data;

        if (!result.valido && result.errores?.length > 0) {
            this.logger.warn(`Integridad comprometida en sesión ${sesionId}: ${result.errores.join(', ')}`);
        }

        return {
            valido: result.valido,
            errores: result.errores || [],
        };
    }

    /**
     * Detecta gaps en la secuencia de movimientos
     * Útil para detección de fraude
     */
    async detectarGapsSecuencia(sesionId: string, tenantId: string): Promise<number[]> {
        const movimientos = await this.obtenerMovimientos(sesionId, tenantId);

        if (movimientos.length === 0) {
            return [];
        }

        const gaps: number[] = [];
        const secuencias = movimientos.map((m) => m.secuencia).sort((a, b) => a - b);
        const maxSecuencia = Math.max(...secuencias);

        for (let i = 1; i <= maxSecuencia; i++) {
            if (!secuencias.includes(i)) {
                gaps.push(i);
            }
        }

        if (gaps.length > 0) {
            this.logger.warn(`Gaps detectados en sesión ${sesionId}: ${gaps.join(', ')}`);
        }

        return gaps;
    }

    /**
     * Cuenta movimientos por tipo para una sesión
     */
    async contarMovimientosPorTipo(
        sesionId: string,
        tipo: TipoMovimiento,
        tenantId: string,
    ): Promise<number> {
        const { count, error } = await this.supabase
            .getClient()
            .from('movimientos_caja')
            .select('*', { count: 'exact', head: true })
            .eq('sesion_caja_id', sesionId)
            .eq('tipo_movimiento', tipo)
            .eq('tenant_id', tenantId);

        if (error) {
            throw new BadRequestException(`Error al contar movimientos: ${error.message}`);
        }

        return count || 0;
    }

    /**
     * Obtiene el total de un tipo específico de movimiento
     */
    async obtenerTotalPorTipo(
        sesionId: string,
        tipo: TipoMovimiento,
        tenantId: string,
    ): Promise<number> {
        const movimientos = await this.obtenerMovimientos(sesionId, tenantId);
        const movimientosTipo = movimientos.filter((m) => m.tipo_movimiento === tipo);
        return movimientosTipo.reduce((sum, m) => sum + m.monto, 0);
    }

    /**
     * Recalcula el saldo esperado sumando todos los movimientos
     * Útil para verificar integridad
     */
    async recalcularSaldoEsperado(sesionId: string, tenantId: string): Promise<number> {
        // Obtener monto de apertura
        const { data: sesion, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('monto_inicio')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (error || !sesion) {
            throw new NotFoundException('Sesión de caja no encontrada');
        }

        // Sumar todos los movimientos
        const movimientos = await this.obtenerMovimientos(sesionId, tenantId);
        const sumaMovimientos = movimientos.reduce((sum, m) => sum + m.monto, 0);

        return (sesion.monto_inicio || 0) + sumaMovimientos;
    }
}
