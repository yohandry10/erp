import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AuthModule } from '../../auth/auth.module';
import { AuditModule } from '../../audit/audit.module';
import { PadronRucModule } from '../../contabilidad/padron-ruc.module';

/**
 * ClientesModule
 * Módulo para gestionar clientes del sistema de ventas
 * Requirements: 1.1, 1.2, 1.6, 14.1, 14.2
 */
@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule, AuditModule, PadronRucModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
