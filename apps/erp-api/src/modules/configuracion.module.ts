import { Module } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { SupabaseModule } from '../shared/supabase/supabase.module';
import { OseModule } from './ose/ose.module';
import { CryptoModule } from '../shared/crypto/crypto.module';

@Module({
  imports: [SupabaseModule, OseModule, CryptoModule],
  controllers: [ConfiguracionController],
})
export class ConfiguracionModule {} 