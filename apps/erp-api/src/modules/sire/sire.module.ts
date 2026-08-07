import { Module } from '@nestjs/common';
import { SireController } from './sire.controller';
import { SireService } from './sire.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SireApiClientService } from './sire-api-client.service';

@Module({
  imports: [SupabaseModule, IntegrationModule, AuthModule, PermissionsModule],
  controllers: [SireController],
  providers: [SireService, SireApiClientService],
  exports: [SireService],
})
export class SireModule {}
