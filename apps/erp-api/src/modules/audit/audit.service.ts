import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { AuditLogDto, AuditFiltersDto } from './dto';

export interface AuditLog {
  id?: string;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  changed_fields?: string[];
  user_id?: string;
  tenant_id: string;
  ip_address?: string;
  user_agent?: string;
  timestamp?: Date | string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private auditFailureCount = 0;

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Log an action to the audit_log table
   * Requirements: 8.1, 8.2
   */
  async logAction(auditLog: AuditLog): Promise<void> {
    if (!auditLog?.table_name || !auditLog?.operation || !auditLog?.tenant_id) {
      console.warn(
        '⚠️ [AUDIT] Acción ignorada: faltan campos obligatorios (table_name, operation o tenant_id)',
        auditLog,
      );
      return;
    }

    const client = this.supabase.getClient();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let normalizedUserId = auditLog.user_id || null;
    if (normalizedUserId && !uuidRegex.test(normalizedUserId)) {
      auditLog.metadata = {
        ...(auditLog.metadata || {}),
        actor_label: normalizedUserId,
      };
      normalizedUserId = null;
    }

    // Insert into audit_log table
    const { error } = await client
      .from('audit_log')
      .insert({
        table_name: auditLog.table_name,
        operation: auditLog.operation,
        record_id: auditLog.record_id || null,
        old_values: auditLog.old_values || null,
        new_values: auditLog.new_values || null,
        changed_fields: auditLog.changed_fields || null,
        user_id: normalizedUserId,
        tenant_id: auditLog.tenant_id,
        ip_address: auditLog.ip_address || null,
        user_agent: auditLog.user_agent || null,
        timestamp: auditLog.timestamp || new Date().toISOString(),
        metadata: auditLog.metadata || null
      });

    if (error) {
      this.auditFailureCount++;
      this.logger.error(
        `AUDIT_WRITE_FAILURE [count=${this.auditFailureCount}] ${auditLog.operation} on ${auditLog.table_name} ` +
        `tenant=${auditLog.tenant_id} record=${auditLog.record_id || 'N/A'}: ${error.message}`,
      );
      // Non-blocking: don't throw to avoid breaking the main operation.
      // The structured log above allows monitoring tools to alert on audit failures.
    } else {
      this.logger.log(`Action logged - ${auditLog.operation} on ${auditLog.table_name}`);
    }
  }

  /**
   * Register a change to an entity with detailed tracking
   * Requirements: 27.1, 27.2
   * 
   * @param entidad - Name of the entity/table being modified
   * @param accion - Action performed (INSERT, UPDATE, DELETE)
   * @param usuario - User ID who performed the action
   * @param cambios - Object containing old and new values
   * @param tenantId - Tenant ID for isolation
   * @param recordId - ID of the record being modified
   * @param metadata - Additional metadata about the operation
   */
  async registrarCambio(
    entidad: string,
    accion: 'INSERT' | 'UPDATE' | 'DELETE',
    usuario: string,
    cambios: {
      old?: Record<string, any>;
      new?: Record<string, any>;
    },
    tenantId: string,
    recordId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Calculate changed fields for UPDATE operations
    let changedFields: string[] | undefined;
    if (accion === 'UPDATE' && cambios.old && cambios.new) {
      changedFields = Object.keys(cambios.new).filter(
        key => JSON.stringify(cambios.old?.[key]) !== JSON.stringify(cambios.new?.[key])
      );
    }

    await this.logAction({
      table_name: entidad,
      operation: accion,
      record_id: recordId,
      old_values: cambios.old,
      new_values: cambios.new,
      changed_fields: changedFields,
      user_id: usuario,
      tenant_id: tenantId,
      metadata
    });
  }

  /**
   * Get audit logs with filters and pagination
   * Requirements: 8.6
   */
  async getAuditLogs(tenantId: string, filters?: AuditFiltersDto) {
    const client = this.supabase.getClient();
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;
    const fetchLimit = offset + limit;

    // Query audit_log filtered by tenant_id
    let query = client
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Support filter by table_name
    if (filters?.table_name) {
      query = query.eq('table_name', filters.table_name);
    }

    // Support filter by operation
    if (filters?.operation) {
      query = query.eq('operation', filters.operation);
    }

    // Support filter by user_id
    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    // Support date range filtering
    if (filters?.start_date) {
      query = query.gte('timestamp', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('timestamp', filters.end_date);
    }

    // Order by timestamp DESC and apply pagination
    query = query
      .order('timestamp', { ascending: false })
      .range(0, fetchLimit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      throw new BadRequestException('Error al obtener logs de auditoría');
    }

    const baseLogs = data || [];
    const supplemental = await this.getSupplementalAuditLogs(tenantId, filters, fetchLimit);
    const allLogs = [...baseLogs, ...supplemental.data]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    const pagedLogs = allLogs.slice(offset, offset + limit);
    const total = (count || 0) + supplemental.count;

    return {
      data: pagedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  private shouldIncludeSupplemental(filters: AuditFiltersDto | undefined, tableName: string): boolean {
    return !filters?.table_name || filters.table_name === tableName;
  }

  private applyDateFilters(query: any, filters?: AuditFiltersDto, column = 'timestamp') {
    if (filters?.start_date) query = query.gte(column, filters.start_date);
    if (filters?.end_date) query = query.lte(column, filters.end_date);
    return query;
  }

  private async getSupplementalAuditLogs(
    tenantId: string,
    filters: AuditFiltersDto | undefined,
    fetchLimit: number,
  ): Promise<{ data: AuditLog[]; count: number }> {
    const data: AuditLog[] = [];
    let count = 0;

    if (filters?.operation && filters.operation !== 'INSERT') {
      return { data, count };
    }

    const client = this.supabase.getClient();

    if (this.shouldIncludeSupplemental(filters, 'auth_login_attempts')) {
      try {
        let query = client
          .from('auth_login_attempts')
          .select('*', { count: 'exact' })
          .eq('tenant_id', tenantId);
        query = this.applyDateFilters(query, filters, 'created_at');
        query = query.order('created_at', { ascending: false }).range(0, fetchLimit - 1);
        const { data: attempts, error, count: attemptsCount } = await query;
        if (error) throw error;

        const usersByEmail = await this.getUsersByEmail(tenantId, attempts || []);
        const mapped = (attempts || [])
          .map((attempt: any) => this.mapLoginAttempt(attempt, tenantId, usersByEmail))
          .filter((log: AuditLog) => !filters?.user_id || log.user_id === filters.user_id);
        data.push(...mapped);
        count += filters?.user_id ? mapped.length : attemptsCount || mapped.length;
      } catch (error) {
        console.warn('⚠️ [AUDIT] No se pudieron cargar intentos de login en auditoría unificada:', error);
      }
    }

    if (this.shouldIncludeSupplemental(filters, 'caja_audit_log')) {
      try {
        let query = client
          .from('caja_audit_log')
          .select('*', { count: 'exact' })
          .eq('tenant_id', tenantId);
        if (filters?.user_id) query = query.eq('usuario_id', filters.user_id);
        query = this.applyDateFilters(query, filters, 'timestamp');
        query = query.order('timestamp', { ascending: false }).range(0, fetchLimit - 1);
        const { data: cashLogs, error, count: cashCount } = await query;
        if (error) throw error;
        const mapped = (cashLogs || []).map((item: any) => this.mapCashAuditLog(item, tenantId));
        data.push(...mapped);
        count += cashCount || mapped.length;
      } catch (error) {
        console.warn('⚠️ [AUDIT] No se pudieron cargar eventos de caja/POS en auditoría unificada:', error);
      }
    }

    if (this.shouldIncludeSupplemental(filters, 'eventos_pos')) {
      try {
        let query = client
          .from('eventos_pos')
          .select('*', { count: 'exact' })
          .eq('tenant_id', tenantId);
        if (filters?.user_id) query = query.eq('usuario_id', filters.user_id);
        query = this.applyDateFilters(query, filters, 'timestamp');
        query = query.order('timestamp', { ascending: false }).range(0, fetchLimit - 1);
        const { data: posLogs, error, count: posCount } = await query;
        if (error) throw error;
        const mapped = (posLogs || []).map((item: any) => this.mapPosEvent(item, tenantId));
        data.push(...mapped);
        count += posCount || mapped.length;
      } catch (error) {
        console.warn('⚠️ [AUDIT] No se pudieron cargar eventos POS en auditoría unificada:', error);
      }
    }

    if (this.shouldIncludeSupplemental(filters, 'integration_logs')) {
      try {
        if (filters?.user_id) {
          return { data, count };
        }
        let query = client
          .from('integration_logs')
          .select('*', { count: 'exact' })
          .eq('tenant_id', tenantId);
        query = this.applyDateFilters(query, filters, 'timestamp');
        query = query.order('timestamp', { ascending: false }).range(0, fetchLimit - 1);
        const { data: integrations, error, count: integrationsCount } = await query;
        if (error) throw error;
        const mapped = (integrations || []).map((item: any) => this.mapIntegrationLog(item, tenantId));
        data.push(...mapped);
        count += integrationsCount || mapped.length;
      } catch (error) {
        console.warn('⚠️ [AUDIT] No se pudieron cargar integraciones en auditoría unificada:', error);
      }
    }

    return { data, count };
  }

  private async getUsersByEmail(tenantId: string, loginAttempts: any[]): Promise<Map<string, string>> {
    const emails = Array.from(new Set(loginAttempts.map((attempt) => String(attempt.user_email || '').toLowerCase()).filter(Boolean)));
    if (emails.length === 0) return new Map();

    const { data, error } = await this.supabase
      .getClient()
      .from('usuarios_sistema')
      .select('id,email')
      .eq('tenant_id', tenantId)
      .in('email', emails);

    if (error) {
      console.warn('⚠️ [AUDIT] No se pudieron resolver usuarios de intentos de login:', error);
      return new Map();
    }

    return new Map((data || []).map((user: any) => [String(user.email || '').toLowerCase(), user.id]));
  }

  private mapLoginAttempt(attempt: any, tenantId: string, usersByEmail: Map<string, string>): AuditLog {
    const email = String(attempt.user_email || '').toLowerCase();
    return {
      id: attempt.id,
      table_name: 'auth_login_attempts',
      operation: 'INSERT',
      record_id: attempt.id,
      new_values: {
        email: attempt.user_email,
        success: attempt.success,
        failed_reason: attempt.failed_reason,
      },
      user_id: usersByEmail.get(email),
      tenant_id: tenantId,
      ip_address: attempt.ip_address,
      user_agent: attempt.user_agent,
      timestamp: attempt.created_at,
      metadata: {
        source: 'auth_login_attempts',
        accion: attempt.success ? 'LOGIN_OK' : 'LOGIN_FALLIDO',
      },
    };
  }

  private mapCashAuditLog(item: any, tenantId: string): AuditLog {
    return {
      id: item.id,
      table_name: 'caja_audit_log',
      operation: 'INSERT',
      record_id: item.id,
      new_values: {
        evento: item.evento,
        sesion_caja_id: item.sesion_caja_id,
        resultado: item.resultado,
        parametros: item.parametros,
      },
      user_id: item.usuario_id,
      tenant_id: tenantId,
      ip_address: item.ip_address,
      user_agent: item.user_agent,
      timestamp: item.timestamp || item.created_at,
      metadata: {
        source: 'caja_audit_log',
        accion: item.evento,
        riesgo: item.riesgo,
      },
    };
  }

  private mapPosEvent(item: any, tenantId: string): AuditLog {
    return {
      id: item.id,
      table_name: 'eventos_pos',
      operation: 'INSERT',
      record_id: item.venta_id || item.id,
      new_values: {
        tipo_evento: item.tipo_evento,
        subtipo: item.subtipo,
        venta_id: item.venta_id,
        producto_id: item.producto_id,
        datos: item.datos,
      },
      user_id: item.usuario_id,
      tenant_id: tenantId,
      ip_address: item.ip_address,
      user_agent: item.user_agent,
      timestamp: item.timestamp || item.created_at,
      metadata: {
        source: 'eventos_pos',
        accion: item.tipo_evento,
        riesgo_nivel: item.riesgo_nivel,
        sesion_caja_id: item.sesion_caja_id,
      },
    };
  }

  private mapIntegrationLog(item: any, tenantId: string): AuditLog {
    return {
      id: item.id,
      table_name: 'integration_logs',
      operation: 'INSERT',
      record_id: item.correlacion_id || item.id,
      new_values: {
        servicio: item.servicio,
        operacion: item.operacion || item.action,
        status: item.status,
        status_code: item.status_code,
        correlacion_id: item.correlacion_id,
        correlacion_tipo: item.correlacion_tipo,
      },
      tenant_id: tenantId,
      timestamp: item.timestamp || item.created_at,
      metadata: {
        source: 'integration_logs',
        error_message: item.error_message,
        duration_ms: item.duration_ms,
      },
    };
  }

  /**
   * Get audit logs for a specific user
   * Requirements: 8.6
   */
  async getUserAuditLogs(tenantId: string, userId: string) {
    const client = this.supabase.getClient();

    // Query audit_log filtered by tenant_id and user_id
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching user audit logs:', error);
      throw new BadRequestException('Error al obtener historial de auditoría del usuario');
    }

    return data || [];
  }

  /**
   * Get audit logs for a specific resource
   * Requirements: 8.6
   */
  async getResourceAuditLogs(tenantId: string, tableName: string, resourceId: string) {
    const client = this.supabase.getClient();

    // Query audit_log for specific resource
    // We need to check both old_values and new_values for the resource ID
    const { data, error } = await client
      .from('audit_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_name', tableName)
      .or(`old_values->>id.eq.${resourceId},new_values->>id.eq.${resourceId}`)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching resource audit logs:', error);
      throw new BadRequestException('Error al obtener historial de cambios del recurso');
    }

    return data || [];
  }

  /**
   * Log an integration call to external services (SUNAT, GRE, etc.)
   * Requirements: 27.3, 27.5
   * 
   * @param servicio - Name of the external service (SUNAT, GRE, etc.)
   * @param operacion - Operation performed (enviar_factura, consultar_ruc, etc.)
   * @param request - Request data (will be summarized to remove sensitive info)
   * @param response - Response data (will be summarized)
   * @param correlacion - Correlation info to link with entities (pedido_id, factura_id, etc.)
   * @param tenantId - Tenant ID for isolation
   * @param status - Status of the integration call
   * @param durationMs - Duration of the call in milliseconds
   * @param metadata - Additional metadata
   */
  async logIntegracion(
    servicio: string,
    operacion: string,
    request: any,
    response: any,
    correlacion: {
      id?: string;
      tipo?: string;
    },
    tenantId: string,
    status: 'SUCCESS' | 'ERROR' | 'PENDING' | 'TIMEOUT' = 'SUCCESS',
    durationMs?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const client = this.supabase.getClient();

    // Summarize request (remove sensitive data)
    const requestSummary = this.summarizeData(request, [
      'password',
      'token',
      'api_key',
      'secret',
      'certificado',
      'private_key'
    ]);

    // Summarize response (remove sensitive data)
    const responseSummary = this.summarizeData(response, [
      'password',
      'token',
      'api_key',
      'secret'
    ]);

    // Extract status code and error message from response
    let statusCode: number | undefined;
    let errorMessage: string | undefined;

    if (response) {
      statusCode = response.status || response.statusCode || response.codigo;
      if (status === 'ERROR') {
        errorMessage = response.error || response.mensaje || response.message || 'Unknown error';
      }
    }

    // Insert into integration_logs table
    const { error } = await client
      .from('integration_logs')
      .insert({
        tenant_id: tenantId,
        servicio,
        operacion,
        correlacion_id: correlacion.id || null,
        correlacion_tipo: correlacion.tipo || null,
        request_summary: requestSummary,
        response_summary: responseSummary,
        status,
        status_code: statusCode,
        error_message: errorMessage,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        metadata: metadata || null
      });

    if (error) {
      console.error('Error logging integration:', error);
      // Don't throw error to avoid breaking the main operation
    } else {
      console.log(`🔗 [INTEGRATION] ${servicio}.${operacion} - ${status} (${durationMs}ms)`);
    }
  }

  /**
   * Get integration logs with filters
   * Requirements: 27.3, 27.5
   */
  async getIntegrationLogs(
    tenantId: string,
    filters?: {
      servicio?: string;
      correlacion_id?: string;
      correlacion_tipo?: string;
      status?: string;
      start_date?: string;
      end_date?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const client = this.supabase.getClient();
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    let query = client
      .from('integration_logs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filters?.servicio) {
      query = query.eq('servicio', filters.servicio);
    }

    if (filters?.correlacion_id) {
      query = query.eq('correlacion_id', filters.correlacion_id);
    }

    if (filters?.correlacion_tipo) {
      query = query.eq('correlacion_tipo', filters.correlacion_tipo);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.start_date) {
      query = query.gte('timestamp', filters.start_date);
    }

    if (filters?.end_date) {
      query = query.lte('timestamp', filters.end_date);
    }

    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching integration logs:', error);
      throw new BadRequestException('Error al obtener logs de integración');
    }

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Helper method to summarize data and remove sensitive fields
   */
  private summarizeData(data: any, sensitiveFields: string[]): any {
    if (!data) return null;

    // If it's a primitive type, return as is
    if (typeof data !== 'object') return data;

    // Clone the data to avoid modifying the original
    const summary = JSON.parse(JSON.stringify(data));

    // Remove sensitive fields recursively
    const removeSensitiveFields = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;

      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          removeSensitiveFields(obj[key]);
        }
      }
    };

    removeSensitiveFields(summary);

    // Limit size of summary (max 5000 chars when stringified)
    const stringified = JSON.stringify(summary);
    if (stringified.length > 5000) {
      return {
        _truncated: true,
        _original_size: stringified.length,
        data: JSON.parse(stringified.substring(0, 5000))
      };
    }

    return summary;
  }
}
