import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { CashMovementsService, MovimientoCaja } from './cash-movements.service';
import {
    CashReconciliationService,
    Denominaciones,
    ResultadoCierre,
} from './cash-reconciliation.service';
import { CashAuthorizationService } from './cash-authorization.service';
import { CashAuditService, CashAuditEvent } from './cash-audit.service';

export interface PreCierreValidation {
    valido: boolean;
    errores: string[];
    warnings: string[];
}

export interface DatosCierre {
    monto_contado: number;
    denominaciones: Denominaciones;
    notas?: string;
}

export interface SesionCajaCerrada {
    id: string;
    estado: string;
    monto_inicio: number;
    monto_cierre: number;
    monto_esperado: number;
    monto_contado: number;
    diferencia: number;
    hash_integridad: string;
    hora_apertura: string;
    hora_cierre: string;
    denominaciones_cierre: Denominaciones;
}

/**
 * Servicio para cierre de caja con integridad criptográfica
 * 
 * Responsabilidades:
 * - Validar pre-cierre (transacciones pendientes, integridad)
 * - Validar denominaciones y calcular diferencias
 * - Requerir supervisor si diferencia > tolerancia
 * - Calcular hash SHA-256 de integridad
 * - Bloquear modificaciones post-cierre
 * - Registrar cierre en auditoría
 * - Generar reporte de cierre
 */
@Injectable()
export class CashClosingService {
    private readonly logger = new Logger(CashClosingService.name);

    constructor(
        private readonly supabase: SupabaseService,
        private readonly movementsService: CashMovementsService,
        private readonly reconciliationService: CashReconciliationService,
        private readonly authService: CashAuthorizationService,
        private readonly auditService: CashAuditService,
    ) { }

    /**
     * Valida que una sesión esté lista para cerrar
     * - Verifica que no haya transacciones pendientes de facturar
     * - Valida secuencia consecutiva de movimientos
     * - Verifica integridad matemática
     * - Detecta si hay cambios de turno sin completar
     */
    async validarPrecierre(sesionId: string, tenantId: string): Promise<PreCierreValidation> {
        this.logger.log(`Validando pre-cierre: sesión=${sesionId}`);

        const errores: string[] = [];
        const warnings: string[] = [];

        // Validación 1: Sesión existe y está abierta
        const { data: sesion, error: sesionError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('id, estado, congelada')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (sesionError || !sesion) {
            errores.push('Sesión de caja no encontrada');
            return { valido: false, errores, warnings };
        }

        if (sesion.estado !== 'ABIERTA') {
            errores.push(`La sesión ya está ${sesion.estado.toLowerCase()}`);
            return { valido: false, errores, warnings };
        }

        if (sesion.congelada) {
            errores.push('La caja está congelada (cambio de turno en proceso)');
            return { valido: false, errores, warnings };
        }

        // Validación 2: Q45 - Verificar que TODAS las ventas tengan CPE
        // 2a. Ventas con cpe_pendiente = true (en proceso de facturación)
        const { data: ventasPendientes, error: ventasError } = await this.supabase
            .getClient()
            .from('ventas_pos')
            .select('id, numero_ticket')
            .eq('sesion_caja_id', sesionId)
            .eq('cpe_pendiente', true)
            .limit(5);

        if (!ventasError && ventasPendientes && ventasPendientes.length > 0) {
            // CRÍTICO: Bloquear cierre si hay ventas pendientes de facturación
            errores.push(
                `Hay ${ventasPendientes.length} ventas pendientes de facturación electrónica. ` +
                `Tickets: ${ventasPendientes.map(v => v.numero_ticket).join(', ')}. ` +
                `Debe completar la facturación antes de cerrar.`,
            );
        }

        // 2b. Ventas sin CPE asociado (nunca se intentó facturar)
        const { data: ventasSinCpe, error: ventasSinCpeError } = await this.supabase
            .getClient()
            .from('ventas_pos')
            .select('id, numero_ticket, cpe_id')
            .eq('sesion_caja_id', sesionId)
            .eq('cpe_id', null)
            .eq('cpe_pendiente', false)
            .limit(10);

        if (!ventasSinCpeError && ventasSinCpe && ventasSinCpe.length > 0) {
            warnings.push(
                `Hay ${ventasSinCpe.length} ventas sin comprobante electrónico asociado. ` +
                `Tickets: ${ventasSinCpe.slice(0, 5).map(v => v.numero_ticket).join(', ')}${ventasSinCpe.length > 5 ? '...' : ''}. ` +
                `Se recomienda verificar antes del cierre.`,
            );
        }

        // Validación 3: Integridad de secuencia de movimientos
        const integridad = await this.movementsService.validarIntegridad(sesionId);
        if (!integridad.valido) {
            errores.push(`Integridad comprometida: ${integridad.errores.join(', ')}`);
        }

        // Validación 4: No hay cambios de turno sin completar
        const { data: cambiosPendientes } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('id')
            .eq('sesion_caja_id', sesionId)
            .eq('estado', 'EN_PROCESO')
            .maybeSingle();

        if (cambiosPendientes) {
            errores.push('Hay un cambio de turno en proceso. Debe completarse o cancelarse antes del cierre.');
        }

        // Validación 5: No hay retiros pendientes de conciliación
        const { data: retirosPendientes } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('id, monto')
            .eq('sesion_caja_id', sesionId)
            .eq('estado_conciliacion', 'PENDIENTE');

        if (retirosPendientes && retirosPendientes.length > 0) {
            const totalPendiente = retirosPendientes.reduce((sum, r) => sum + r.monto, 0);
            warnings.push(
                `Hay ${retirosPendientes.length} retiros pendientes de conciliación (Total: S/.${totalPendiente.toFixed(2)})`,
            );
        }

        const valido = errores.length === 0;

        this.logger.log(
            `Pre-cierre validado: ${valido ? 'OK' : 'FAIL'} - ${errores.length} errores, ${warnings.length} warnings`,
        );

        return { valido, errores, warnings };
    }

    /**
     * Cierra una sesión de caja con todas las validaciones y hash de integridad
     */
    async cerrarCaja(
        sesionId: string,
        datos: DatosCierre,
        userId: string,
        tenantId: string,
        supervisorId?: string,
        codigoAutorizacion?: string,
    ): Promise<SesionCajaCerrada> {
        this.logger.log(`Cerrando caja: sesión=${sesionId}, monto contado=S/.${datos.monto_contado}`);

        // Validación 1: Pre-cierre
        const validacionPrecierre = await this.validarPrecierre(sesionId, tenantId);
        if (!validacionPrecierre.valido) {
            await this.auditService.registrarEvento(
                CashAuditEvent.INTENTO_CIERRE_FALLIDO,
                tenantId,
                userId,
                sesionId,
                {
                    parametros: {
                        errores: validacionPrecierre.errores,
                        monto_contado: datos.monto_contado,
                    },
                    resultado: 'RECHAZADO',
                },
            );

            throw new BadRequestException(
                `No se puede cerrar la caja: ${validacionPrecierre.errores.join('. ')}`,
            );
        }

        // Validación 2: Validar cierre con denominaciones
        const resultadoCierre = await this.reconciliationService.validarCierre(
            sesionId,
            datos.monto_contado,
            datos.denominaciones,
            tenantId,
        );

        // Validación 3: Si diferencia > tolerancia, requiere supervisor
        if (resultadoCierre.requiere_supervisor) {
            const validacionAuth = await this.authService.validarDiferenciaCierre(
                resultadoCierre.diferencia,
                tenantId,
                supervisorId,
                codigoAutorizacion,
            );

            if (validacionAuth.requiere_autorizacion) {
                throw new BadRequestException(validacionAuth.mensaje);
            }
        }

        // Obtener todos los movimientos para calcular hash
        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);

        // Obtener datos actuales de sesión
        const { data: sesionActual } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesionActual) {
            throw new NotFoundException('Sesión no encontrada');
        }

        // Calcular hash de integridad
        const hashIntegridad = this.calcularHashIntegridad(sesionActual, movimientos, datos);

        // Preparar datos de cierre
        const horaCierre = new Date().toISOString();
        const datosCierre = {
            estado: 'CERRADA',
            hora_cierre: horaCierre,
            cerrado_por: userId,
            monto_esperado: resultadoCierre.saldo_teorico,
            monto_contado: datos.monto_contado,
            monto_cierre: datos.monto_contado, // Por compatibilidad
            diferencia: resultadoCierre.diferencia,
            denominaciones_cierre: datos.denominaciones,
            supervisor_cierre_id: supervisorId || null,
            razon_autorizacion: resultadoCierre.requiere_supervisor
                ? `Diferencia de S/.${Math.abs(resultadoCierre.diferencia).toFixed(2)} (${resultadoCierre.tipo_diferencia})`
                : null,
            hash_integridad: hashIntegridad,
            notas: datos.notas || null,
            updated_at: horaCierre,
        };

        // Cerrar sesión
        const { data: sesionCerrada, error: cierreError } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update(datosCierre)
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (cierreError) {
            this.logger.error(`Error cerrando sesión: ${cierreError.message}`, cierreError);
            throw new BadRequestException(`Error al cerrar caja: ${cierreError.message}`);
        }

        // Registrar en auditoría
        await this.auditService.registrarEvento(
            CashAuditEvent.INTENTO_CIERRE_FALLIDO, // Cambiar a EXITO en producción
            tenantId,
            userId,
            sesionId,
            {
                parametros: {
                    monto_esperado: resultadoCierre.saldo_teorico,
                    monto_contado: datos.monto_contado,
                    diferencia: resultadoCierre.diferencia,
                    tipo_diferencia: resultadoCierre.tipo_diferencia,
                    hash_integridad: hashIntegridad,
                    supervisor_id: supervisorId,
                },
                resultado: 'COMPLETADO',
            },
        );

        this.logger.log(
            `Caja cerrada exitosamente: sesión=${sesionId}, diferencia=S/.${resultadoCierre.diferencia.toFixed(2)}, hash=${hashIntegridad.substring(0, 16)}...`,
        );

        return sesionCerrada as SesionCajaCerrada;
    }

    /**
     * Calcula hash SHA-256 de integridad de toda la sesión
     * Incluye: sesión_id, apertura, todos los movimientos, cierre
     */
    private calcularHashIntegridad(
        sesion: any,
        movimientos: MovimientoCaja[],
        datosCierre: DatosCierre,
    ): string {
        // Construir string de datos para hashear
        const datosParaHash = [
            `SESION:${sesion.id}`,
            `APERTURA:${sesion.hora_apertura}`,
            `MONTO_INICIO:${sesion.monto_inicio}`,
            `CAJERO:${sesion.cajero_id || sesion.usuario_id}`,
            // Todos los movimientos en orden
            ...movimientos.map(
                (m) =>
                    `MOV:${m.secuencia}:${m.tipo_movimiento}:${m.monto}:${m.saldo_nuevo}:${m.timestamp}`,
            ),
            `CIERRE:${new Date().toISOString()}`,
            `MONTO_CONTADO:${datosCierre.monto_contado}`,
            `DENOMINACIONES:${JSON.stringify(datosCierre.denominaciones)}`,
        ].join('|');

        // Calcular SHA-256
        const hash = createHash('sha256').update(datosParaHash).digest('hex');

        return hash;
    }

    /**
     * Verifica la integridad criptográfica de una sesión cerrada
     * Recalcula el hash y lo compara con el almacenado
     */
    async verificarIntegridad(sesionId: string, tenantId: string): Promise<boolean> {
        this.logger.log(`Verificando integridad criptográfica: sesión=${sesionId}`);

        // Obtener sesión
        const { data: sesion } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesion) {
            throw new NotFoundException('Sesión no encontrada');
        }

        if (sesion.estado !== 'CERRADA') {
            throw new BadRequestException('Solo se puede verificar integridad de sesiones cerradas');
        }

        if (!sesion.hash_integridad) {
            this.logger.warn(`Sesión sin hash de integridad: ${sesionId}`);
            return false;
        }

        // Obtener movimientos
        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);

        // Reconstruir datos de cierre
        const datosCierre: DatosCierre = {
            monto_contado: sesion.monto_contado,
            denominaciones: sesion.denominaciones_cierre || { billetes: {}, monedas: {} },
            notas: sesion.notas,
        };

        // Recalcular hash
        const hashCalculado = this.calcularHashIntegridad(sesion, movimientos, datosCierre);

        // Comparar
        const integro = hashCalculado === sesion.hash_integridad;

        if (!integro) {
            this.logger.error(
                `¡INTEGRIDAD COMPROMETIDA! Sesión ${sesionId}: hash almacenado=${sesion.hash_integridad.substring(0, 16)}..., hash calculado=${hashCalculado.substring(0, 16)}...`,
            );

            // Registrar alerta crítica en auditoría
            await this.auditService.registrarEvento(
                CashAuditEvent.ANOMALIA_DETECTADA,
                tenantId,
                undefined,
                sesionId,
                {
                    parametros: {
                        tipo: 'INTEGRIDAD_COMPROMETIDA',
                        hash_almacenado: sesion.hash_integridad,
                        hash_calculado: hashCalculado,
                    },
                    resultado: 'ALERTA_CRITICA',
                },
            );
        }

        return integro;
    }

    /**
     * Obtiene el detalle completo de una sesión cerrada
     */
    async obtenerDetalleSesionCerrada(
        sesionId: string,
        tenantId: string,
    ): Promise<any> {
        const { data: sesion } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*, cajas(nombre, codigo)')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesion) {
            throw new NotFoundException('Sesión no encontrada');
        }

        // Obtener movimientos
        const movimientos = await this.movementsService.obtenerMovimientos(sesionId, tenantId);

        // Obtener retiros
        const { data: retiros } = await this.supabase
            .getClient()
            .from('retiros_caja')
            .select('*')
            .eq('sesion_caja_id', sesionId);

        // Obtener cambios de turno
        const { data: cambiosTurno } = await this.supabase
            .getClient()
            .from('cambios_turno')
            .select('*')
            .eq('sesion_caja_id', sesionId);

        // Calcular totales por tipo de movimiento
        const totalesPorTipo: Record<string, number> = {};
        movimientos.forEach((m) => {
            if (!totalesPorTipo[m.tipo_movimiento]) {
                totalesPorTipo[m.tipo_movimiento] = 0;
            }
            totalesPorTipo[m.tipo_movimiento] += m.monto;
        });

        return {
            sesion,
            movimientos,
            retiros: retiros || [],
            cambios_turno: cambiosTurno || [],
            totales_por_tipo: totalesPorTipo,
            integridad_verificada: sesion.estado === 'CERRADA'
                ? await this.verificarIntegridad(sesionId, tenantId)
                : null,
        };
    }

    /**
     * Reabre una sesión cerrada (solo ADMIN, requiere justificación fuerte)
     */
    async reabrirSesion(
        sesionId: string,
        adminId: string,
        razon: string,
        tenantId: string,
    ): Promise<void> {
        this.logger.warn(`REABRIENDO SESIÓN CERRADA: ${sesionId}, admin=${adminId}, razón=${razon}`);

        // Validar que adminId tenga rol ADMIN
        const { data: adminRoles } = await this.supabase
            .getClient()
            .from('user_roles')
            .select('roles(nombre)')
            .eq('usuario_sistema_id', adminId)
            .eq('tenant_id', tenantId);

        const roleNames = (adminRoles || [])
            .map((ur: any) => (ur.roles as any)?.nombre?.toUpperCase())
            .filter(Boolean);

        if (!roleNames.includes('ADMIN')) {
            throw new ForbiddenException('Solo usuarios con rol ADMIN pueden reabrir sesiones cerradas');
        }

        const { data: sesion } = await this.supabase
            .getClient()
            .from('sesiones_caja')
            .select('*')
            .eq('id', sesionId)
            .eq('tenant_id', tenantId)
            .single();

        if (!sesion) {
            throw new NotFoundException('Sesión no encontrada');
        }

        if (sesion.estado !== 'CERRADA') {
            throw new BadRequestException('Solo se pueden reabrir sesiones cerradas');
        }

        // Reabrir sesión (elimina hash, marca como modificada)
        await this.supabase
            .getClient()
            .from('sesiones_caja')
            .update({
                estado: 'ABIERTA',
                hash_integridad: null, // Se invalidará al volver a cerrar
                notas: `${sesion.notas || ''}\n\nREABIERTA POR ADMIN (${adminId}): ${razon}`,
            })
            .eq('id', sesionId);

        // Registrar en auditoría
        await this.auditService.registrarEvento(
            CashAuditEvent.APERTURA_FORZOSA,
            tenantId,
            adminId,
            sesionId,
            {
                parametros: { razon, sesion_original: sesion },
                resultado: 'REABIERTA',
            },
        );
    }
}
