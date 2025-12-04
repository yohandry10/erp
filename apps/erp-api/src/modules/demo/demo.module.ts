import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DemoController } from './demo.controller';
import { WebhookController } from './webhook.controller';
import { DemoService } from './demo.service';
import { StripeService } from './stripe.service';
import { DemoExpiredGuard } from './guards/demo-expired.guard';
import { DemoRestrictionsInterceptor } from './interceptors/demo-restrictions.interceptor';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [
    SupabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'demo-secret-key',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [DemoController, WebhookController],
  providers: [DemoService, StripeService, DemoExpiredGuard, DemoRestrictionsInterceptor],
  exports: [DemoService, StripeService, DemoExpiredGuard, DemoRestrictionsInterceptor],
})
export class DemoModule {}
