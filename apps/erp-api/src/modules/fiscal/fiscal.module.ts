import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';
import { FiscalServiceFactory } from './fiscal-service.factory';

@Module({
  imports: [ConfigModule],
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