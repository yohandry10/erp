import { Module } from '@nestjs/common';
import { SucursalesController } from './sucursales.controller';
import { SucursalesService } from './sucursales.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [SucursalesController],
  providers: [SucursalesService, PermissionGuard],
  exports: [SucursalesService],
})
export class SucursalesModule {}
