import { Module } from '@nestjs/common';
import { RetencionesController } from '../../controllers/retenciones.controller';
import { RetencionesService } from './retenciones.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [RetencionesController],
  providers: [
    RetencionesService,
  ],
  exports: [RetencionesService]
})
export class RetencionesModule {}
