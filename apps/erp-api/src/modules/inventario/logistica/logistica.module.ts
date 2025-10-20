import { Module } from '@nestjs/common';
import { LogisticaController } from './logistica.controller';
import { LogisticaService } from './logistica.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PermissionsModule } from '../../permissions/permissions.module';

/**
 * LogisticaModule
 * Módulo para gestionar el flujo logístico de pedidos
 * Solo aplica cuando usar_flujo_logistica = true
 */
@Module({
  imports: [SupabaseModule, NotificationsModule, PermissionsModule],
  controllers: [LogisticaController],
  providers: [LogisticaService],
  exports: [LogisticaService],
})
export class LogisticaModule {}
