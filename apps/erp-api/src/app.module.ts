import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
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
import { PermissionGuard } from './common/guards/permission.guard';
import { IntegrationModule } from './shared/integration/integration.module'; // Importar el módulo de integración
import { ComprasModule } from './modules/compras/compras.module';
import { CotizacionesModule } from './modules/cotizaciones/cotizaciones.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { CxcModule } from './modules/finanzas/cxc/cxc.module';
import { CxpModule } from './modules/finanzas/cxp/cxp.module';
import { TesoreriaModule } from './modules/finanzas/tesoreria/tesoreria.module';
import { BancosModule } from './modules/finanzas/bancos/bancos.module';
import { ConciliacionModule } from './modules/finanzas/conciliacion/conciliacion.module';
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
import { TenantsModule } from './modules/tenants/tenants.module';
import { ValidationModule } from './modules/validations/validation.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware'; // ✅ MULTI-TENANT
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor'; // ✅ MULTI-TENANT
import { ClientesModule } from './modules/ventas/clientes/clientes.module';
import { CotizacionesModule as VentasCotizacionesModule } from './modules/ventas/cotizaciones/cotizaciones.module';
import { PedidosModule } from './modules/ventas/pedidos/pedidos.module';
import { ReportesModule } from './modules/ventas/reportes/reportes.module';
import { RmaModule } from './modules/ventas/rma/rma.module';
import { SecurityDashboardModule } from './modules/security/security.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { SunatRetryModule } from './modules/sunat-retry/sunat-retry.module';
import { CacheModule } from './shared/cache/cache.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { TaxCalculatorModule } from './shared/utils/tax-calculator.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { CajasModule } from './modules/cajas/cajas.module';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsModule } from './shared/jobs/jobs.module';
import { SharedModule } from './shared/shared.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/erp-api/.env'],
    }),
    ScheduleModule.forRoot(),
    SecurityModule,
    SecurityDashboardModule,
    SharedModule, // 📊 Logging estructurado con Correlation IDs
    AuthModule,
    SupabaseModule,
    PermissionsModule,
    IntegrationModule,
    TaxCalculatorModule, // ✅ Cálculo centralizado de impuestos
    CacheModule, // ✅ Cache distribuido con Redis
    UsuariosModule,
    TenantsModule,
    ComprasModule,
    CotizacionesModule,
    InventarioModule,
    ContabilidadModule,
    CxcModule,
    CxpModule,
    TesoreriaModule,
    BancosModule,
    ConciliacionModule,
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
    ValidationModule,
    ClientesModule,
    VentasCotizacionesModule,
    PedidosModule,
    ReportesModule,
    RmaModule,
    OutboxModule, // 🔴 CRÍTICO: Módulo de outbox pattern para eventos persistentes
    SunatRetryModule, // 🔴 CRÍTICO: Módulo de reintentos automáticos para comunicación con SUNAT
    MetricsModule, // 📊 Módulo de métricas para Prometheus y Grafana
    ImportExportModule,
    CajasModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ✅ SECURITY: PermissionGuard aplicado globalmente
    // Valida permisos en endpoints con @RequirePermission()
    // Si no hay @RequirePermission(), permite acceso (solo requiere autenticación)
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    // Rate limiter deshabilitado temporalmente
    // {
    //   provide: APP_GUARD,
    //   useClass: RateLimitGuard,
    // },
    {
      provide: APP_INTERCEPTOR,
      useClass: ValidationInterceptor,
    },
    // ✅ MULTI-TENANT: TenantContextInterceptor para establecer contexto después de autenticación
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * ✅ MULTI-TENANT: Configure TenantMiddleware
   * 
   * This middleware:
   * - Applies to all routes except auth endpoints
   * - Runs after JwtAuthGuard (which sets request.user)
   * - Configures database session context for RLS
   * 
   * Requirements: 4.2
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        // Exclude auth endpoints that don't require tenant context
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
        // Exclude public endpoints
        { path: 'api/paises', method: RequestMethod.GET },
        { path: 'api/paises/:id', method: RequestMethod.GET },
        // Health check
        { path: 'health', method: RequestMethod.GET },
        { path: 'api/health', method: RequestMethod.GET },
      )
      .forRoutes('*'); // Apply to all other routes
  }
}
