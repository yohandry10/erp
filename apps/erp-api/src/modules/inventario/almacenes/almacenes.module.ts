import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { AlmacenesService } from './almacenes.service';

@Module({
  imports: [SupabaseModule],
  providers: [AlmacenesService],
  exports: [AlmacenesService],
})
export class AlmacenesModule {}
