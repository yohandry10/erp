import { Module } from '@nestjs/common';
import { CotizacionesController } from '../cotizaciones.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [CotizacionesController],
  providers: [],
  exports: []
})
export class CotizacionesModule {}