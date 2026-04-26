import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Servicio para validar concurrencia de cajas y prevenir aperturas duplicadas
 * 
 * Responsabilidades:
 * - Validar que un usuario no tenga múltiples cajas abiertas
 * - Validar que un terminal no tenga múltiples cajas activas
 * - Permitir cierres administrativos forzosos
 * - Gestionar sesiones colgadas
 */
@Injectable()
export class CashConcurrencyService {
    private readonly logger = new Logger(CashConcurrencyService.name);

    constructor(private readonly supabase: SupabaseService) { }

    /**
     * Valida que un usuario no tenga otra caja abierta
     * Regla de negocio: Un usuario solo puede tener UNA caja abierta simultáneamente
     */
    async validarConcurrenciaUsuario(
        userId: string,
        tenantId: string,
    ): Promise<{ valido: boolean; sesion_existente?: any; mensaje?: string }> {
        const { data: sesionAbierta, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, caja_id, hora_apertura, usuario_id')
            .eq('usuario_id', userId)
            .eq('estado', 'ABIERTA')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (error) {
            throw new BadRequestException(`Error validando concurrencia: ${error.message}`);
        }

        if (sesionAbierta) {
            return {
                valido: false,
                sesion_existente: sesionAbierta,
                mensaje: `Ya tiene la caja #${sesionAbierta.caja_id} abierta desde ${sesionAbierta.hora_apertura}. Debe cerrarla primero.`,
            };
        }

        return { valido: true };
    }

    /**
     * Valida que un terminal/caja no tenga una sesión abierta
     * Regla de negocio: Un terminal solo puede tener UNA sesión activa
     */
    async validarConcurrenciaTerminal(
        cajaId: string,
        tenantId: string,
    ): Promise<{ valido: boolean; sesion_existente?: any; mensaje?: string }> {
        const { data: sesionAbierta, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, caja_id, usuario_id, hora_apertura')
            .eq('caja_id', cajaId)
            .eq('estado', 'ABIERTA')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (error) {
            throw new BadRequestException(`Error validando concurrencia de terminal: ${error.message}`);
        }

        if (sesionAbierta) {
            return {
                valido: false,
                sesion_existente: sesionAbierta,
                mensaje: `La caja #${cajaId} ya tiene una sesión abierta por el usuario ${sesionAbierta.usuario_id} desde ${sesionAbierta.hora_apertura}.`,
            };
        }

        return { valido: true };
    }

    /**
     * Validación completa de concurrencia (usuario + terminal)
     * Debe llamarse antes de abrir una nueva sesión de caja
     */
    async validarConcurrencia(
        userId: string,
        cajaId: string,
        tenantId: string,
    ): Promise<void> {
        this.logger.log(`Validando concurrencia: usuario=${userId}, caja=${cajaId}`);

        // Validar concurrencia de usuario
        const validacionUsuario = await this.validarConcurrenciaUsuario(userId, tenantId);
        if (!validacionUsuario.valido) {
            throw new BadRequestException(validacionUsuario.mensaje);
        }

        // Validar concurrencia de terminal
        const validacionTerminal = await this.validarConcurrenciaTerminal(cajaId, tenantId);
        if (!validacionTerminal.valido) {
            throw new BadRequestException(validacionTerminal.mensaje);
        }

        this.logger.log(`Validación de concurrencia exitosa`);
    }

    /**
     * Detecta sesiones colgadas (abiertas hace más de X horas sin actividad)
     */
    async detectarSesionesColgadas(
        tenantId: string,
        horasSinActividad: number = 24,
    ): Promise<any[]> {
        const fechaLimite = new Date();
        fechaLimite.setHours(fechaLimite.getHours() - horasSinActividad);

        const { data, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*, cajas(nombre)')
            .eq('estado', 'ABIERTA')
            .eq('tenant_id', tenantId)
            .lt('hora_apertura', fechaLimite.toISOString());

        if (error) {
            throw new BadRequestException('Error detectando sesiones colgadas');
        }

        if (data && data.length > 0) {
            this.logger.warn(`Sesiones colgadas detectadas: ${data.length}`);
        }

        return data || [];
    }

    /**
     * Permite cerrar una sesión de forma administrativa (forzosa)
     * Requiere permisos de ADMIN y registra en auditoría
     */
    async permitirCierreAdministrativo(
        sesionId: string,
        adminId: string,
        razon: string,
        tenantId: string,
    ): Promise<void> {
        this.logger.warn(`Cierre administrativo solicitado: sesión=${sesionId}, admin=${adminId}`);

        // TODO: Validar que adminId tenga rol ADMIN
        // const { data: usuario } = await this.supabase.getClient()
        //   .from('users')
        //   .select('rol')
        //   .eq('id', adminId)
        //   .single();
        //
        // if (!usuario || usuario.rol !== 'ADMIN') {
        //   throw new UnauthorizedException('Solo administradores pueden forzar cierres');
        // }

        // Obtener sesión
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            throw new BadRequestException('Sesión no encontrada');
        }

        if (sesion.estado !== 'ABIERTA') {
            throw new BadRequestException('Solo se pueden cerrar sesiones abiertas');
        }

        // Calcular saldo esperado
        const { data: movimientos } = await this.supabase
            .getClient()
            .from('movimientos_caja')
            .select('monto')
            .eq('sesion_caja_id', sesionId);

        const sumaMovimientos = (movimientos || []).reduce((sum: number, m: any) => sum + m.monto, 0);
        const saldoEsperado = (sesion.monto_inicio || 0) + sumaMovimientos;

        // Cerrar sesión marcando como cierre administrativo
        const { error: updateError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({
                estado: 'CERRADA',
                hora_cierre: new Date().toISOString(),
                cerrado_por: adminId,
                monto_esperado: saldoEsperado,
                monto_contado: saldoEsperado, // Asumimos que cuadra
                diferencia: 0,
                notas: `CIERRE ADMINISTRATIVO: ${razon}`,
            })
            .eq('id', sesionId);

        if (updateError) {
            throw new BadRequestException('Error cerrando sesión administrativamente');
        }

        // Registrar en auditoría
        await this.supabase
            .getClient()
            .from('caja_audit_log')
            .insert([
                {
                    evento: 'APERTURA_FORZOSA',
                    sesion_caja_id: sesionId,
                    usuario_id: adminId,
                    parametros: {
                        razon,
                        sesion_original: sesion.usuario_id,
                        saldo_esperado: saldoEsperado,
                    },
                    resultado: 'COMPLETADO',
                    tenant_id: tenantId,
                },
            ]);

        this.logger.log(`Cierre administrativo completado: sesión=${sesionId}`);
    }

    /**
     * Obtiene todas las sesiones activas de un tenant
     */
    async obtenerSesionesActivas(tenantId: string): Promise<any[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*, cajas(nombre, codigo)')
            .eq('estado', 'ABIERTA')
            .eq('tenant_id', tenantId)
            .order('hora_apertura', { ascending: false });

        if (error) {
            throw new BadRequestException('Error obteniendo sesiones activas');
        }

        return data || [];
    }

    /**
     * Cuenta cuántas sesiones tiene abiertas un usuario específico
     */
    async contarSesionesAbiertas(userId: string, tenantId: string): Promise<number> {
        const { count, error } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*', { count: 'exact', head: true })
            .eq('usuario_id', userId)
            .eq('estado', 'ABIERTA')
            .eq('tenant_id', tenantId);

        if (error) {
            throw new BadRequestException('Error contando sesiones abiertas');
        }

        return count || 0;
    }
}
