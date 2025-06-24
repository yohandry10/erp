import { Module } from '@nestjs/common';
import { OseService } from './ose.service';

@Module({
  providers: [OseService],
  exports: [OseService],
})
export class OseModule {} 