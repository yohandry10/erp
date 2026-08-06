import { CacheInvalidationService } from './cache-invalidation.service';

describe('CacheInvalidationService', () => {
  it('invalida dashboard y contexto de configuración del tenant', async () => {
    const cache = {
      delPattern: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CacheInvalidationService(cache as any);

    await service.invalidateAllTenantCache('tenant-1');

    expect(cache.delPattern).toHaveBeenCalledWith('dashboard:stats:tenant-1:*');
    expect(cache.del).toHaveBeenCalledWith('dashboard:activities:tenant-1');
    expect(cache.del).toHaveBeenCalledWith('config:country:tenant-1');
    expect(cache.del).toHaveBeenCalledWith('config:status:tenant-1');
  });
});
