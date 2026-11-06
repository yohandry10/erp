import { InternalServerErrorException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('D19 propaga la actualización explícita a métricas y actividades del tenant actual', async () => {
    const metrics = { getStats: jest.fn().mockResolvedValue({}), getActivities: jest.fn().mockResolvedValue([]) };
    const controller = new DashboardController(metrics as any);
    await controller.getStats('tenant-dashboard', 'true');
    await controller.getActivities('tenant-dashboard', 'true');
    expect(metrics.getStats).toHaveBeenCalledWith('tenant-dashboard', true);
    expect(metrics.getActivities).toHaveBeenCalledWith('tenant-dashboard', true);
  });
  it('no reemplaza fallas de métricas por ceros silenciosos', async () => {
    const dashboardMetrics = {
      getStats: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const controller = new DashboardController(dashboardMetrics as any);

    await expect(controller.getStats('tenant-dashboard')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
