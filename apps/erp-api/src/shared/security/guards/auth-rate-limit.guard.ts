import { createHash } from 'crypto';
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

const OFFICE_LOGIN_LIMIT = 20;

@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return this.resolveTracker(req);
  }

  private resolveTracker(req: Record<string, any>): string {
    const ip = this.resolveIp(req);
    const account = String(req.body?.email || req.body?.username || '')
      .trim()
      .toLowerCase();
    // El bucket estricto se aplica por cuenta+IP. Así una oficina puede iniciar
    // diez cuentas distintas sin que la quinta consuma el cupo de las demás,
    // mientras una cuenta concreta sigue limitada a cinco intentos por minuto.
    const accountHash = createHash('sha256')
      .update(account || 'missing-account')
      .digest('hex')
      .slice(0, 24);
    return `${ip}:account:${accountHash}`;
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || request.url || 'auth';
    return createHash('sha256')
      .update(`auth:${name}:${route}:${suffix}`)
      .digest('hex');
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    // Primer límite: el configurado en @Throttle (login: 5/min) por cuenta+IP.
    await super.handleRequest(requestProps);

    // Segundo límite: frena credential spraying desde una IP aunque el atacante
    // rote emails. Veinte intentos/minuto permiten diez usuarios reales detrás
    // del mismo NAT sin eliminar la defensa agregada de la oficina.
    const { context, ttl, blockDuration, throttler } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const officeTracker = this.resolveIp(req);
    const officeKey = this.generateKey(context, `office:${officeTracker}`, `${throttler.name}:office`);
    const record = await this.storageService.increment(
      officeKey,
      ttl,
      OFFICE_LOGIN_LIMIT,
      blockDuration,
      `${throttler.name}:office`,
    );

    if (record.isBlocked) {
      res.header('Retry-After-Office', record.timeToBlockExpire);
      await this.throwThrottlingException(context, {
        limit: OFFICE_LOGIN_LIMIT,
        ttl,
        key: officeKey,
        tracker: officeTracker,
        ...record,
      });
    }
    res.header('X-RateLimit-Limit-Office', OFFICE_LOGIN_LIMIT);
    res.header('X-RateLimit-Remaining-Office', Math.max(0, OFFICE_LOGIN_LIMIT - record.totalHits));
    res.header('X-RateLimit-Reset-Office', record.timeToExpire);
    return true;
  }

  private resolveIp(req: Record<string, any>): string {
    return String(
      req.ip
      || req.connection?.remoteAddress
      || req.socket?.remoteAddress
      || 'unknown',
    ).trim();
  }
}
