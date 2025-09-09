import { Controller, Get } from '@nestjs/common';

@Controller('analytics')
export class AnalyticsController {
  @Get()
  getAnalytics() {
    return {
      message: 'Analytics endpoint - En desarrollo',
      data: []
    };
  }
}