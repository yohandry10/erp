import { Module } from '@nestjs/common';
import { GreController } from './gre.controller';
import { GreWorkerController } from './gre.worker.controller';
import { GreService } from './gre.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { OseModule } from '../ose/ose.module';
import { ValidationModule } from '../validations/validation.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, OseModule, ValidationModule, AuthModule, PermissionsModule],
  controllers: [GreController, GreWorkerController],
  providers: [GreService],
  exports: [GreService],
})
export class GreModule {} 
