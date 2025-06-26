import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Módulos principales
import { SupabaseModule } from './shared/supabase/supabase.module';
import { IntegrationModule } from './shared/integration/integration.module';
import { JobsModule } from './shared/jobs/jobs.module';

// Módulos de negocio
import { AuthModule } from './modules/auth/auth.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';
import { ConfiguracionModule } from './modules/configuracion.module';
import { CpeModule } from './modules/cpe/cpe.module';
import { GreModule } from './modules/gre/gre.module';
import { SireModule } from './modules/sire/sire.module';
import { DocumentosModule } from './modules/documentos.module';

// Controladores individuales (solo los que existen)
import { AnalyticsController } from './modules/analytics.controller';
import { ComprasController } from './modules/compras.controller';
import { ContabilidadController } from './modules/contabilidad.controller';
import { CotizacionesController } from './modules/cotizaciones.controller';
import { DashboardController } from './modules/dashboard.controller';

import { InventarioController } from './modules/inventario.controller';
import { PosController } from './modules/pos.controller';
import { UsuariosController } from './modules/usuarios.controller';

// Servicios compartidos
import { EventBusService } from './shared/events/event-bus.service';
import { InventoryIntegrationService } from './shared/integration/inventory-integration.service';
import { AccountingIntegrationService } from './shared/integration/accounting-integration.service';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    IntegrationModule,
    JobsModule,
    AuthModule,
    RrhhModule,
    ConfiguracionModule,
    CpeModule,
    GreModule,
    SireModule,
    DocumentosModule,
  ],
  controllers: [
    AppController,
    AnalyticsController,
    DashboardController,
    PosController,
    ComprasController,
    CotizacionesController,
    InventarioController,

    ContabilidadController,
    UsuariosController,
  ],
  providers: [
    AppService,
    EventBusService,
    InventoryIntegrationService,
    AccountingIntegrationService,

  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly inventoryService: InventoryIntegrationService,
    private readonly accountingService: AccountingIntegrationService,

  ) {
    console.log('🚀 [App] Módulo principal inicializado con todas las integraciones');
    console.log('✅ [App] Sistema ERP con integración completa entre módulos activo');
    console.log('🤖 [App] Procesos automáticos en background inicializados');
    console.log('🎯 [App] EventBus expandido para comunicación crítica entre módulos');
  }

  async onModuleInit() {
    console.log('🔥 [App] FORZANDO INICIALIZACIÓN DE SERVICIOS DE INTEGRACIÓN...');
    
    // FORZAR LLAMADA A MÉTODOS PARA INSTANCIAR SERVICIOS
    try {
      console.log('📦 [App] Forzando instanciación de InventoryIntegrationService...');
      await this.inventoryService.getProductosStock();
      console.log('✅ [App] InventoryIntegrationService INSTANCIADO');
      
      console.log('📚 [App] Forzando instanciación de AccountingIntegrationService...');
      await this.accountingService.initializeCuentasCache();
      console.log('✅ [App] AccountingIntegrationService INSTANCIADO');
      

      
    } catch (error) {
      console.error('❌ [App] Error instanciando servicios:', error);
    }
    
    console.log('✅ [App] TODOS LOS SERVICIOS DE INTEGRACIÓN ESTÁN LISTOS PARA RECIBIR EVENTOS');
  }
}