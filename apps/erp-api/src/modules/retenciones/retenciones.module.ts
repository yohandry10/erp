import { Module } from '@nestjs/common';
import { RetencionesController } from '../../controllers/retenciones.controller';
import { RetencionesService } from './retenciones.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { EventBusService } from '../../shared/events/event-bus.service';

@Module({
  imports: [SupabaseModule],
  controllers: [RetencionesController],
  providers: [
    RetencionesService,
    EventBusService
  ],
  exports: [RetencionesService]
})
export class RetencionesModule {}