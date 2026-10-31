import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class SecurityDashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  async getDashboardStats(days: number = 7) {
    const client = this.supabase.getClient();
    // SQL counts DISTINCT across the complete period, beyond PostgREST's row cap.
    const report = await this.getSecurityReport(days);
    const metric = (name: string): number => {
      const value = report[name];
      if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
        throw new ServiceUnavailableException('No se pudieron consultar las estadísticas de seguridad');
      }
      return Number(value);
    };
    const { count: totalAlerts, error: alertsError } = await client
      .from('rls_alert_history')
      .select('*', { count: 'exact', head: true })
      .gte('triggered_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    const { count: unacknowledgedAlerts, error: pendingError } = await client
      .from('rls_alert_history')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    if (alertsError || pendingError || !Number.isSafeInteger(totalAlerts) || !Number.isSafeInteger(unacknowledgedAlerts)
      || totalAlerts! < 0 || unacknowledgedAlerts! < 0) {
      throw new ServiceUnavailableException('No se pudieron consultar las alertas de seguridad');
    }

    return {
      period: `${days} días`,
      totalViolations: metric('total_violations'),
      criticalViolations: metric('critical_violations'),
      uniqueUsers: metric('unique_users'),
      tablesAffected: metric('tables_affected'),
      totalAlerts,
      unacknowledgedAlerts,
    };
  }

  async getViolationsByTable() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_by_table')
      .select('*')
      .order('total_violations', { ascending: false })
      .limit(20);

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las violaciones de seguridad');
    return data;
  }

  async getRecentViolations(limit: number = 50) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('rls_audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las violaciones de seguridad');
    return data;
  }

  async getViolationsByUser() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_by_user')
      .select('*')
      .order('total_violations', { ascending: false })
      .limit(20);

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las violaciones de seguridad');
    return data;
  }

  async getViolationsHourly() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_hourly')
      .select('*')
      .order('hour', { ascending: false })
      .limit(168); // 7 days * 24 hours

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las violaciones de seguridad');
    return data;
  }

  async getRecentAlerts() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_alerts_recent')
      .select('*')
      .order('triggered_at', { ascending: false });

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las alertas de seguridad');
    return data;
  }

  async getUnacknowledgedAlerts() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_alerts_unacknowledged')
      .select('*')
      .order('triggered_at', { ascending: false });

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudieron consultar las alertas de seguridad');
    return data;
  }

  async getSecurityReport(days: number = 7) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .rpc('generate_rls_security_report', { p_days: days });

    if (error || !Array.isArray(data)) throw new ServiceUnavailableException('No se pudo consultar el informe de seguridad');
    
    // Reject a partial or contradictory report before publishing any metric.
    const report: Record<string, string> = {};
    const names = new Set(['periodo', 'total_violations', 'critical_violations', 'unique_users', 'tables_affected']);
    for (const row of data) {
      if (!row || !names.has(row.metric) || Object.prototype.hasOwnProperty.call(report, row.metric)
        || typeof row.value !== 'string' || !/^\d+$/.test(row.value) || !Number.isSafeInteger(Number(row.value))) {
        throw new ServiceUnavailableException('El informe de seguridad está incompleto');
      }
      report[row.metric] = row.value;
    }
    if (Object.keys(report).length !== names.size) throw new ServiceUnavailableException('El informe de seguridad está incompleto');
    
    return report;
  }
}
