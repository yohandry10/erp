import { Module } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { ConfigurationController } from './configuracion/configuration.controller';
import { ConfigurationService } from './configuracion/configuration.service';
import { SupabaseModule } from '../shared/supabase/supabase.module';
import { OseModule } from './ose/ose.module';
import { CryptoModule } from '../shared/crypto/crypto.module';
import { ValidationModule } from './validations/validation.module';

@Module({
  imports: [SupabaseModule, OseModule, CryptoModule, ValidationModule],
  controllers: [ConfiguracionController, ConfigurationController],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfiguracionModule {} 