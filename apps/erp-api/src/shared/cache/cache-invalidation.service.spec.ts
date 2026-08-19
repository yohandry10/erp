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

  // La configuración fiscal se cachea cinco minutos en memoria del proceso.
  // `invalidateTenantCache` existía sin que nadie lo llamara, así que cambiar la
  // tasa o el país de un contribuyente tardaba hasta cinco minutos en surtir
  // efecto, y por cada instancia del API.
  it('invalida también el cache de configuración fiscal del tenant', async () => {
    const cache = {
      delPattern: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const taxCalculator = { invalidateTenantCache: jest.fn() };
    const service = new CacheInvalidationService(cache as any, taxCalculator as any);

    await service.invalidateAllTenantCache('tenant-2');

    expect(taxCalculator.invalidateTenantCache).toHaveBeenCalledWith('tenant-2');
  });

  it('no falla si se construye sin el calculador fiscal', async () => {
    const cache = {
      delPattern: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CacheInvalidationService(cache as any);

    await expect(service.invalidateAllTenantCache('tenant-3')).resolves.toBeUndefined();
  });
});
