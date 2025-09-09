import { Module } from '@nestjs/common';
import { CotizacionesController } from '../cotizaciones.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [CotizacionesController],
  providers: [],
  exports: []
})
export class CotizacionesModule {}