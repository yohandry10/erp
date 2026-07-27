import { Injectable, Logger } from '@nestjs/common';

type LockKey = string;

@Injectable()
export class PedidoLockService {
  private readonly logger = new Logger(PedidoLockService.name);
  private readonly queues = new Map<LockKey, Promise<void>>();

  private buildKey(tenantId: string | null | undefined, pedidoId: string): LockKey {
    const tenantSegment = tenantId ?? 'no_tenant';
    return `${tenantSegment}:${pedidoId}`;
  }

  async runWithLock<T>(
    tenantId: string | null | undefined,
    pedidoId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!pedidoId) {
      throw new Error('pedidoId es requerido para ejecutar un lock');
    }

    const key = this.buildKey(tenantId, pedidoId);
    const isFirstAcquisition = !this.queues.has(key);
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;

    const current = previous.then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    this.queues.set(key, current);

    if (!isFirstAcquisition) {
      this.logger.debug(`Lock en cola para ${key}`);
      await previous;
    } else {
      this.logger.debug(`Lock inicial para ${key}`);
    }

    try {
      this.logger.debug(`Lock activo para ${key}`);
      return await task();
    } finally {
      this.logger.debug(`Liberando lock para ${key}`);
      if (release) {
        release();
      }
      if (this.queues.get(key) === current) {
        this.queues.delete(key);
      }
    }
  }
}

