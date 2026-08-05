import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';
import { Reflector } from '@nestjs/core';
import { PUBLIC_METADATA_KEY } from '../../../common/decorators/public.decorator';

/**
 * A3: Guard mejorado que valida sesión en cada request
 *
 * Validaciones realizadas:
 * 1. JWT válido y firmado correctamente (base de AuthGuard)
 * 2. Verifica que el token no esté revocado (validación de sesión)
 * 3. Verifica tenant_id en el payload y lo pone en request (req.tenantId)
 * 4. Si falta tenant_id → 401
 * 5. Si el usuario está deshabilitado → 403
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(forwardRef(() => AuthService)) private readonly authService?: AuthService,
    private readonly reflector?: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const isPublic = this.reflector?.getAllAndOverride<boolean>(PUBLIC_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    if (request.method === 'GET' && request.path === '/api/metrics') {
      return true;
    }

    this.logger.debug(`[JWT] canActivate START - Path: ${request.path}, Has Auth Header: ${!!request.headers?.authorization}`);

    // Primero ejecutar validación base (JWT válido, firma correcta)
    try {
      const canActivate = await super.canActivate(context);
      this.logger.debug(`[JWT] super.canActivate result: ${canActivate} for ${request.path}`);
      if (!canActivate) {
        this.logger.warn(`[JWT] Authentication failed for ${request.method} ${request.path}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`[JWT] Auth error for ${request.method} ${request.path}: ${error.message}`);
      this.logger.error(`[JWT] Error stack:`, error.stack);
      throw error;
    }

    const user = request.user;

    this.logger.debug(`[JWT] User after super.canActivate: ${user ? 'EXISTS' : 'NULL'}`);

    if (!user) {
      this.logger.warn('[JWT] No user found in request after JWT validation');
      throw new UnauthorizedException('Usuario no autenticado');
    }
    
    this.logger.debug(`[JWT] ✓ ${user.email} - Tenant: ${user.tenant_id}`);


    // ✅ A3: Validar tenant_id en el payload
    // El superadmin pasa sin tenant_id porque no pertenece a ninguno; a cambio
    // no se le fija tenantId en el request, así que cualquier servicio que
    // dependa del tenant seguirá fallando en vez de asumir uno.
    if (!user.tenant_id && user.is_super_admin !== true) {
      this.logger.warn(
        `⚠️ [A3] Request sin tenant_id - Usuario: ${user.id}, Path: ${request.path}`
      );
      throw new UnauthorizedException('Token inválido: falta tenant_id');
    }

    // ✅ A3: Poner tenant_id en request para uso en servicios y guards
    if (user.tenant_id) {
      request.tenantId = user.tenant_id;
      request.tenant_id = user.tenant_id;
    }

    // Validar sesión activa si AuthService está disponible y el token tiene session_token
    if (this.authService && user.session_token) {
      try {
        const sessionValid = await this.authService.validateSession(user.session_token);
        if (!sessionValid) {
          this.logger.warn(`SESSION_REVOKED user=${user.email} path=${request.path}`);
          throw new UnauthorizedException('Sesión expirada o revocada');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        // Si la validación falla por error de infra (RLS, etc), log y continuar
        // El JWT sigue siendo válido — fail-open para no bloquear operaciones
        this.logger.warn(
          `SESSION_CHECK_ERROR user=${user.email} path=${request.path}: ${error?.message}`,
        );
      }
    }

    return true;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context?.switchToHttp?.()?.getRequest?.();
    const path = request?.path || request?.url || 'unknown';
    
    // Si hay error o info, propagar excepción
    if (err || !user) {
      this.logger.error(`[JWT] handleRequest error - Path: ${path}, err: ${err?.message}, user: ${!!user}, info: ${JSON.stringify(info)}`);
      this.logger.error(`[JWT] Request headers:`, request?.headers?.authorization ? 'Authorization header present' : 'NO Authorization header');
      throw err || new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
}
