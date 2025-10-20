import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { LogisticaModule } from './logistica/logistica.module';

@Module({
  imports: [IntegrationModule, SupabaseModule, LogisticaModule],
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService, LogisticaModule]
})
export class InventarioModule {}
