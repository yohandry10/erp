import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { SupabaseModule } from "../../shared/supabase/supabase.module";
import { BiController, TablerosController } from "./tableros.controller";
import { TablerosService } from "./tableros.service";

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [TablerosController, BiController],
  providers: [TablerosService],
})
export class TablerosModule {}
