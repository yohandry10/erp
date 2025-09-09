import { Module } from '@nestjs/common';
import { InventarioController } from '../inventario.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';

@Module({
  imports: [SupabaseModule, IntegrationModule],
  controllers: [InventarioController],
  providers: [],
  exports: []
})
export class InventarioModule {}