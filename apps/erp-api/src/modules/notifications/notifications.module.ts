import { Module } from '@nestjs/common';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { SalesEventsService } from './sales-events.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationAlertsService } from './integration-alerts.service';

@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationTriggersService,
    SalesEventsService,
    IntegrationAlertsService,
  ],
  exports: [NotificationsService, NotificationTriggersService, SalesEventsService, IntegrationAlertsService],
})
export class NotificationsModule {}
