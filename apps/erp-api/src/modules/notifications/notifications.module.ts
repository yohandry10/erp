import { Module } from '@nestjs/common';
import { NotificationsController } from '../notifications.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsController],
  providers: [],
  exports: []
})
export class NotificationsModule {}