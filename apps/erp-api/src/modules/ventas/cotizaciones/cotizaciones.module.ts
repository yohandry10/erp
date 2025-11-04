import { Module } from '@nestjs/common';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AuditModule } from '../../audit/audit.module';
import { AuthModule } from '../../auth/auth.module';

/**
 * CotizacionesModule
 * Módulo para gestionar cotizaciones del sistema de ventas
 * Requirements: 3.1, 3.2, 3.3, 27.1, 27.2, 27.4
 */
@Module({
  imports: [SupabaseModule, NotificationsModule, PermissionsModule, AuditModule, AuthModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
  exports: [CotizacionesService],
})
export class CotizacionesModule {}
