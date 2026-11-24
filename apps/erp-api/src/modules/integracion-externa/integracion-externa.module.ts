import { Global, Module } from '@nestjs/common';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { IntegracionExternaAuthService } from './integracion-externa-auth.service';
import { IntegracionExternaService } from './integracion-externa.service';
import { IntegracionExternaController } from './integracion-externa.controller';

/**
 * Global porque `JwtAuthGuard` se instancia en el contexto de cada módulo que
 * lo usa en `@UseGuards` y necesita el autenticador en todos ellos.
 */
@Global()
@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [IntegracionExternaController],
  providers: [IntegracionExternaAuthService, IntegracionExternaService, PermissionGuard],
  exports: [IntegracionExternaAuthService],
})
export class IntegracionExternaModule {}
