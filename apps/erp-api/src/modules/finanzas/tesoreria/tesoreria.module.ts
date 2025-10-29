import { Module } from '@nestjs/common';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { EventBusService } from '../../../shared/events/event-bus.service';

@Module({
  imports: [SupabaseModule, PermissionsModule],
  controllers: [TesoreriaController],
  providers: [TesoreriaService, EventBusService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
