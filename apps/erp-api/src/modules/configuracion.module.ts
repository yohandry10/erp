import { Module } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { ConfigurationController } from './configuracion/configuration.controller';
import { ConfiguracionFiscalController } from './configuracion/configuracion-fiscal.controller';
import { ConfigurationService } from './configuracion/configuration.service';
import { SupabaseModule } from '../shared/supabase/supabase.module';
import { OseModule } from './ose/ose.module';
import { CryptoModule } from '../shared/crypto/crypto.module';
import { ValidationModule } from './validations/validation.module';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [SupabaseModule, OseModule, CryptoModule, ValidationModule, AuthModule, PermissionsModule],
  controllers: [ConfiguracionController, ConfigurationController, ConfiguracionFiscalController],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfiguracionModule {} 