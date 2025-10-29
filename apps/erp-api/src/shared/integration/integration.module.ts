import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { EventBusService } from '../events/event-bus.service';
import { AccountingEntriesService } from './accounting-entries.service';
import { AccountingBooksService } from './accounting-books.service';
import { AccountingReportsService } from './accounting-reports.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { DashboardIntegrationService } from './dashboard-integration.service';
import { FinancialIntegrationService } from './financial-integration.service';
import { RrhhAccountingIntegrationService } from '../../modules/rrhh/rrhh-accounting-integration.service';
import { PeriodosService } from '../../modules/contabilidad/services/periodos.service';

@Module({
  imports: [SupabaseModule],
  providers: [
    EventBusService,
    PeriodosService, // Add PeriodosService here to make it available
    AccountingEntriesService,
    AccountingBooksService,
    AccountingReportsService,
    InventoryIntegrationService,
    DashboardIntegrationService,
    FinancialIntegrationService,
    RrhhAccountingIntegrationService
  ],
  exports: [
    EventBusService,
    PeriodosService, // Export it as well
    AccountingEntriesService,
    AccountingBooksService,
    AccountingReportsService,
    InventoryIntegrationService,
    DashboardIntegrationService,
    FinancialIntegrationService,
    RrhhAccountingIntegrationService
  ],
})
export class IntegrationModule {}