import { Module, forwardRef } from '@nestjs/common';
import { RrhhController } from './rrhh.controller';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { RrhhAccountingIntegrationService } from './rrhh-accounting-integration.service';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { EventBusService } from '../../shared/events/event-bus.service';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RrhhCountryService } from './rrhh-country.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    SupabaseModule,
    ConfigModule,
    AuthModule,
    PermissionsModule,
  ],
  controllers: [RrhhController],
  providers: [
    RrhhService,
    PlanillasService,
    RrhhAccountingIntegrationService,
    RrhhCountryService,
    FeatureFlagGuard,
  ],
  exports: [
    RrhhService,
    PlanillasService,
    RrhhAccountingIntegrationService,
    RrhhCountryService,
  ],
})
export class RrhhModule {} 
