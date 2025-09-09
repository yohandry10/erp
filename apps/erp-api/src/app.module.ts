import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { SupabaseModule } from './shared/supabase/supabase.module';
import { SecurityModule } from './shared/security/security.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitGuard } from './shared/security/guards/rate-limit.guard';
import { ValidationInterceptor } from './shared/security/interceptors/validation.interceptor';
import { IntegrationModule } from './shared/integration/integration.module'; // Importar el módulo de integración
import { ComprasModule } from './modules/compras/compras.module';
import { CotizacionesModule } from './modules/cotizaciones/cotizaciones.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SireModule } from './modules/sire/sire.module';
import { OseModule } from './modules/ose/ose.module';
import { CpeModule } from './modules/cpe/cpe.module';
import { GreModule } from './modules/gre/gre.module';
import { PosModule } from './modules/pos/pos.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';
import { RetencionesModule } from './modules/retenciones/retenciones.module';
import { PaisesModule } from './modules/paises/paises.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SecurityModule,
    AuthModule,
    SupabaseModule,
    IntegrationModule,
    ComprasModule,
    CotizacionesModule,
    InventarioModule,
    ContabilidadModule,
    DocumentosModule,
    ReportsModule,
    NotificationsModule,
    SireModule,
    OseModule,
    CpeModule,
    GreModule,
    PosModule,
    AnalyticsModule,
    DashboardModule,
    RrhhModule,
    RetencionesModule,
    PaisesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ValidationInterceptor,
    },
  ],
})
export class AppModule {}