import { Module } from '@nestjs/common';
import { UserManagementService } from './user-management.service';
import { UsuariosController } from '../usuarios.controller';
import { UserManagementController } from './user-management.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EmailModule } from '../../shared/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, EmailModule, AuthModule, AuditModule],
  providers: [UserManagementService],
  controllers: [UsuariosController, UserManagementController],
  exports: [UserManagementService],
})
export class UsuariosModule {}
