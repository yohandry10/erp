import { Module } from '@nestjs/common';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';
import { ConfiguracionCajaService } from './services/configuracion-caja.service';
import { AutorizacionesCajaService } from './services/autorizaciones-caja.service';
import { CashReconciliationService } from './services/cash-reconciliation.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PermissionGuard } from '../../common/guards/permission.guard';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [CajasController],
  providers: [
    CajasService,
    ConfiguracionCajaService,
    AutorizacionesCajaService,
    CashReconciliationService,
    PermissionGuard,
  ],
  exports: [
    CajasService,
    ConfiguracionCajaService,
    AutorizacionesCajaService,
    CashReconciliationService,
  ],
})
export class CajasModule { }
