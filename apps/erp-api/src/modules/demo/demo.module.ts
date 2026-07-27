import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DemoController } from './demo.controller';
import { WebhookController } from './webhook.controller';
import { DemoService } from './demo.service';
import { StripeService } from './stripe.service';
import { DemoExpiredGuard } from './guards/demo-expired.guard';
import { DemoRestrictionsInterceptor } from './interceptors/demo-restrictions.interceptor';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SupabaseModule,
    ConfigModule,
    AuthModule,
  ],
  controllers: [DemoController, WebhookController],
  providers: [DemoService, StripeService, DemoExpiredGuard, DemoRestrictionsInterceptor],
  exports: [DemoService, StripeService, DemoExpiredGuard, DemoRestrictionsInterceptor],
})
export class DemoModule {}
