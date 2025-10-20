import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { PermissionController } from './permission.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RoleController, PermissionController],
  providers: [PermissionService, RoleService],
  exports: [PermissionService, RoleService],
})
export class PermissionsModule {}
