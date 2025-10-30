import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UserManagementService } from './user-management.service';
import { UsuariosController } from '../usuarios.controller';
import { UserManagementController } from './user-management.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../../shared/email/email.module';

@Module({
  imports: [SupabaseModule, PermissionsModule, AuditModule, EmailModule],
  providers: [UsuariosService, UserManagementService],
  controllers: [UsuariosController, UserManagementController],
  exports: [UsuariosService, UserManagementService],
})
export class UsuariosModule {}