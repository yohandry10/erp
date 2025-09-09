import { Module } from '@nestjs/common';
import { ComprasController } from '../compras.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ComprasController],
  providers: [
    EventBusService,
    InventoryIntegrationService
  ],
  exports: [
    EventBusService,
    InventoryIntegrationService
  ]
})
export class ComprasModule {}