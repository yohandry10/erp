import { Module } from '@nestjs/common';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CpeModule } from '../../cpe/cpe.module';
import { GreModule } from '../../gre/gre.module';
import { ValidationModule } from '../../validations/validation.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AuditModule } from '../../audit/audit.module';
import { IntegrationModule } from '../../../shared/integration/integration.module';
import { AuthModule } from '../../auth/auth.module';

/**
 * PedidosModule
 * Módulo para gestionar pedidos de venta
 * Requirements: 5.1, 5.2, 5.3, 5.4, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 11.5, 27.1, 27.2, 27.3, 27.4, 27.5
 */
@Module({
  imports: [
    SupabaseModule,
    NotificationsModule,
    CpeModule,
    GreModule,
    ValidationModule,
    PermissionsModule,
    AuditModule,
    IntegrationModule,
    AuthModule,
  ],
  controllers: [PedidosController],
  providers: [PedidosService, CPEIntegrationService, GREIntegrationService],
  exports: [PedidosService, CPEIntegrationService, GREIntegrationService],
})
export class PedidosModule {}
