import { Module } from '@nestjs/common';
import { CpeController } from './cpe.controller';
import { CpeService } from './cpe.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfFormatHelperService } from './pdf-format-helper.service';
import { CpeHelperService } from './cpe-helper.service';
import { ComunicacionBajaController } from './comunicacion-baja.controller';
import { ComunicacionBajaService } from './comunicacion-baja.service';
import { FiscalAdapterService } from './fiscal-adapter.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { OseModule } from '../ose/ose.module';
import { ValidationModule } from '../validations/validation.module';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { ReferencedNotesService } from './referenced-notes.service';
import { SucursalesModule } from '../sucursales/sucursales.module';
import { CpeDianEventsService } from './cpe-dian-events.service';

@Module({
  imports: [
    CryptoModule,
    SupabaseModule,
    IntegrationModule,
    OseModule,
    ValidationModule,
    AuditModule,
    CacheModule,
    AuthModule,
    PermissionsModule,
    FiscalModule,
    SucursalesModule,
  ],
  controllers: [CpeController, ComunicacionBajaController],
  providers: [
    CpeService,
    PdfGeneratorService,
    PdfFormatHelperService,
    CpeHelperService,
    ComunicacionBajaService,
    FiscalAdapterService,
    ReferencedNotesService,
    CpeDianEventsService,
  ],
  exports: [
    CpeService,
    PdfGeneratorService,
    PdfFormatHelperService,
    CpeHelperService,
    ComunicacionBajaService,
    FiscalAdapterService,
    ReferencedNotesService,
    CpeDianEventsService,
  ],
})
export class CpeModule {}
