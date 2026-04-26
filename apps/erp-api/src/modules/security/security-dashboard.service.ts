import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class SecurityDashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  async getDashboardStats(days: number = 7) {
    const client = this.supabase.getClient();

    // Get total violations
    const { count: totalViolations } = await client
      .from('rls_audit_log')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    // Get critical violations
    const { count: criticalViolations } = await client
      .from('rls_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'CRITICAL')
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    // Get unique users
    const { data: uniqueUsersData } = await client
      .from('rls_audit_log')
      .select('user_id')
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    const uniqueUsers = new Set(uniqueUsersData?.map(v => v.user_id).filter(Boolean)).size;

    // Get tables affected
    const { data: tablesData } = await client
      .from('rls_audit_log')
      .select('table_name')
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    const tablesAffected = new Set(tablesData?.map(v => v.table_name)).size;

    // Get total alerts
    const { count: totalAlerts } = await client
      .from('rls_alert_history')
      .select('*', { count: 'exact', head: true })
      .gte('triggered_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    // Get unacknowledged alerts
    const { count: unacknowledgedAlerts } = await client
      .from('rls_alert_history')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    return {
      period: `${days} días`,
      totalViolations: totalViolations || 0,
      criticalViolations: criticalViolations || 0,
      uniqueUsers,
      tablesAffected,
      totalAlerts: totalAlerts || 0,
      unacknowledgedAlerts: unacknowledgedAlerts || 0,
    };
  }

  async getViolationsByTable() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_by_table')
      .select('*')
      .order('total_violations', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  }

  async getRecentViolations(limit: number = 50) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('rls_audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async getViolationsByUser() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_by_user')
      .select('*')
      .order('total_violations', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  }

  async getViolationsHourly() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_violations_hourly')
      .select('*')
      .order('hour', { ascending: false })
      .limit(168); // 7 days * 24 hours

    if (error) throw error;
    return data || [];
  }

  async getRecentAlerts() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_alerts_recent')
      .select('*')
      .order('triggered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getUnacknowledgedAlerts() {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('v_rls_alerts_unacknowledged')
      .select('*')
      .order('triggered_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getSecurityReport(days: number = 7) {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .rpc('generate_rls_security_report', { p_days: days });

    if (error) throw error;
    
    // Convert array of {metric, value} to object
    const report: Record<string, string> = {};
    if (data) {
      data.forEach((row: { metric: string; value: string }) => {
        report[row.metric] = row.value;
      });
    }
    
    return report;
  }
}
