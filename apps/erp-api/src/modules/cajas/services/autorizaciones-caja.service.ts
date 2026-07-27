import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface AutorizacionCaja {
    id: string;
    tenant_id: string;
    sesion_caja_id: string;
    tipo_autorizacion:
    | 'APERTURA_MONTO_BAJO'
    | 'APERTURA_MONTO_ALTO'
    | 'CIERRE_DIFERENCIA_ALTA'
    | 'RETIRO_MONTO_ALTO'
    | 'AJUSTE_MANUAL';
    monto_solicitado: number;
    monto_min_configurado?: number;
    monto_max_configurado?: number;
    supervisor_id: string;
    solicitante_id: string;
    razon_autorizacion: string;
    estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE';
    firma_digital?: string;
    ip_address?: string;
    dispositivo?: string;
    created_at: string;
}

export interface RegistrarAutorizacionDto {
    sesion_caja_id: string;
    tipo_autorizacion: AutorizacionCaja['tipo_autorizacion'];
    monto_solicitado: number;
    monto_min_configurado?: number;
    monto_max_configurado?: number;
    supervisor_id: string;
    solicitante_id: string;
    razon_autorizacion: string;
    ip_address?: string;
    dispositivo?: string;
}

/**
 * Servicio para gestionar autorizaciones de supervisor en operaciones de caja
 * 
 * Funcionalidades:
 * - Registrar autorizaciones con firma digital
 * - Consultar autorizaciones por período, supervisor, tipo
 * - Generar reportes de auditoría
 */
@Injectable()
export class AutorizacionesCajaService {
    private readonly logger = new Logger(AutorizacionesCajaService.name);
    private readonly SECRET: string;

    constructor(
        private readonly supabase: SupabaseService,
        private readonly configService: ConfigService,
    ) {
        const authSignatureSecret = this.configService.get<string>('AUTH_SIGNATURE_SECRET');
        if (!authSignatureSecret) {
            throw new Error('AUTH_SIGNATURE_SECRET is required for caja authorization signatures');
        }

        this.SECRET = authSignatureSecret;
    }

    /**
     * Registra una autorización de supervisor
     */
    async registrarAutorizacion(
        tenantId: string,
        dto: RegistrarAutorizacionDto,
    ): Promise<AutorizacionCaja> {
        // Validar que el supervisor existe
        const { data: supervisor, error: supError } = await this.supabase
            .getClient()
            .from('usuarios')
            .select('id, nombre, email')
            .eq('id', dto.supervisor_id)
            .eq('tenant_id', tenantId)
            .single();

        if (supError || !supervisor) {
            throw new NotFoundException(
                `Supervisor con ID ${dto.supervisor_id} no encontrado`,
            );
        }

        // Validar que el solicitante existe
        const { data: solicitante, error: solError } = await this.supabase
            .getClient()
            .from('usuarios')
            .select('id, nombre')
            .eq('id', dto.solicitante_id)
            .eq('tenant_id', tenantId)
            .single();

        if (solError || !solicitante) {
            throw new NotFoundException(
                `Solicitante con ID ${dto.solicitante_id} no encontrado`,
            );
        }

        // Generar firma digital
        const firma = this.generarFirmaDigital({
            tipo: dto.tipo_autorizacion,
            monto: dto.monto_solicitado,
            supervisor_id: dto.supervisor_id,
            timestamp: new Date(),
        });

        const autorizacionData = {
            tenant_id: tenantId,
            sesion_caja_id: dto.sesion_caja_id,
            tipo_autorizacion: dto.tipo_autorizacion,
            monto_solicitado: dto.monto_solicitado,
            monto_min_configurado: dto.monto_min_configurado || null,
            monto_max_configurado: dto.monto_max_configurado || null,
            supervisor_id: dto.supervisor_id,
            solicitante_id: dto.solicitante_id,
            razon_autorizacion: dto.razon_autorizacion,
            estado: 'APROBADO' as const,
            firma_digital: firma,
            ip_address: dto.ip_address || null,
            dispositivo: dto.dispositivo || null,
        };

        const { data, error } = await this.supabase
            .getClient()
            .from('autorizaciones_caja')
            .insert([autorizacionData])
            .select()
            .single();

        if (error) {
            this.logger.error(
                `Error al registrar autorización: ${error.message}`,
                error,
            );
            throw new Error(`Error al registrar autorización: ${error.message}`);
        }

        this.logger.log(
            `Autorización registrada: Tipo=${dto.tipo_autorizacion}, ` +
            `Monto=$${dto.monto_solicitado}, Supervisor=${supervisor.nombre}, ` +
            `Solicitante=${solicitante.nombre}`,
        );

        return data;
    }

    /**
     * Genera firma digital SHA-256 para no-repudio
     */
    generarFirmaDigital(params: {
        tipo: string;
        monto: number;
        supervisor_id: string;
        timestamp: Date;
    }): string {
        const data = [
            params.tipo,
            params.monto.toFixed(2),
            params.supervisor_id,
            Math.floor(params.timestamp.getTime() / 1000).toString(),
            this.SECRET,
        ].join('|');

        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Obtiene autorizaciones por período
     */
    async obtenerAutorizacionesPorPeriodo(
        tenantId: string,
        fechaDesde: string,
        fechaHasta: string,
        filters?: {
            tipo?: string;
            supervisor_id?: string;
            estado?: string;
        },
    ): Promise<AutorizacionCaja[]> {
        let query = this.supabase
            .getClient()
            .from('autorizaciones_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', fechaDesde)
            .lte('created_at', fechaHasta);

        if (filters?.tipo) {
            query = query.eq('tipo_autorizacion', filters.tipo);
        }

        if (filters?.supervisor_id) {
            query = query.eq('supervisor_id', filters.supervisor_id);
        }

        if (filters?.estado) {
            query = query.eq('estado', filters.estado);
        }

        const { data, error } = await query.order('created_at', {
            ascending: false,
        });

        if (error) {
            this.logger.error(`Error al obtener autorizaciones: ${error.message}`);
            throw new Error(`Error al obtener autorizaciones: ${error.message}`);
        }

        return data || [];
    }

    /**
     * Obtiene autorizaciones por supervisor
     */
    async obtenerAutorizacionesPorSupervisor(
        tenantId: string,
        supervisorId: string,
    ): Promise<AutorizacionCaja[]> {
        const { data, error } = await this.supabase
            .getClient()
            .from('autorizaciones_caja')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('supervisor_id', supervisorId)
            .order('created_at', { ascending: false });

        if (error) {
            this.logger.error(
                `Error al obtener autorizaciones por supervisor: ${error.message}`,
            );
            throw new Error(
                `Error al obtener autorizaciones por supervisor: ${error.message}`,
            );
        }

        return data || [];
    }

    /**
     * Genera reporte de autorizaciones
     */
    async generarReporteAutorizaciones(
        tenantId: string,
        fechaDesde: string,
        fechaHasta: string,
    ): Promise<{
        total: number;
        por_tipo: Record<string, number>;
        por_supervisor: Array<{ supervisor: string; count: number }>;
        autorizaciones: AutorizacionCaja[];
    }> {
        const autorizaciones = await this.obtenerAutorizacionesPorPeriodo(
            tenantId,
            fechaDesde,
            fechaHasta,
        );

        // Agrupar por tipo
        const por_tipo: Record<string, number> = {};
        autorizaciones.forEach((auth) => {
            por_tipo[auth.tipo_autorizacion] =
                (por_tipo[auth.tipo_autorizacion] || 0) + 1;
        });

        // Agrupar por supervisor
        const supervisorMap: Record<string, number> = {};
        autorizaciones.forEach((auth) => {
            supervisorMap[auth.supervisor_id] =
                (supervisorMap[auth.supervisor_id] || 0) + 1;
        });

        const por_supervisor = Object.entries(supervisorMap).map(
            ([supervisor, count]) => ({
                supervisor,
                count,
            }),
        );

        return {
            total: autorizaciones.length,
            por_tipo,
            por_supervisor,
            autorizaciones,
        };
    }

    /**
     * Valida integridad de firma digital
     */
    validarFirmaDigital(autorizacion: AutorizacionCaja): boolean {
        if (!autorizacion.firma_digital) {
            return false;
        }

        const firmaCalculada = this.generarFirmaDigital({
            tipo: autorizacion.tipo_autorizacion,
            monto: autorizacion.monto_solicitado,
            supervisor_id: autorizacion.supervisor_id,
            timestamp: new Date(autorizacion.created_at),
        });

        return firmaCalculada === autorizacion.firma_digital;
    }
}
