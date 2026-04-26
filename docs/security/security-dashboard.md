# Security Dashboard - RLS Monitoring

## Overview

The Security Dashboard provides real-time monitoring and visualization of Row-Level Security (RLS) violations and security alerts across the multi-tenant ERP system.

## Access

**URL:** `/superadmin/dashboard/security`

**Permissions:** Super Admin only

## Features

### 1. Key Metrics (Statistics Cards)

- **Total Violations**: Total number of RLS violations in the selected period
- **Critical Violations**: Number of critical severity violations
- **Affected Users**: Unique users who triggered violations
- **Affected Tables**: Number of database tables with violation attempts
- **Total Alerts**: Total security alerts generated
- **Pending Alerts**: Unacknowledged alerts requiring attention

### 2. Period Selection

Users can filter data by time period:
- Last 24 hours
- Last 7 days (default)
- Last 30 days
- Last 90 days

### 3. Pending Alerts Section

Displays unacknowledged security alerts with:
- Timestamp
- Alert name
- Severity level (CRITICAL, WARNING)
- Alert message
- Affected table
- User email

### 4. Violations by Table

Shows aggregated violation statistics per database table:
- Table name
- Total violations
- Critical violations count
- Cross-tenant violations
- Missing tenant violations
- Unique users involved
- Last violation timestamp

### 5. Recent Violations

Lists the most recent RLS violations with details:
- Timestamp
- Table name
- Operation (INSERT, UPDATE, DELETE, SELECT)
- Violation type (Cross-Tenant, Missing Tenant, Invalid Tenant)
- Severity
- User email
- IP address

## Backend API Endpoints

All endpoints require Super Admin authentication.

### GET `/security/dashboard/stats`

Returns dashboard statistics.

**Query Parameters:**
- `days` (optional): Number of days to include (default: 7)

**Response:**
```json
{
  "period": "7 días",
  "totalViolations": 42,
  "criticalViolations": 15,
  "uniqueUsers": 8,
  "tablesAffected": 12,
  "totalAlerts": 20,
  "unacknowledgedAlerts": 3
}
```

### GET `/security/dashboard/violations-by-table`

Returns violations grouped by table.

**Response:** Array of violation statistics per table

### GET `/security/dashboard/violations-recent`

Returns recent violations.

**Query Parameters:**
- `limit` (optional): Maximum number of records (default: 50)

**Response:** Array of recent violation records

### GET `/security/dashboard/violations-by-user`

Returns violations grouped by user.

**Response:** Array of violation statistics per user

### GET `/security/dashboard/violations-hourly`

Returns hourly violation trends.

**Response:** Array of hourly aggregated violations

### GET `/security/dashboard/alerts-recent`

Returns recent alerts (last 24 hours).

**Response:** Array of recent alerts

### GET `/security/dashboard/alerts-unacknowledged`

Returns unacknowledged alerts.

**Response:** Array of pending alerts

### GET `/security/dashboard/security-report`

Generates a comprehensive security report.

**Query Parameters:**
- `days` (optional): Number of days to include (default: 7)

**Response:** Object with security metrics

## Database Views Used

The dashboard leverages the following database views created in migration 033:

- `v_rls_violations_by_table`: Aggregated violations per table
- `v_rls_violations_recent`: Recent violations (last 24 hours)
- `v_rls_violations_by_user`: Violations grouped by user
- `v_rls_violations_hourly`: Hourly violation trends
- `v_rls_alerts_recent`: Recent alerts
- `v_rls_alerts_unacknowledged`: Pending alerts

## Security Considerations

1. **Access Control**: Dashboard is restricted to Super Admin users only
2. **Data Sensitivity**: Violation logs contain sensitive information (user emails, IP addresses)
3. **Performance**: Queries are optimized with database indexes
4. **Real-time**: Data refreshes when period is changed

## Usage Guidelines

### For Security Monitoring

1. Check the dashboard daily for unacknowledged alerts
2. Investigate critical violations immediately
3. Monitor trends in the "Violations by Table" section
4. Review users with repeated violations

### For Incident Response

1. Use the "Recent Violations" table to identify active threats
2. Check IP addresses for suspicious patterns
3. Correlate violations with user activity
4. Document findings for security audits

### For Compliance

1. Export violation data for audit reports
2. Track RLS policy effectiveness
3. Demonstrate security controls to auditors
4. Maintain violation logs per retention policy (90 days default)

## Troubleshooting

### No Data Displayed

- Verify migrations 033 and 034 have been executed
- Check database permissions for views
- Ensure audit triggers are active on tables

### Performance Issues

- Reduce the selected time period
- Check database indexes on `rls_audit_log` table
- Review query execution plans

### Missing Violations

- Verify RLS policies are enabled on tables
- Check audit triggers are not disabled
- Ensure `app.current_tenant_id` is set in sessions

## Related Documentation

- [RLS Policies](./rls-policies.md)
- [Migration 033: Audit RLS Violations](../../supabase/migrations/033_audit_rls_violations.sql)
- [Migration 034: Configure RLS Alerts](../../supabase/migrations/034_configure_rls_alerts.sql)

## Future Enhancements

- [ ] Export violations to CSV/PDF
- [ ] Email notifications for critical alerts
- [ ] Violation trend charts and graphs
- [ ] Automated incident response workflows
- [ ] Integration with SIEM systems
