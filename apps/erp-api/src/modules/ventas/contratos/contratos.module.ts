import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PermissionsModule } from "../../permissions/permissions.module";
import { SupabaseModule } from "../../../shared/supabase/supabase.module";
import { ContratosController } from "./contratos.controller";
import { ContratosService } from "./contratos.service";
import { ExpedienteController } from "./expediente.controller";
import { ExpedienteService } from "./expediente.service";
import { EntregasController } from "./entregas.controller";
import { EntregasService } from "./entregas.service";
import { PenalidadesController, PenalidadesService } from "./penalidades.controller";
@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [ContratosController, ExpedienteController, EntregasController, PenalidadesController],
  providers: [ContratosService, ExpedienteService, EntregasService, PenalidadesService],
})
export class ContratosModule {}
