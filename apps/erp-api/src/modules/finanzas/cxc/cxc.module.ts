import { Module } from '@nestjs/common';
import { CxcController } from './cxc.controller';
import { CxcService } from './cxc.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { IntegrationModule } from '../../../shared/integration/integration.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, IntegrationModule],
  controllers: [CxcController],
  providers: [CxcService],
  exports: [CxcService],
})
export class CxcModule {}
