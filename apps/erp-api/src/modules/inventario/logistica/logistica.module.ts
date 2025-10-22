import { Module } from '@nestjs/common';
import { LogisticaController } from './logistica.controller';
import { LogisticaService } from './logistica.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AuditModule } from '../../audit/audit.module';
import { PedidoLockService } from '../../../shared/locks/pedido-lock.service';

/**
 * LogisticaModule
 * Módulo para gestionar el flujo logístico de pedidos
 * Solo aplica cuando usar_flujo_logistica = true
 */
@Module({
  imports: [SupabaseModule, NotificationsModule, PermissionsModule, AuditModule],
  controllers: [LogisticaController],
  providers: [LogisticaService, PedidoLockService],
  exports: [LogisticaService],
})
export class LogisticaModule {}
