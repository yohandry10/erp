import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { HelpController } from './help.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [HelpController],
})
export class HelpModule {}
