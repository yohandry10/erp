import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { CpeModule } from '../cpe/cpe.module';
import { ValidationModule } from '../validations/validation.module';
import { ConfiguracionModule } from '../configuracion.module';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { CacheModule } from '../../shared/cache/cache.module';
import { CxcModule } from '../finanzas/cxc/cxc.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, CpeModule, ValidationModule, ConfiguracionModule, CacheModule, CxcModule],
  controllers: [PosController],
  providers: [PosService, FeatureFlagGuard],
  exports: [PosService]
})
export class PosModule { } 
