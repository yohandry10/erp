import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): string {
    // Usar IP real considerando proxies
    return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  }

  protected generateKey(context: ExecutionContext, suffix: string): string {
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || request.url;
    const tracker = this.getTracker(request);
    return `${tracker}-${route}-${suffix}`;
  }
}