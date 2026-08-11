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
            // Leer no crea datos de forma implícita. La configuración durable se
            // guarda únicamente mediante guardar_configuracion_caja_tx (474).
            return {
                monto_apertura_min: 100,
                monto_apertura_max: 2000,
                retiro_max_sin_autorizacion: 500,
                saldo_minimo_operativo: 50,
                tolerancia_diferencia_cierre: 10,
            };
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
        const moneda = await this.obtenerMonedaTenant(tenantId);

        const fueraDeRango =
            monto < config.monto_apertura_min || monto > config.monto_apertura_max;

        if (!fueraDeRango) {
            return { requiere_autorizacion: false };
        }

        // Monto fuera de rango, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            return {
                requiere_autorizacion: true,
                mensaje: `Monto fuera de rango (${this.formatearMonto(config.monto_apertura_min, moneda)} - ${this.formatearMonto(config.monto_apertura_max, moneda)}). Requiere autorización de supervisor.`,
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
            `Monto fuera de rango estándar: ${this.formatearMonto(monto, moneda)}`,
            tenantId,
        );

        this.logger.log(
            `Autorización de apertura atípica aprobada: monto=${this.formatearMonto(monto, moneda)}, supervisor=${supervisorId}`,
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
        const moneda = await this.obtenerMonedaTenant(tenantId);

        if (monto <= config.retiro_max_sin_autorizacion) {
            return { requiere_autorizacion: false };
        }

        // Retiro alto, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            return {
                requiere_autorizacion: true,
                mensaje: `Retiro mayor a ${this.formatearMonto(config.retiro_max_sin_autorizacion, moneda)}. Requiere autorización de supervisor.`,
            };
        }

        // Validar código de supervisor
        await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion, tenantId);

        this.logger.log(`Autorización de retiro alto aprobada: monto=${this.formatearMonto(monto, moneda)}, supervisor=${supervisorId}`);

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
        const moneda = await this.obtenerMonedaTenant(tenantId);

        if (Math.abs(diferencia) <= config.tolerancia_diferencia_cierre) {
            return { requiere_autorizacion: false };
        }

        // Diferencia mayor a tolerancia, requiere autorización
        if (!supervisorId || !codigoAutorizacion) {
            const tipoDiferencia = diferencia > 0 ? 'sobrante' : 'faltante';
            return {
                requiere_autorizacion: true,
                mensaje: `Diferencia de ${this.formatearMonto(Math.abs(diferencia), moneda)} (${tipoDiferencia}) mayor a tolerancia (${this.formatearMonto(config.tolerancia_diferencia_cierre, moneda)}). Requiere autorización de supervisor.`,
            };
        }

        // Validar código de supervisor
        await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion, tenantId);

        this.logger.log(
            `Autorización de cierre con diferencia aprobada: diferencia=${this.formatearMonto(diferencia, moneda)}, supervisor=${supervisorId}`,
        );

        return { requiere_autorizacion: false };
    }

    async obtenerMonedaTenant(tenantId: string): Promise<string> {
        const { data } = await this.supabase
            .getClient()
            .from('empresa_config')
            .select('moneda_defecto')
            .eq('tenant_id', tenantId)
            .maybeSingle();
        return String(data?.moneda_defecto || 'PEN').toUpperCase();
    }

    private formatearMonto(monto: number, moneda: string): string {
        return `${moneda} ${Number(monto || 0).toFixed(2)}`;
    }

    /**
     * Valida el código PIN de un supervisor
     * Nota: Validación de PIN contra hash requiere tabla supervisor_pins (pendiente de schema).
     * Por ahora valida formato + verifica rol SUPERVISOR/ADMIN.
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

        // Verificar que el usuario tenga rol de supervisor o admin
        const { data: supervisorRoles } = await this.supabase.getClient()
            .from('user_roles')
            .select('roles(nombre)')
            .eq('usuario_sistema_id', supervisorId)
            .eq('tenant_id', tenantId);

        const roleNames = (supervisorRoles || [])
            .map((ur: any) => (ur.roles as any)?.nombre?.toUpperCase())
            .filter(Boolean);

        if (!roleNames.some((r: string) => ['SUPERVISOR', 'ADMIN'].includes(r))) {
            throw new UnauthorizedException('El usuario no tiene permisos de supervisor');
        }

        // TODO: Validar código PIN contra hash almacenado (requiere tabla supervisor_pins)

        this.logger.log(`Código de supervisor validado (rol verificado): ${supervisorId}`);
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
        // No se escribe una auditoría separada del negocio: la RPC dueña de la
        // operación debe persistir autorización y auditoría en el mismo commit.
        this.logger.debug(
            `Autorización validada para frontera atómica: ${tipo}/${tenantId}/${usuarioId}/${supervisorId}/${monto}/${razon}`,
        );
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
