/**
 * Tax Calculator Module
 * 
 * Módulo que exporta el servicio de cálculo de impuestos
 * para ser usado en toda la aplicación
 */

import { Module, Global } from '@nestjs/common';
import { TaxCalculatorService } from './tax-calculator';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  providers: [TaxCalculatorService],
  exports: [TaxCalculatorService],
})
export class TaxCalculatorModule {}
