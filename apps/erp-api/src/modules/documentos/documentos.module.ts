import { Module } from '@nestjs/common';
import { DocumentosController } from '../documentos.controller';
import { DocumentosService } from '../documentos.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CpeModule } from '../cpe/cpe.module';
import { CxcModule } from '../finanzas/cxc/cxc.module';

@Module({
  imports: [SupabaseModule, CacheModule, AuthModule, PermissionsModule, CpeModule, CxcModule],
  controllers: [DocumentosController],
  providers: [DocumentosService],
  exports: [DocumentosService]
})
export class DocumentosModule {}
