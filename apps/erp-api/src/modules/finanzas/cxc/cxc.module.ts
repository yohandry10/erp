import { Module } from '@nestjs/common';
import { CxcController } from './cxc.controller';
import { CxcService } from './cxc.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { IntegrationModule } from '../../../shared/integration/integration.module';
import { EventsModule } from '../../../shared/events/events.module';
import { CxcFacturaListener } from './listeners/cxc-factura.listener';

@Module({
  imports: [SupabaseModule, PermissionsModule, IntegrationModule, EventsModule],
  controllers: [CxcController],
  providers: [CxcService, CxcFacturaListener],
  exports: [CxcService],
})
export class CxcModule {}

