import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SecurityDashboardService } from './security-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Controller('security')
@UseGuards(JwtAuthGuard, PermissionGuard, SuperAdminGuard) // HARDENING: seguridad requiere superadmin + permiso.
export class SecurityController {
  constructor(private readonly securityService: SecurityDashboardService) {}

  @Get('dashboard/stats')
  @RequirePermission('security.audit.read') // HARDENING: permisos granulares en dashboard.
  @UseGuards(SuperAdminGuard)
  async getDashboardStats(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.securityService.getDashboardStats(daysNum);
  }

  @Get('dashboard/violations-by-table')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getViolationsByTable() {
    return this.securityService.getViolationsByTable();
  }

  @Get('dashboard/violations-recent')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getRecentViolations(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.securityService.getRecentViolations(limitNum);
  }

  @Get('dashboard/violations-by-user')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getViolationsByUser() {
    return this.securityService.getViolationsByUser();
  }

  @Get('dashboard/violations-hourly')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getViolationsHourly() {
    return this.securityService.getViolationsHourly();
  }

  @Get('dashboard/alerts-recent')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getRecentAlerts() {
    return this.securityService.getRecentAlerts();
  }

  @Get('rls/violations')
  @RequirePermission('security.audit.read') // HARDENING: monitoreo RLS restringido.
  // HARDENING: endpoint explícito de monitoreo RLS solo para superadmin con permiso.
  @UseGuards(SuperAdminGuard)
  async listRlsViolations(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.securityService.getRecentViolations(limitNum);
  }

  @Get('dashboard/alerts-unacknowledged')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getUnacknowledgedAlerts() {
    return this.securityService.getUnacknowledgedAlerts();
  }

  @Get('dashboard/security-report')
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async getSecurityReport(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.securityService.getSecurityReport(daysNum);
  }
}
