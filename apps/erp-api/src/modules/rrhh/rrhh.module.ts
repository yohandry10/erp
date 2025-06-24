import { Module } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RrhhController],
  providers: [RrhhService, PlanillasService],
})
export class RrhhModule {} 