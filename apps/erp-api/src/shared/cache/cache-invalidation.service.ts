import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Invalida el cache del dashboard para un tenant específico
   */
  async invalidateDashboardCache(tenantId: string): Promise<void> {
    try {
      // Invalidar estadísticas del dashboard
      const statsPattern = `dashboard:stats:${tenantId}:*`;
      const statsDeleted = await this.cacheService.delPattern(statsPattern);

      // Invalidar actividades del dashboard
      const activitiesKey = `dashboard:activities:${tenantId}`;
      await this.cacheService.del(activitiesKey);

      if (statsDeleted > 0) {
        this.logger.log(`🗑️ [CacheInvalidation] Dashboard cache invalidado para tenant ${tenantId}: ${statsDeleted} entradas de estadísticas`);
      } else {
        this.logger.debug(`🗑️ [CacheInvalidation] Dashboard cache invalidado para tenant ${tenantId}`);
      }
    } catch (error) {
      this.logger.error(`❌ [CacheInvalidation] Error invalidando dashboard cache para tenant ${tenantId}:`, error);
    }
  }

  /**
   * Invalida el cache cuando se crea una nueva factura/CPE
   */
  async onCpeCreated(tenantId: string): Promise<void> {
    this.logger.debug(`📄 [CacheInvalidation] CPE creado, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se crea una nueva orden de compra
   */
  async onOrdenCompraCreated(tenantId: string): Promise<void> {
    this.logger.debug(`🛒 [CacheInvalidation] Orden de compra creada, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se crea un nuevo documento
   */
  async onDocumentoCreated(tenantId: string): Promise<void> {
    this.logger.debug(`📋 [CacheInvalidation] Documento creado, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se crea una nueva guía de remisión (GRE)
   */
  async onGreCreated(tenantId: string): Promise<void> {
    this.logger.debug(`🚚 [CacheInvalidation] GRE creada, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se crea una nueva cotización
   */
  async onCotizacionCreated(tenantId: string): Promise<void> {
    this.logger.debug(`💰 [CacheInvalidation] Cotización creada, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se crea un nuevo pedido de venta
   */
  async onPedidoVentaCreated(tenantId: string): Promise<void> {
    this.logger.debug(`📦 [CacheInvalidation] Pedido de venta creado, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida el cache cuando se actualiza el inventario
   */
  async onInventarioUpdated(tenantId: string): Promise<void> {
    this.logger.debug(`📊 [CacheInvalidation] Inventario actualizado, invalidando cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
  }

  /**
   * Invalida todo el cache relacionado con un tenant
   */
  async invalidateAllTenantCache(tenantId: string): Promise<void> {
    this.logger.log(`🗑️ [CacheInvalidation] Invalidando todo el cache para tenant ${tenantId}`);
    await this.invalidateDashboardCache(tenantId);
    await Promise.all([
      this.cacheService.del(`config:country:${tenantId}`),
      this.cacheService.del(`config:status:${tenantId}`),
    ]);
  }
}

