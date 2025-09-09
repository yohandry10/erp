import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}