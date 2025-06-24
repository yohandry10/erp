import { Module } from '@nestjs/common';
import { CpeController } from './cpe.controller';
import { CpeService } from './cpe.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';

@Module({
  imports: [CryptoModule, SupabaseModule, IntegrationModule],
  controllers: [CpeController],
  providers: [CpeService],
  exports: [CpeService],
})
export class CpeModule {} 