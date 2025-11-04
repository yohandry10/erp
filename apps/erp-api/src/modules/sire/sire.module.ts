import { Module } from '@nestjs/common';
import { SireController } from './sire.controller';
import { SireService } from './sire.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, AuthModule, PermissionsModule],
  controllers: [SireController],
  providers: [SireService],
  exports: [SireService],
})
export class SireModule {} 