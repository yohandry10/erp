import { Module } from '@nestjs/common';
import { CxpController } from './cxp.controller';
import { CxpService } from './cxp.service';
import { CxpRecepcionListener } from './cxp-recepcion.listener';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';

@Module({
  imports: [SupabaseModule, PermissionsModule],
  controllers: [CxpController],
  providers: [CxpService, CxpRecepcionListener, EventBusService, RetencionesValidationService],
  exports: [CxpService],
})
export class CxpModule {}
