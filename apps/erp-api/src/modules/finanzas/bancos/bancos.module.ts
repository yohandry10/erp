import { Module } from '@nestjs/common';
import { BancosController } from './bancos.controller';
import { BancosService } from './bancos.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { EventsModule } from '../../../shared/events/events.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, EventsModule, AuthModule],
  controllers: [BancosController],
  providers: [BancosService],
  exports: [BancosService],
})
export class BancosModule {}
