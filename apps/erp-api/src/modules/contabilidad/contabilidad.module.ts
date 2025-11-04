import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ContabilidadController } from '../contabilidad.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { PeriodosService } from './services/periodos.service';
import { AsientosGeneratorService } from './services/asientos-generator.service';
import { AsientosService } from './services/asientos.service';
import { PlanCuentasService } from './services/plan-cuentas.service';
import { OutboxEventsService } from './services/outbox-events.service';
import { EstadosFinancierosService } from './services/estados-financieros.service';
import { PresupuestosService } from './services/presupuestos.service';
import { CentrosCostoService } from './services/centros-costo.service';
import { ContabilidadEventsListener } from './listeners/contabilidad-events.listener';
import { EventBusService } from '../../shared/events/event-bus.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, ScheduleModule.forRoot(), AuthModule, PermissionsModule],
  controllers: [ContabilidadController],
  providers: [
    EstadosFinancierosService,
    PeriodosService,
    AsientosGeneratorService,
    AsientosService,
    PlanCuentasService,
    OutboxEventsService,
    PresupuestosService,
    CentrosCostoService,
    ContabilidadEventsListener,
    {
      provide: 'EstadosFinancierosService',
      useExisting: EstadosFinancierosService
    }
  ],
  exports: [
    PeriodosService,
    AsientosGeneratorService,
    AsientosService,
    PlanCuentasService,
    OutboxEventsService,
    EstadosFinancierosService,
    PresupuestosService,
    CentrosCostoService
  ]
})
export class ContabilidadModule {}