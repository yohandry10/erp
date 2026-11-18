import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SecurityDashboardService } from './security-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PlatformDiagnosticsService } from './platform-diagnostics.service';
import { CorreoPruebaDto } from './platform-diagnostics.dto';

function queryInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) {
    throw new BadRequestException('El período o límite de seguridad no es válido');
  }
  return Number(value);
}

@Controller('security')
@UseGuards(JwtAuthGuard, PermissionGuard, SuperAdminGuard) // HARDENING: seguridad requiere superadmin + permiso.
export class SecurityController {
  constructor(
    private readonly securityService: SecurityDashboardService,
    private readonly diagnostics: PlatformDiagnosticsService,
  ) {}

  @Get('dashboard/stats')
  @RequirePermission('security.audit.read') // HARDENING: permisos granulares en dashboard.
  @UseGuards(SuperAdminGuard)
  async getDashboardStats(@Query('days') days?: string) {
    const daysNum = queryInteger(days, 7, 365);
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
    const limitNum = queryInteger(limit, 50, 1000);
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
    const limitNum = queryInteger(limit, 100, 1000);
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
    const daysNum = queryInteger(days, 7, 365);
    return this.securityService.getSecurityReport(daysNum);
  }

  // Diagnóstico de plataforma: la frontera es SuperAdminGuard; el permiso de
  // lectura de auditoría es el único del dominio de seguridad.
  @Post('diagnostico/correo')
  @HttpCode(200)
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async enviarCorreoPrueba(@Body() body: CorreoPruebaDto) {
    return this.diagnostics.enviarCorreoPrueba(body.destinatario);
  }

  @Post('diagnostico/sentry')
  @HttpCode(200)
  @RequirePermission('security.audit.read')
  @UseGuards(SuperAdminGuard)
  async enviarEventoSentry() {
    return this.diagnostics.enviarEventoSentry();
  }
}
