import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { AppController } from './app.controller';
import { InventarioController } from './modules/inventario.controller';
import { DashboardController } from './modules/dashboard.controller';
import { ComprasController } from './modules/compras.controller';
import { CotizacionesController } from './modules/cotizaciones.controller';
import { PosController } from './modules/pos.controller';
import { ContabilidadController } from './modules/contabilidad.controller';
import { FinanzasController } from './modules/finanzas.controller';
import { AnalyticsController } from './modules/analytics.controller';
import { UsuariosController } from './modules/usuarios.controller';
import { ConfiguracionController } from './modules/configuracion.controller';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { CpeModule } from './modules/cpe/cpe.module';
import { OseModule } from './modules/ose/ose.module';
import { GreModule } from './modules/gre/gre.module';
import { SireModule } from './modules/sire/sire.module';
import { DocumentosModule } from './modules/documentos.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';

// Shared modules
import { SupabaseModule } from './shared/supabase/supabase.module';
import { CryptoModule } from './shared/crypto/crypto.module';
import { IntegrationModule } from './shared/integration/integration.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Rate limiting
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100,
    }),

    // Cron jobs
    ScheduleModule.forRoot(),

    // Shared modules
    SupabaseModule,
    CryptoModule,
    IntegrationModule,

    // Feature modules
    AuthModule,
    CpeModule,
    OseModule,
    GreModule,
    SireModule,
    DocumentosModule,
    RrhhModule,
  ],
  controllers: [
    AppController, 
    InventarioController, 
    DashboardController,
    ComprasController,
    CotizacionesController,
    PosController,
    ContabilidadController,
    FinanzasController,
    AnalyticsController,
    UsuariosController,
    ConfiguracionController
  ],
  providers: [],
})
export class AppModule {}