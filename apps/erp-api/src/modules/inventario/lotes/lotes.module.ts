import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PermissionsModule } from "../../permissions/permissions.module";
import { SupabaseModule } from "../../../shared/supabase/supabase.module";
import { LotesController } from "./lotes.controller";
import { LotesService } from "./lotes.service";

@Module({
  imports: [SupabaseModule, PermissionsModule, AuthModule],
  controllers: [LotesController],
  providers: [LotesService],
})
export class LotesModule {}
