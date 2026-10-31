import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { SupabaseModule } from "../../shared/supabase/supabase.module";
import { AlertasController } from "./alertas.controller";
import { AlertasService } from "./alertas.service";

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [AlertasController],
  providers: [AlertasService],
})
export class AlertasModule {}
