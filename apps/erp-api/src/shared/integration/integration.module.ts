import { Module } from '@nestjs/common';
import { EventBusService } from '../events/event-bus.service';
import { AccountingIntegrationService } from './accounting-integration.service';

import { InventoryIntegrationService } from './inventory-integration.service';
import { DashboardIntegrationService } from './dashboard-integration.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [
    EventBusService,
    AccountingIntegrationService,
    InventoryIntegrationService,
    DashboardIntegrationService,
  ],
  exports: [
    EventBusService,
    AccountingIntegrationService,
    InventoryIntegrationService,
    DashboardIntegrationService,
  ],
})
export class IntegrationModule {} 