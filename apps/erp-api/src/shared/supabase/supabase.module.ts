import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { TenantContextService } from '../tenant/tenant-context.service';

@Module({
  providers: [SupabaseService, TenantContextService],
  exports: [SupabaseService, TenantContextService],
})
export class SupabaseModule {}
