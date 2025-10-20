import { Module } from '@nestjs/common';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { SalesEventsService } from './sales-events.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationTriggersService, SalesEventsService],
  exports: [NotificationsService, NotificationTriggersService, SalesEventsService]
})
export class NotificationsModule {}