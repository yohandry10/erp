import { Module } from '@nestjs/common';
import { DocumentosController } from '../documentos.controller';
import { DocumentosService } from '../documentos.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { CacheModule } from '../../shared/cache/cache.module';

@Module({
  imports: [SupabaseModule, CacheModule],
  controllers: [DocumentosController],
  providers: [DocumentosService],
  exports: [DocumentosService]
})
export class DocumentosModule {}