import { Module } from '@nestjs/common';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { ColombiaValidationService } from './colombia-validation.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [ValidationController],
  providers: [ValidationService, ColombiaValidationService],
  exports: [ValidationService, ColombiaValidationService],
})
export class ValidationModule {}
