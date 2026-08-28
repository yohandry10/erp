import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import {
  ContabilidadAsientosController,
  ContabilidadCentrosCostoController,
  ContabilidadEstadosFinancierosController,
  ContabilidadEventosController,
  ContabilidadLibrosController,
  ContabilidadPeriodosController,
  ContabilidadPresupuestosController,
} from "../contabilidad.controller";
import { SupabaseModule } from "../../shared/supabase/supabase.module";
import { IntegrationModule } from "../../shared/integration/integration.module";
import { PeriodosService } from "./services/periodos.service";
import { AsientosGeneratorService } from "./services/asientos-generator.service";
import { AsientosService } from "./services/asientos.service";
import { PlanCuentasService } from "./services/plan-cuentas.service";
import { OutboxEventsService } from "./services/outbox-events.service";
import { EstadosFinancierosService } from "./services/estados-financieros.service";
import { PresupuestosService } from "./services/presupuestos.service";
import { CentrosCostoService } from "./services/centros-costo.service";
import { DepreciacionSchedulerService } from "./services/depreciacion-scheduler.service";
import { ContabilidadEventsListener } from "./listeners/contabilidad-events.listener";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { CashflowService } from "./services/cashflow.service";
import { PleExportService } from "./services/ple-export.service";
import { TiposCambioService } from "./services/tipos-cambio.service";
import { RevaluacionService } from "./services/revaluacion.service";
import { TipoCambioSunatService } from "./services/tipo-cambio-sunat.service";
import { PadronRucService } from "./services/padron-ruc.service";
import { TipoCambioSchedulerService } from "./services/tipo-cambio-scheduler.service";
import { ContabilidadMultimonedaController } from "./controllers/contabilidad-multimoneda.controller";
import { PlantillasAsientosService } from "./services/plantillas-asientos.service";
import { PlantillasSchedulerService } from "./services/plantillas-scheduler.service";
import { ContabilidadPlantillasController } from "./controllers/contabilidad-plantillas.controller";
import { ActivosFijosService } from "./services/activos-fijos.service";
import { ContabilidadActivosController } from "./controllers/contabilidad-activos.controller";
import { ConciliacionPartidasService } from "./services/conciliacion-partidas.service";
import { ContabilidadConciliacionController } from "./controllers/contabilidad-conciliacion.controller";
import { DistribucionAnaliticaService } from "./services/distribucion-analitica.service";
import { DiferidosService } from "./services/diferidos.service";
import { ContabilidadAnaliticaController } from "./controllers/contabilidad-analitica.controller";
import { ConsolidacionReportesService } from "./services/consolidacion-reportes.service";
import { ContabilidadConsolidacionController } from "./controllers/contabilidad-consolidacion.controller";
import { TributosMensualesService } from "./services/tributos-mensuales.service";
import { ContabilidadTributosController } from "./controllers/contabilidad-tributos.controller";
import { TributosAnualesService } from "./services/tributos-anuales.service";

@Module({
  imports: [
    SupabaseModule,
    IntegrationModule,
    ScheduleModule.forRoot(),
    AuthModule,
    PermissionsModule,
  ],
  controllers: [
    ContabilidadPeriodosController,
    ContabilidadPresupuestosController,
    ContabilidadCentrosCostoController,
    ContabilidadEstadosFinancierosController,
    ContabilidadLibrosController,
    ContabilidadEventosController,
    ContabilidadAsientosController,
    ContabilidadMultimonedaController,
    ContabilidadPlantillasController,
    ContabilidadActivosController,
    ContabilidadConciliacionController,
    ContabilidadAnaliticaController,
    ContabilidadConsolidacionController,
    ContabilidadTributosController,
  ],
  providers: [
    EstadosFinancierosService,
    PeriodosService,
    AsientosGeneratorService,
    AsientosService,
    PlanCuentasService,
    OutboxEventsService,
    PresupuestosService,
    CentrosCostoService,
    CashflowService,
    PleExportService,
    DepreciacionSchedulerService,
    ContabilidadEventsListener,
    TiposCambioService,
    RevaluacionService,
    TipoCambioSunatService,
    PadronRucService,
    TipoCambioSchedulerService,
    PlantillasAsientosService,
    PlantillasSchedulerService,
    ActivosFijosService,
    ConciliacionPartidasService,
    DistribucionAnaliticaService,
    DiferidosService,
    ConsolidacionReportesService,
    TributosMensualesService,
    TributosAnualesService,
    {
      provide: "EstadosFinancierosService",
      useExisting: EstadosFinancierosService,
    },
  ],
  exports: [
    PeriodosService,
    AsientosGeneratorService,
    AsientosService,
    PlanCuentasService,
    OutboxEventsService,
    EstadosFinancierosService,
    PresupuestosService,
    CentrosCostoService,
    CashflowService,
    PleExportService,
    TiposCambioService,
    RevaluacionService,
    TipoCambioSunatService,
    PadronRucService,
    TipoCambioSchedulerService,
    PlantillasAsientosService,
    ActivosFijosService,
    ConciliacionPartidasService,
    DistribucionAnaliticaService,
    DiferidosService,
    ConsolidacionReportesService,
    TributosMensualesService,
    TributosAnualesService,
  ],
})
export class ContabilidadModule {}
