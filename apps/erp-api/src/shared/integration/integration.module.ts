import { Module, forwardRef } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccountingEntriesService } from './accounting-entries.service';
import { AccountingBooksService } from './accounting-books.service';
import { AccountingReportsService } from './accounting-reports.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { DashboardIntegrationService } from './dashboard-integration.service';
import { FinancialIntegrationService } from './financial-integration.service';
import { RrhhAccountingIntegrationService } from '../../modules/rrhh/rrhh-accounting-integration.service';
import { PeriodosService } from '../../modules/contabilidad/services/periodos.service';
import { EstadosFinancierosService } from '../../modules/contabilidad/services/estados-financieros.service';

@Module({
  imports: [
    SupabaseModule,
  ],
  providers: [
    EstadosFinancierosService,
    {
      provide: 'EstadosFinancierosService',
      useExisting: EstadosFinancierosService
    },
    PeriodosService,
    AccountingEntriesService,
    AccountingBooksService,
    AccountingReportsService,
    InventoryIntegrationService,
    DashboardIntegrationService,
    FinancialIntegrationService,
    RrhhAccountingIntegrationService
  ],
  exports: [
    EstadosFinancierosService,
    PeriodosService,
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