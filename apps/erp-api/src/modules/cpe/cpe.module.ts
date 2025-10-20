import { Module } from '@nestjs/common';
import { CpeController } from './cpe.controller';
import { CpeService } from './cpe.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { OseModule } from '../ose/ose.module';
import { ValidationModule } from '../validations/validation.module';

@Module({
  imports: [CryptoModule, SupabaseModule, IntegrationModule, OseModule, ValidationModule],
  controllers: [CpeController],
  providers: [CpeService],
  exports: [CpeService],
})
export class CpeModule {} 