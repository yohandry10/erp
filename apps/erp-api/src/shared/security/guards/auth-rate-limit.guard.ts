import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return this.resolveTracker(req);
  }

  private resolveTracker(req: Record<string, any>): string {
    // Para endpoints de autenticación, usar IP + User-Agent para mayor seguridad
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}-${Buffer.from(userAgent).toString('base64').slice(0, 10)}`;
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const request = context.switchToHttp().getRequest();
    const tracker = this.resolveTracker(request);
    return `auth-${name}-${tracker}-${suffix}`;
  }
}
