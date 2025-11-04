import { Module } from '@nestjs/common';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
