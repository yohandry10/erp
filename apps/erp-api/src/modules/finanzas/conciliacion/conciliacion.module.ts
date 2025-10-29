import { Module } from '@nestjs/common';
import { ConciliacionController } from './conciliacion.controller';
import { ConciliacionService } from './conciliacion.service';
import { CsvParserService } from './csv-parser.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, PermissionsModule],
  controllers: [ConciliacionController],
  providers: [ConciliacionService, CsvParserService],
  exports: [ConciliacionService],
})
export class ConciliacionModule {}
