import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { MigrationRunsService } from './migration-runs.service';
import { OrigenArchivoService } from './archivo-origen.service';
import { MaestrosOrigenImporters } from './importers/maestros-origen.importer';
import { ClientesImporter } from './importers/clientes.importer';
import { ProveedoresImporter } from './importers/proveedores.importer';
import { CxcAbiertasImporter } from './importers/cxc-abiertas.importer';
import { CxpAbiertasImporter } from './importers/cxp-abiertas.importer';
import { BalanceAperturaImporter } from './importers/balance-apertura.importer';
import { StockInicialImporter } from './importers/stock-inicial.importer';
import { ComprobantesHistoricoImporter } from './importers/comprobantes-historico.importer';
import {
  ContratosSuministroImporter,
  CronogramaSuministroImporter,
  OcSuministroImporter,
} from './importers/suministro-origen.importer';

@Module({
  imports: [SupabaseModule, AuthModule, PermissionsModule],
  controllers: [MigrationController],
  providers: [
    MigrationService,
    MigrationRunsService,
    ClientesImporter,
    ProveedoresImporter,
    CxcAbiertasImporter,
    CxpAbiertasImporter,
    BalanceAperturaImporter,
    StockInicialImporter,
    ComprobantesHistoricoImporter,
    ContratosSuministroImporter,
    OcSuministroImporter,
    CronogramaSuministroImporter,
    MaestrosOrigenImporters,
    OrigenArchivoService,
  ],
  exports: [MigrationService],
})
export class MigrationModule {}
