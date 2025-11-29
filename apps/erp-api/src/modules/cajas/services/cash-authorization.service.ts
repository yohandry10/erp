import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

export interface ConfiguracionCaja {
    monto_apertura_min: number;
    monto_apertura_max: number;
    retiro_max_sin_autorizacion: number;
    saldo_minimo_operativo: number;
    tolerancia_diferencia_cierre: number;
}

/**
 * Servicio para gestionar autorizaciones de supervisor en operaciones de caja
 * 
 * Responsabilidades:
 * - Validar montos de apertura fuera de rango
 * - Verificar códigos PIN de supervisor
 * - Registrar autorizaciones especiales
 * - Determinar si una operación requiere autorización
 */
@Injectable()
export class CashAuthorizationService {
    private readonly logger = new Logger(CashAuthorizationService.name);

    constructor(private readonly supabase: SupabaseService) { }

    /**
     * Obtiene la configuración de caja para un tenant
     */
    async obtenerConfiguracion(tenantId: string): Promise<ConfiguracionCaja> {
        const { data, error } = await this.supabase
            .getClient()
            .from('configuracion_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .single();

        if (error) {
            this.logger.warn(`No se encontró configuración para tenant ${tenantId}, usando valores por defecto`);

            // Crear configuración por defecto si no existe
            const { data: newConfig, error: insertError } = await this.supabase
                .getClient()
                .from('configuracion_caja')
                .insert([{ tenant_id: tenantId }])
                .select()
                .single();

            if (insertError) {
                throw new BadRequestException('Error creando configuración de caja');
            }

            return newConfig as ConfiguracionCaja;
        }

        return data as ConfiguracionCaja;
    }

    /**
     * Valida si un monto de apertura requiere autorización de supervisor
     */
    async validarMontoApertura(
        monto: number,
        tenantId: string,
        userId: string,
        supervisorId?: string,
        codigoAutorizacion?: string,
    ): Promise<{ requiere_autorizacion: boolean; mensaje?: string }> {
        const config = await this.obtenerConfiguracion(tenantId);

        const fueraDeRango =
            monto < config.monto_apertura_min || monto > config.monto_apertura_max;

        if (!fueraDeRango) {
            return { requiere_autorizacion: false };
        }

        // Monto fuera de rango, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            return {
                requiere_autorizacion: true,
                mensaje: `Monto fuera de rango (S/.${config.monto_apertura_min} - S/.${config.monto_apertura_max}). Requiere autorización de supervisor.`,
            };
        }

        // Validar código de supervisor
        await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion, tenantId);

        // Registrar autorización especial
        await this.registrarAutorizacionEspecial(
            'APERTURA_ATIPICA',
            userId,
            supervisorId,
            monto,
            `Monto fuera de rango estándar: S/.${monto.toFixed(2)}`,
            tenantId,
        );

        this.logger.log(
            `Autorización de apertura atípica aprobada: monto=S/.${monto}, supervisor=${supervisorId}`,
        );

        return { requiere_autorizacion: false };
    }

    /**
     * Valida si un retiro requiere autorización de supervisor
     */
    async validarMontoRetiro(
        monto: number,
        tenantId: string,
        supervisorId?: string,
        codigoAutorizacion?: string,
    ): Promise<{ requiere_autorizacion: boolean; mensaje?: string }> {
        const config = await this.obtenerConfiguracion(tenantId);

        if (monto <= config.retiro_max_sin_autorizacion) {
            return { requiere_autorizacion: false };
        }

        // Retiro alto, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            return {
                requiere_autorizacion: true,
                mensaje: `Retiro mayor a S/.${config.retiro_max_sin_autorizacion}. Requiere autorización de supervisor.`,
            };
        }

        // Validar código de supervisor
        await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion, tenantId);

        this.logger.log(`Autorización de retiro alto aprobada: monto=S/.${monto}, supervisor=${supervisorId}`);

        return { requiere_autorizacion: false };
    }

    /**
     * Valida si un cierre con diferencia requiere autorización
     */
    async validarDiferenciaCierre(
        diferencia: number,
        tenantId: string,
        supervisorId?: string,
        codigoAutorizacion?: string,
    ): Promise<{ requiere_autorizacion: boolean; mensaje?: string }> {
        const config = await this.obtenerConfiguracion(tenantId);

        if (Math.abs(diferencia) <= config.tolerancia_diferencia_cierre) {
            return { requiere_autorizacion: false };
        }

        // Diferencia mayor a tolerancia, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            const tipoDiferencia = diferencia > 0 ? 'sobrante' : 'faltante';
            return {
                requiere_autorizacion: true,
                mensaje: `Diferencia de S/.${Math.abs(diferencia).toFixed(2)} (${tipoDiferencia}) mayor a tolerancia (S/.${config.tolerancia_diferencia_cierre}). Requiere autorización de supervisor.`,
            };
        }

        // Validar código de supervisor
        await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion, tenantId);

        this.logger.log(
            `Autorización de cierre con diferencia aprobada: diferencia=S/.${diferencia}, supervisor=${supervisorId}`,
        );

        return { requiere_autorizacion: false };
    }

    /**
     * Valida el código PIN de un supervisor
     * TODO: Implementar validación real con tabla de usuarios y hasheado de PIN
     * Por ahora, valida longitud y formato
     */
    private async validarCodigoSupervisor(
        supervisorId: string,
        codigo: string,
        tenantId: string,
    ): Promise<void> {
        // Validar formato del código (debe ser 6 dígitos)
        if (!/^\d{6}$/.test(codigo)) {
            throw new UnauthorizedException('Código de supervisor inválido (debe ser 6 dígitos)');
        }

        // TODO: Verificar que el usuario tenga rol de supervisor
        // const { data: usuario } = await this.supabase.getClient()
        //   .from('users')
        //   .select('rol')
        //   .eq('id', supervisorId)
        //   .eq('tenant_id', tenantId)
        //   .single();
        //
        // if (!usuario || !['SUPERVISOR', 'ADMIN'].includes(usuario.rol)) {
        //   throw new UnauthorizedException('El usuario no tiene permisos de supervisor');
        // }

        // TODO: Validar código PIN contra hash almacenado
        // const { data: pinData } = await this.supabase.getClient()
        //   .from('supervisor_pins')
        //   .select('hash_pin')
        //   .eq('usuario_id', supervisorId)
        //   .single();
        //
        // const hashCodigo = await bcrypt.hash(codigo, pinData.salt);
        // if (hashCodigo !== pinData.hash_pin) {
        //   throw new UnauthorizedException('Código de supervisor incorrecto');
        // }

        // Por ahora, solo validamos el formato
        this.logger.log(`Código de supervisor validado: ${supervisorId}`);
    }

    /**
     * Registra una autorización especial en la auditoría
     */
    private async registrarAutorizacionEspecial(
        tipo: string,
        usuarioId: string,
        supervisorId: string,
        monto: number,
        razon: string,
        tenantId: string,
    ): Promise<void> {
        // Registrar en la tabla de auditoría de caja
        const { error } = await this.supabase
            .getClient()
            .from('caja_audit_log')
            .insert([
                {
                    evento: tipo,
                    usuario_id: usuarioId,
                    parametros: {
                        supervisor_id: supervisorId,
                        monto,
                        razon,
                    },
                    resultado: 'APROBADO',
                    tenant_id: tenantId,
                },
            ]);

        if (error) {
            this.logger.error(`Error registrando autorización especial: ${error.message}`);
        }
    }

    /**
     * Obtiene el historial de autorizaciones de un usuario
     */
    async obtenerHistorialAutorizaciones(
        usuarioId: string,
        tenantId: string,
        limite: number = 50,
    ): Promise<any[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('caja_audit_log')
            .select('*')
            .eq('usuario_id', usuarioId)
            .eq('tenant_id', tenantId)
            .in('evento', ['APERTURA_ATIPICA', 'RETIRO_AUTORIZADO', 'CIERRE_DIFERENCIA'])
            .order('timestamp', { ascending: false })
            .limit(limite);

        if (error) {
            throw new BadRequestException('Error obteniendo historial de autorizaciones');
        }

        return data || [];
    }
}
