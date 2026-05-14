import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return this.resolveTracker(req);
  }

  private resolveTracker(req: Record<string, any>): string {
    // Si hay sesión autenticada, usar usuario para distribuir por identidad.
    // Esto permite que un usuario no abuse del límite de otro IP compartida.
    const userId = req.user?.id || req.user?.sub;
    if (userId) {
      return `user:${userId}`;
    }

    // Fallback a IP real considerando proxies.
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'anonymous';
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || request.url;
    const tracker = this.resolveTracker(request);
    return `${name}-${tracker}-${route}-${suffix}`;
  }
}
