import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface ConfiguracionCaja {
    id: string;
    tenant_id: string;
    caja_id: string | null;
    monto_apertura_min: number;
    monto_apertura_max: number;
    requiere_supervisor_fuera_rango: boolean;
    tolerancia_diferencia_cierre: number;
    created_at: string;
    updated_at: string;
}

export interface ConfiguracionCajaDto {
    caja_id?: string | null;
    monto_apertura_min: number;
    monto_apertura_max: number;
    requiere_supervisor_fuera_rango?: boolean;
    tolerancia_diferencia_cierre?: number;
    retiro_max_sin_autorizacion?: number;
    saldo_minimo_operativo?: number;
    moneda?: string;
}

/**
 * Servicio para gestionar configuración de cajas registradoras
 * 
 * Funcionalidades:
 * - Obtener configuración efectiva (específica o default)
 * - Crear/actualizar configuración
 * - Validar montos contra thresholds
 */
@Injectable()
export class ConfiguracionCajaService {
    private readonly logger = new Logger(ConfiguracionCajaService.name);

    constructor(private readonly supabase: SupabaseService) { }

    /**
     * Obtiene la configuración efectiva para una caja
     * 
     * Prioridad:
     * 1. Configuración específica de la caja
     * 2. Configuración por defecto del tenant (caja_id = NULL)
     * 3. Valores hardcoded si no existe ninguna
     */
    async obtenerConfiguracion(
        tenantId: string,
        cajaId?: string,
    ): Promise<ConfiguracionCaja> {
        // Usar función de BD que maneja la lógica de prioridad
        const { data, error } = await this.supabase
            .getClient()
            .rpc('obtener_configuracion_efectiva_caja', {
                p_tenant_id: tenantId,
                p_caja_id: cajaId || null,
            });

        if (error) {
            this.logger.error(
                `Error al obtener configuración de caja: ${error.message}`,
                error,
            );

            // Fallback a valores por defecto si falla la BD
            return this.getDefaultConfig(tenantId, cajaId);
        }

        return data as ConfiguracionCaja;
    }

    /**
     * Crea o actualiza configuración
     */
    async guardarConfiguracion(
        tenantId: string,
        dto: ConfiguracionCajaDto,
        actorId: string,
        idempotencyKey: string,
    ): Promise<ConfiguracionCaja> {
        // Validar que min < max
        if (dto.monto_apertura_min >= dto.monto_apertura_max) {
            throw new Error(
                `Monto mínimo (${dto.monto_apertura_min}) debe ser menor que monto máximo (${dto.monto_apertura_max})`,
            );
        }

        const { data, error } = await this.supabase.getClient().rpc(
            'guardar_configuracion_caja_tx',
            {
                p_tenant_id: tenantId,
                p_payload: dto,
                p_actor_id: actorId,
                p_idempotency_key: idempotencyKey,
            },
        );

        if (error) {
            this.logger.error(
                `Error al guardar configuración: ${error.message}`,
                error,
            );
            throw new Error(`Error al guardar configuración: ${error.message}`);
        }

        this.logger.log(
            `Configuración guardada: Tenant=${tenantId}, Caja=${dto.caja_id || 'DEFAULT'}, Min=${dto.monto_apertura_min}, Max=${dto.monto_apertura_max}`,
        );

        return ((data as any)?.configuracion ?? data) as ConfiguracionCaja;
    }

    /**
     * Valida si un monto requiere autorización de supervisor
     */
    validarMontoRequiereAutorizacion(
        monto: number,
        config: ConfiguracionCaja,
    ): {
        requiere: boolean;
        tipo?: 'MONTO_BAJO' | 'MONTO_ALTO';
        mensaje?: string;
    } {
        if (!config.requiere_supervisor_fuera_rango) {
            return { requiere: false };
        }

        if (monto < config.monto_apertura_min) {
            return {
                requiere: true,
                tipo: 'MONTO_BAJO',
                mensaje: `Monto de apertura ($${monto.toFixed(2)}) es menor al mínimo permitido ($${config.monto_apertura_min.toFixed(2)}). Se requiere autorización de supervisor.`,
            };
        }

        if (monto > config.monto_apertura_max) {
            return {
                requiere: true,
                tipo: 'MONTO_ALTO',
                mensaje: `Monto de apertura ($${monto.toFixed(2)}) excede el máximo permitido ($${config.monto_apertura_max.toFixed(2)}). Se requiere autorización de supervisor.`,
            };
        }

        return { requiere: false };
    }

    /**
     * Inicializa configuración por defecto para un tenant
     */
    async crearConfiguracionDefault(
        tenantId: string,
        actorId: string,
        idempotencyKey: string,
    ): Promise<ConfiguracionCaja> {
        return this.guardarConfiguracion(tenantId, {
            caja_id: null, // Configuración default (sin caja específica)
            monto_apertura_min: 100.0,
            monto_apertura_max: 2000.0,
            requiere_supervisor_fuera_rango: true,
            tolerancia_diferencia_cierre: 10.0,
        }, actorId, idempotencyKey);
    }

    /**
     * Valores por defecto hardcoded (fallback)
     */
    private getDefaultConfig(
        tenantId: string,
        cajaId?: string,
    ): ConfiguracionCaja {
        return {
            id: 'default',
            tenant_id: tenantId,
            caja_id: cajaId || null,
            monto_apertura_min: 100.0,
            monto_apertura_max: 2000.0,
            requiere_supervisor_fuera_rango: true,
            tolerancia_diferencia_cierre: 10.0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    /**
     * Lista todas las configuraciones de un tenant
     */
    async listarConfiguraciones(tenantId: string): Promise<ConfiguracionCaja[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('configuracion_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('caja_id', { ascending: true, nullsFirst: true });

        if (error) {
            this.logger.error(`Error al listar configuraciones: ${error.message}`);
            throw new Error(`Error al listar configuraciones: ${error.message}`);
        }

        return data || [];
    }
}
