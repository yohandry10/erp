import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccountingBooksService } from './accounting-books.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { FinancialIntegrationService } from './financial-integration.service';
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
    AccountingBooksService,
    InventoryIntegrationService,
    FinancialIntegrationService
  ],
  exports: [
    EstadosFinancierosService,
    PeriodosService,
    AccountingBooksService,
    InventoryIntegrationService,
    FinancialIntegrationService
  ],
})
export class IntegrationModule {}
