import { Module } from '@nestjs/common';
import { CxcController } from './cxc.controller';
import { CxcService } from './cxc.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { IntegrationModule } from '../../../shared/integration/integration.module';
import { EventsModule } from '../../../shared/events/events.module';
import { AuditModule } from '../../audit/audit.module';
import { CxcFacturaListener } from './listeners/cxc-factura.listener';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';

@Module({
  imports: [SupabaseModule, PermissionsModule, IntegrationModule, EventsModule, AuditModule],
  controllers: [CxcController],
  providers: [CxcService, CxcFacturaListener, RetencionesValidationService],
  exports: [CxcService],
})
export class CxcModule {}

