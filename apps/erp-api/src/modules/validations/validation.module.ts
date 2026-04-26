import { Module } from '@nestjs/common';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { ColombiaValidationService } from './colombia-validation.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ApiPeruService } from './apiperu.service';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [ValidationController],
  providers: [ValidationService, ColombiaValidationService, ApiPeruService],
  exports: [ValidationService, ColombiaValidationService, ApiPeruService],
})
export class ValidationModule {}
