import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XmlSigner } from '@erp-suite/crypto';

@Global()
@Module({
  providers: [
    {
      provide: 'XML_SIGNER',
      useFactory: (configService: ConfigService) => {
        const pfxPath = configService.get<string>('PFX_PATH');
        const pfxPassword = configService.get<string>('PFX_PASS');
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const sunatEnvironment = configService.get<string>('SUNAT_ENVIRONMENT', 'homologacion');
        const expectedRuc = configService.get<string>('SUNAT_CERT_EXPECTED_RUC') || configService.get<string>('EMPRESA_RUC');
        const mismatchConfirmed =
          configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === true ||
          configService.get<string | boolean>('SUNAT_CERT_RUC_MISMATCH_CONFIRMED') === 'true';

        if (!pfxPath || !pfxPassword) {
          if (nodeEnv !== 'production') {
            return new XmlSigner({ useDemoMode: true });
          }
          throw new Error('PFX_PATH y PFX_PASS son requeridos para inicializar XML_SIGNER.');
        }

        return new XmlSigner({
          pfxPath,
          pfxPassword,
          expectedRuc,
          enforceRucInCertificate: sunatEnvironment === 'produccion',
          allowRucMismatchWithConfirmation: mismatchConfirmed,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['XML_SIGNER'],
})
export class CryptoModule {} 
