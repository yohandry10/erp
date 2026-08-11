import { Module } from '@nestjs/common';
import { RmaController } from './rma.controller';
import { RmaService } from './rma.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    SupabaseModule,
    PermissionsModule,
    AuthModule,
  ],
  controllers: [RmaController],
  providers: [RmaService],
  exports: [RmaService],
})
export class RmaModule {}
