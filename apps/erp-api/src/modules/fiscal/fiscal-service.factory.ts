import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';

@Injectable()
export class FiscalServiceFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly sunatService: SunatFiscalService,
    private readonly dianService: DianFiscalService
  ) {}

  getFiscalService(paisId: number): FiscalServiceAbstract {
    switch (paisId) {
      case 1: // Perú
        return this.sunatService;
      case 2: // Colombia
        return this.dianService;
      default:
        throw new Error(`Servicio fiscal no disponible para país ID: ${paisId}`);
    }
  }

  getFiscalServiceByCode(paisCode: string): FiscalServiceAbstract {
    switch (paisCode.toUpperCase()) {
      case 'PE':
        return this.sunatService;
      case 'CO':
        return this.dianService;
      default:
        throw new Error(`Servicio fiscal no disponible para país: ${paisCode}`);
    }
  }
}