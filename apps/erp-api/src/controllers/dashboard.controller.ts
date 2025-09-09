import { Controller, Get } from '@nestjs/common';

@Controller('dashboard')
export class DashboardController {
  @Get()
  getDashboard() {
    return {
      message: 'Dashboard endpoint - En desarrollo',
      data: {}
    };
  }
}