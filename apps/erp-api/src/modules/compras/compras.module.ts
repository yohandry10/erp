import { Module } from '@nestjs/common';
// Updated to include DevolucionesProveedorController
import { ComprasController } from '../compras.controller';
import { RecepcionesController } from './controllers/recepciones.controller';
import { ProveedoresController } from './controllers/proveedores.controller';
import { CotizacionesCompraController } from './controllers/cotizaciones-compra.controller';
import { OrdenesCompraController } from './controllers/ordenes-compra.controller';
import { DevolucionesProveedorController } from './controllers/devoluciones-proveedor.controller';
import { RecepcionesService } from './services/recepciones.service';
import { ProveedoresService } from './services/proveedores.service';
import { CotizacionesCompraService } from './services/cotizaciones-compra.service';
import { OrdenesCompraService } from './services/ordenes-compra.service';
import { DevolucionesProveedorService } from './services/devoluciones-proveedor.service';
import { ComprasCxpIntegrationService } from './services/compras-cxp-integration.service';
import { ProveedoresRepository } from './repositories/proveedores.repository';
import { CotizacionesCompraRepository } from './repositories/cotizaciones-compra.repository';
import { OrdenesCompraRepository } from './repositories/ordenes-compra.repository';
import { OcAprobacionesRepository } from './repositories/oc-aprobaciones.repository';
import { DevolucionesProveedorRepository } from './repositories/devoluciones-proveedor.repository';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { EventBusService } from '../../shared/events/event-bus.service';
import { InventoryIntegrationService } from '../../shared/integration/inventory-integration.service';
import { InventarioService } from '../inventario/inventario.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SupabaseModule, NotificationsModule],
  controllers: [
    // More specific routes must come first to avoid being caught by catch-all routes
    RecepcionesController,
    ProveedoresController,
    CotizacionesCompraController,
    OrdenesCompraController,
    DevolucionesProveedorController,
    ComprasController, // This has a catch-all @Get(':id') so it must be last
  ],
  providers: [
    RecepcionesService,
    ProveedoresService,
    CotizacionesCompraService,
    OrdenesCompraService,
    DevolucionesProveedorService,
    ComprasCxpIntegrationService,
    ProveedoresRepository,
    CotizacionesCompraRepository,
    OrdenesCompraRepository,
    OcAprobacionesRepository,
    DevolucionesProveedorRepository,
    InventarioService,
    EventBusService,
    InventoryIntegrationService,
  ],
  exports: [
    RecepcionesService,
    ProveedoresService,
    CotizacionesCompraService,
    OrdenesCompraService,
    DevolucionesProveedorService,
    EventBusService,
    InventoryIntegrationService,
  ]
})
export class ComprasModule {}