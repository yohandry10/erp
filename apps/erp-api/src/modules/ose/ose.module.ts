import { Module } from '@nestjs/common';
import { OseService } from './ose.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { ResilienceModule } from '../../shared/resilience/resilience.module';

@Module({
  imports: [CryptoModule, ResilienceModule],
  providers: [OseService],
  exports: [OseService],
})
export class OseModule {} 