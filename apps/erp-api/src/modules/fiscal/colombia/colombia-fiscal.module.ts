/**
 * Colombia Fiscal Module
 * 
 * Módulo que agrupa todos los servicios específicos de Colombia (DIAN)
 * Mantiene el código organizado y separado del módulo principal
 * 
 * @module ColombiaFiscalModule
 * @country Colombia
 */

import { Module } from '@nestjs/common';
import { DianXmlBuilderService } from './dian-xml-builder.service';
import { DianSignerService } from './dian-signer.service';
import { DianApiClientService } from './dian-api-client.service';

@Module({
  providers: [
    DianXmlBuilderService,
    DianSignerService,
    DianApiClientService
  ],
  exports: [
    DianXmlBuilderService,
    DianSignerService,
    DianApiClientService
  ]
})
export class ColombiaFiscalModule {}
