import { Module } from '@nestjs/common';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { SalesEventsService } from './sales-events.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { IntegrationAlertsService } from './integration-alerts.service';
import { InventoryStockAlertsListener } from './inventory-stock-alerts.listener';
import { EventsModule } from '../../shared/events/events.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { EmailModule } from '../../shared/email/email.module';
import { EmailNotificationService } from './email-notification.service';
import { EmailOutboxWorker } from './email-outbox-worker.service';

@Module({
  imports: [SupabaseModule, EventsModule, OutboxModule, EmailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationTriggersService,
    SalesEventsService,
    IntegrationAlertsService,
    InventoryStockAlertsListener,
    EmailNotificationService,
    EmailOutboxWorker,
  ],
  exports: [
    NotificationsService,
    NotificationTriggersService,
    SalesEventsService,
    IntegrationAlertsService,
    EmailNotificationService,
  ],
})
export class NotificationsModule {}
