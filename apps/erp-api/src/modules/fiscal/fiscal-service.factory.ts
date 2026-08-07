import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';
import { ArcaFiscalService } from './arca-fiscal.service';

@Injectable()
export class FiscalServiceFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly sunatService: SunatFiscalService,
    private readonly dianService: DianFiscalService,
    private readonly arcaService: ArcaFiscalService,
  ) {}

  /**
   * Get fiscal service by country ID
   * @param paisId - Country ID (1=Peru, 2=Colombia)
   */
  getServiceByPaisId(paisId: number): FiscalServiceAbstract {
    switch (paisId) {
      case 1: // Perú
        return this.sunatService;
      case 2: // Colombia
        return this.dianService;
      case 5: // Argentina
        return this.arcaService;
      default:
        throw new Error(`Servicio fiscal no disponible para país ID: ${paisId}`);
    }
  }

  /**
   * Get fiscal service by country code
   * @param paisCode - Country code (PE, CO, etc.)
   */
  getServiceByCode(paisCode: string): FiscalServiceAbstract {
    switch (paisCode.toUpperCase()) {
      case 'PE':
        return this.sunatService;
      case 'CO':
        return this.dianService;
      case 'AR':
        return this.arcaService;
      default:
        throw new Error(`Servicio fiscal no disponible para país: ${paisCode}`);
    }
  }

  /**
   * @deprecated Use getServiceByPaisId instead
   */
  getFiscalService(paisId: number): FiscalServiceAbstract {
    return this.getServiceByPaisId(paisId);
  }

  /**
   * @deprecated Use getServiceByCode instead
   */
  getFiscalServiceByCode(paisCode: string): FiscalServiceAbstract {
    return this.getServiceByCode(paisCode);
  }
}
