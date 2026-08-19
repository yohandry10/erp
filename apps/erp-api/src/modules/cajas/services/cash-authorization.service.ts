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
     * Comprueba que un supervisor sea quien dice ser antes de autorizar una
     * operación de caja. Lanza `UnauthorizedException` si el rol, el PIN o el
     * estado del PIN no habilitan la autorización.
     *
     * Es la entrada pública a la misma verificación que usa el cierre con
     * diferencia; existe para que quien sólo necesita autenticar al supervisor no
     * tenga que reimplementarla ni reproducir el cálculo de tolerancia.
     */
    async validarAutorizacionSupervisor(
        supervisorId: string,
        codigo: string,
        tenantId: string,
    ): Promise<void> {
        await this.validarCodigoSupervisor(supervisorId, codigo, tenantId);
    }

    /**
     * Valida el PIN de un supervisor contra su hash almacenado.
     *
     * Antes esta función aceptaba como válido cualquier código de seis dígitos:
     * comprobaba el formato y el rol, y dejaba la verificación real como TODO. En
     * la práctica eso convertía la autorización por diferencia de caja en un
     * trámite, porque el cajero podía teclear cualquier número.
     *
     * La verificación vive ahora en `verificar_pin_supervisor_tx`. Está en SQL y no
     * aquí porque el contador de intentos es un read-modify-write: resolverlo en la
     * aplicación abre una carrera que permite probar PIN en paralelo sin que el
     * bloqueo llegue a contar. La RPC toma el lock, compara contra el hash bcrypt,
     * acumula intentos y bloquea quince minutos tras cinco fallos, todo en la misma
     * transacción. Si el supervisor no tiene PIN registrado falla cerrado.
     */
    private async validarCodigoSupervisor(
        supervisorId: string,
        codigo: string,
        tenantId: string,
    ): Promise<void> {
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

        const { data, error } = await this.supabase.getClient().rpc('verificar_pin_supervisor_tx', {
            p_tenant_id: tenantId,
            p_usuario_id: supervisorId,
            p_pin: String(codigo ?? ''),
        });

        if (error) {
            this.logger.error(`No se pudo verificar el PIN de supervisor: ${error.message}`);
            throw new UnauthorizedException('No se pudo verificar el código de supervisor');
        }

        // La RPC devuelve el veredicto en lugar de lanzarlo, porque un RAISE en
        // PL/pgSQL revierte el mismo UPDATE que acumula el intento fallido. Aquí se
        // exige `valido === true` de forma estricta: cualquier otra cosa —incluido
        // un `data` ausente o malformado— es un rechazo. Un resultado ignorado
        // equivaldría a autorizar.
        const resultado = (data ?? {}) as { valido?: boolean; motivo?: string };
        if (resultado.valido !== true) {
            // El motivo se traduce sin revelar si el PIN existe o cuántos intentos
            // quedan: eso sólo ayudaría a quien está probando códigos.
            this.logger.warn(
                `PIN de supervisor rechazado para ${supervisorId}: ${resultado.motivo ?? 'SIN_MOTIVO'}`,
            );
            if (resultado.motivo === 'SUPERVISOR_PIN_LOCKED') {
                throw new UnauthorizedException(
                    'El PIN del supervisor está bloqueado temporalmente por intentos fallidos.',
                );
            }
            if (resultado.motivo === 'SUPERVISOR_PIN_NOT_REGISTERED') {
                throw new UnauthorizedException(
                    'El supervisor no tiene un PIN registrado. Regístrelo antes de autorizar.',
                );
            }
            throw new UnauthorizedException('Código de supervisor inválido');
        }

        this.logger.log(`PIN de supervisor verificado: ${supervisorId}`);
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
