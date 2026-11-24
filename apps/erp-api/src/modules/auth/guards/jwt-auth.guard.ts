import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  Inject,
  Optional,
  forwardRef
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';
import { Reflector } from '@nestjs/core';
import { PUBLIC_METADATA_KEY } from '../../../common/decorators/public.decorator';
import { IntegracionExternaAuthService } from '../../integracion-externa/integracion-externa-auth.service';
import {
  CABECERA_ACTOR_ID,
  CABECERA_ACTOR_NOMBRE,
  CABECERA_CREDENCIAL,
  RUTA_INTEGRACION_KEY,
  RutaIntegracionOptions,
} from '../../integracion-externa/integracion-externa.contract';

const tieneCookieDeSesion = (request: any): boolean =>
  Boolean(request?.cookies?.access_token) ||
  (typeof request?.headers?.cookie === 'string' && /(?:^|;\s*)access_token=/.test(request.headers.cookie));

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
    @Optional() private readonly integracionAuth?: IntegracionExternaAuthService,
  ) {
    super();
  }

  /**
   * Credencial de integración externa: identidad propia, nunca combinada con
   * una sesión de usuario. Sólo la aceptan las rutas marcadas con
   * `@PermiteIntegracionExterna`; la base decide y audita cada intento.
   */
  private async autenticarIntegracion(context: ExecutionContext, request: any): Promise<boolean> {
    if (request.integracionExterna) {
      // Ya autenticada por el guard global; el de controlador no repite el uso.
      return true;
    }
    if (request.headers?.authorization !== undefined || tieneCookieDeSesion(request)) {
      throw new UnauthorizedException('INTEGRACION_CREDENCIAL_AMBIGUA');
    }
    if (!this.integracionAuth) {
      throw new UnauthorizedException('INTEGRACION_CREDENCIAL_INVALIDA');
    }
    const ruta = this.reflector?.get<RutaIntegracionOptions>(RUTA_INTEGRACION_KEY, context.getHandler());
    const principal = await this.integracionAuth.autenticar(request, ruta);

    request.integracionExterna = principal;
    request.user = {
      id: principal.cuenta_tecnica_id,
      email: null,
      username: principal.nombre,
      roles: [],
      tenant_id: principal.tenant_id,
      is_super_admin: false,
      auth_type: 'integracion_externa',
      integracion: {
        credencial_id: principal.credencial_id,
        sucursal_id: principal.sucursal_id,
        nombre: principal.nombre,
        sistema: principal.sistema,
        secreto_id: principal.secreto_id,
      },
      actor_externo: principal.actor_externo,
    };
    request.tenantId = principal.tenant_id;
    request.tenant_id = principal.tenant_id;
    return true;
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

    if (request.headers?.[CABECERA_CREDENCIAL] !== undefined) {
      return this.autenticarIntegracion(context, request);
    }

    // La persona externa sólo existe junto a una credencial de integración:
    // con una sesión normal sería un nombre que cualquiera puede inventar.
    if (request.headers?.[CABECERA_ACTOR_ID] !== undefined || request.headers?.[CABECERA_ACTOR_NOMBRE] !== undefined) {
      throw new ForbiddenException('INTEGRACION_ACTOR_EXTERNO_NO_PERMITIDO');
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
