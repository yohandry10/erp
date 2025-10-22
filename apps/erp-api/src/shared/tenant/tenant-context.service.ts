import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextSnapshot {
  tenantId?: string | null;
  userId?: string | null;
  supabaseAccessToken?: string | null;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextSnapshot>();

  run<T>(context: TenantContextSnapshot, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  getContext(): TenantContextSnapshot | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | null {
    return this.storage.getStore()?.tenantId ?? null;
  }

  getUserId(): string | null {
    return this.storage.getStore()?.userId ?? null;
  }

  getSupabaseAccessToken(): string | null {
    return this.storage.getStore()?.supabaseAccessToken ?? null;
  }

  setContext(partial: TenantContextSnapshot): void {
    const store = this.storage.getStore();
    if (store) {
      Object.assign(store, partial);
    }
  }
}
