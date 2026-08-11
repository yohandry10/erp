import { InternalServerErrorException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('no reemplaza fallas de métricas por ceros silenciosos', async () => {
    const dashboardMetrics = {
      getStats: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const controller = new DashboardController(dashboardMetrics as any);

    await expect(controller.getStats('tenant-dashboard')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
