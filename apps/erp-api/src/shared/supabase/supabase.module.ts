import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SucursalScopeService } from '../tenant/sucursal-scope.service';

@Module({
  providers: [SupabaseService, TenantContextService, SucursalScopeService],
  exports: [SupabaseService, TenantContextService, SucursalScopeService],
})
export class SupabaseModule {}
