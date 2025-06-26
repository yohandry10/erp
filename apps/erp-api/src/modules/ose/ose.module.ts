import { Module } from '@nestjs/common';
import { OseService } from './ose.service';
import { CryptoModule } from '../../shared/crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  providers: [OseService],
  exports: [OseService],
})
export class OseModule {} 