import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';
import { FiscalServiceFactory } from './fiscal-service.factory';
import { ColombiaFiscalModule } from './colombia/colombia-fiscal.module';

@Module({
  imports: [
    ConfigModule,
    ColombiaFiscalModule // Importar módulo de Colombia
  ],
  providers: [
    SunatFiscalService,
    DianFiscalService,
    FiscalServiceFactory
  ],
  exports: [
    SunatFiscalService,
    DianFiscalService,
    FiscalServiceFactory
  ]
})
export class FiscalModule {}