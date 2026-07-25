import { Module } from '@nestjs/common';
import { OseService } from './ose.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { ResilienceModule } from '../../shared/resilience/resilience.module';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [CryptoModule, ResilienceModule, SupabaseModule],
  providers: [OseService],
  exports: [OseService],
})
export class OseModule {}
