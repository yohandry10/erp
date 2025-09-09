import { ConfigService } from '@nestjs/config';
import { FiscalServiceAbstract } from '../../shared/integration/fiscal-service.abstract';
import { SunatFiscalService } from './sunat-fiscal.service';
import { DianFiscalService } from './dian-fiscal.service';
export declare class FiscalServiceFactory {
    private readonly configService;
    private readonly sunatService;
    private readonly dianService;
    constructor(configService: ConfigService, sunatService: SunatFiscalService, dianService: DianFiscalService);
    getFiscalService(paisId: number): FiscalServiceAbstract;
    getFiscalServiceByCode(paisCode: string): FiscalServiceAbstract;
}
