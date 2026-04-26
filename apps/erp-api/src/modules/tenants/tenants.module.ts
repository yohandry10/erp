import { Module } from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';
import { TenantManagementController } from './tenant-management.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, UsuariosModule, AuthModule, PermissionsModule],
  controllers: [TenantManagementController],
  providers: [TenantManagementService],
  exports: [TenantManagementService],
})
export class TenantsModule {}
