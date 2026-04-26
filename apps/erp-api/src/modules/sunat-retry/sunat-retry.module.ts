import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { OseModule } from '../ose/ose.module';
import { CpeModule } from '../cpe/cpe.module';
import { GreModule } from '../gre/gre.module';
import { SunatRetryService } from './sunat-retry.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    SupabaseModule,
    OseModule,
    CpeModule,
    GreModule,
  ],
  providers: [SunatRetryService],
  exports: [SunatRetryService],
})
export class SunatRetryModule {}

