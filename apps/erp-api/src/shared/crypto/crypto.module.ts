import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XmlSigner } from '@erp-suite/crypto';

@Global()
@Module({
  providers: [
    {
      provide: 'XML_SIGNER',
      useFactory: (configService: ConfigService) => {
        return new XmlSigner({
          pfxPath: configService.get('PFX_PATH') || '/tmp/demo.pfx',
          pfxPassword: configService.get('PFX_PASS') || 'demo123',
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['XML_SIGNER'],
})
export class CryptoModule {} 