import { Module } from '@nestjs/common';
import { ConfiguracionController } from './configuracion.controller';
import { ConfigurationController } from './configuracion/configuration.controller';
import { ConfigurationContextController } from './configuracion/configuration-context.controller';
import { ConfiguracionFiscalController } from './configuracion/configuracion-fiscal.controller';
import { ConfigurationService } from './configuracion/configuration.service';
import { SupabaseModule } from '../shared/supabase/supabase.module';
import { OseModule } from './ose/ose.module';
import { CryptoModule } from '../shared/crypto/crypto.module';
import { ValidationModule } from './validations/validation.module';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { DocumentosModule } from './documentos.module';
import { AuditModule } from './audit/audit.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, SupabaseModule, OseModule, CryptoModule, ValidationModule, AuthModule, PermissionsModule, DocumentosModule, AuditModule, FiscalModule],
  controllers: [
    ConfiguracionController,
    ConfigurationController,
    ConfigurationContextController,
    ConfiguracionFiscalController,
  ],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfiguracionModule {} 
