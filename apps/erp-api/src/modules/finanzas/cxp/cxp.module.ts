import { Module } from '@nestjs/common';
import { CxpController } from './cxp.controller';
import { CxpService } from './cxp.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { AuthModule } from '../../auth/auth.module';
import { CxpEventsListener } from './listeners/cxp-events.listener';
import { EventsModule } from '../../../shared/events/events.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule, EventsModule, TesoreriaModule],
  controllers: [CxpController],
  providers: [CxpService, RetencionesValidationService, CxpEventsListener],
  exports: [CxpService],
})
export class CxpModule {}
