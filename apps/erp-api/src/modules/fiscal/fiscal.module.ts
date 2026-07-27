import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';
import { OseApiFiscalService } from './ose-api-fiscal.service';
import { FiscalServiceFactory } from './fiscal-service.factory';
import { ColombiaFiscalModule } from './colombia/colombia-fiscal.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    ColombiaFiscalModule // Importar módulo de Colombia
  ],
  providers: [
    SunatFiscalService,
    DianFiscalService,
    OseApiFiscalService,
    FiscalServiceFactory
  ],
  exports: [
    SunatFiscalService,
    DianFiscalService,
    OseApiFiscalService,
    FiscalServiceFactory
  ]
})
export class FiscalModule {}
