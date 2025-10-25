import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SecurityDashboardService } from './security-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Controller('security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private readonly securityService: SecurityDashboardService) {}

  @Get('dashboard/stats')
  @UseGuards(SuperAdminGuard)
  async getDashboardStats(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.securityService.getDashboardStats(daysNum);
  }

  @Get('dashboard/violations-by-table')
  @UseGuards(SuperAdminGuard)
  async getViolationsByTable() {
    return this.securityService.getViolationsByTable();
  }

  @Get('dashboard/violations-recent')
  @UseGuards(SuperAdminGuard)
  async getRecentViolations(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.securityService.getRecentViolations(limitNum);
  }

  @Get('dashboard/violations-by-user')
  @UseGuards(SuperAdminGuard)
  async getViolationsByUser() {
    return this.securityService.getViolationsByUser();
  }

  @Get('dashboard/violations-hourly')
  @UseGuards(SuperAdminGuard)
  async getViolationsHourly() {
    return this.securityService.getViolationsHourly();
  }

  @Get('dashboard/alerts-recent')
  @UseGuards(SuperAdminGuard)
  async getRecentAlerts() {
    return this.securityService.getRecentAlerts();
  }

  @Get('dashboard/alerts-unacknowledged')
  @UseGuards(SuperAdminGuard)
  async getUnacknowledgedAlerts() {
    return this.securityService.getUnacknowledgedAlerts();
  }

  @Get('dashboard/security-report')
  @UseGuards(SuperAdminGuard)
  async getSecurityReport(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.securityService.getSecurityReport(daysNum);
  }
}
