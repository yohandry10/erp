import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
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
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PosWorkerScheduler } from './pos.worker.scheduler';
import { CajasModule } from '../cajas/cajas.module';
import { PosAuditService } from './services/pos-audit.service';

@Module({
  imports: [
    SupabaseModule,
    IntegrationModule,
    CpeModule,
    ValidationModule,
    ConfiguracionModule,
    CacheModule,
    CxcModule,
    AuthModule,
    PermissionsModule,
    CajasModule,
    JwtModule.register({}), // usado para verificar JWT del worker
  ],
  controllers: [PosController],
  providers: [PosService, FeatureFlagGuard, PosWorkerScheduler, PosAuditService],
  exports: [PosService]
})
export class PosModule { } 
