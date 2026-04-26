import { Module, forwardRef } from '@nestjs/common';
import { RmaController } from './rma.controller';
import { RmaService } from './rma.service';
import { SupabaseModule } from '../../../shared/supabase/supabase.module';
import { InventarioModule } from '../../inventario/inventario.module';
import { DocumentosModule } from '../../documentos/documentos.module';
import { PermissionsModule } from '../../permissions/permissions.module';
import { AlmacenesModule } from '../../inventario/almacenes/almacenes.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => InventarioModule),
    DocumentosModule,
    PermissionsModule,
    AlmacenesModule,
    AuthModule,
  ],
  controllers: [RmaController],
  providers: [RmaService],
  exports: [RmaService],
})
export class RmaModule {}
