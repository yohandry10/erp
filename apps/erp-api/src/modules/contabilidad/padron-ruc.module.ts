import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { PadronRucService } from './services/padron-ruc.service';

/**
 * El padron de RUC lo consultan varios modulos --contabilidad, el alta de
 * clientes y el alta de proveedores--, asi que vive en su propio modulo en vez
 * de repetirse como provider en cada uno. La cache esta en la base de datos, de
 * modo que lo unico que se comparte de verdad es el codigo.
 */
@Module({
  imports: [SupabaseModule],
  providers: [PadronRucService],
  exports: [PadronRucService],
})
export class PadronRucModule {}
