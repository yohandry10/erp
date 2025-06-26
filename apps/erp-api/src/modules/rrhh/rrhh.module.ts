import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { RrhhAccountingIntegrationService } from './rrhh-accounting-integration.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { EventBusService } from '../../shared/events/event-bus.service';

@Module({
  imports: [SupabaseModule],
  controllers: [RrhhController],
  providers: [
    RrhhService, 
    PlanillasService,
    RrhhAccountingIntegrationService,
    EventBusService
  ],
  exports: [
    RrhhService, 
    PlanillasService,
    RrhhAccountingIntegrationService
  ]
})
export class RrhhModule {} 