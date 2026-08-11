import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { ComercialVentasController } from './comercial-ventas.controller';
import { ComercialVentasService } from './comercial-ventas.service';

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [ComercialVentasController],
  providers: [ComercialVentasService],
  exports: [ComercialVentasService],
})
export class ComercialVentasModule {}
