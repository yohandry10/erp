import { Module } from '@nestjs/common';
import { GreController } from './gre.controller';
import { GreService } from './gre.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationModule } from '../../shared/integration/integration.module';
import { OseModule } from '../ose/ose.module';

@Module({
  imports: [SupabaseModule, IntegrationModule, OseModule],
  controllers: [GreController],
  providers: [GreService],
  exports: [GreService],
})
export class GreModule {} 