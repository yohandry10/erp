import { 
  Injectable, 
  ExecutionContext, 
  UnauthorizedException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';

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
    @Inject(forwardRef(() => AuthService)) private readonly authService?: AuthService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Primero ejecutar validación base (JWT válido, firma correcta)
    const canActivate = await super.canActivate(context);
    if (!canActivate) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    // ✅ A3: Validar tenant_id en el payload
    if (!user.tenant_id) {
      this.logger.warn(
        `⚠️ [A3] Request sin tenant_id - Usuario: ${user.id}, Path: ${request.path}`
      );
      throw new UnauthorizedException('Token inválido: falta tenant_id');
    }

    // ✅ A3: Poner tenant_id en request para uso en servicios y guards
    request.tenantId = user.tenant_id;
    request.tenant_id = user.tenant_id;

    // ✅ A3: Validar sesión si existe session_token en headers
    const sessionToken = request.headers['x-session-token'] || request.headers['session-token'];
    
    if (sessionToken && this.authService) {
      try {
        const isValidSession = await this.authService.validateSession(sessionToken);
        if (!isValidSession) {
          this.logger.warn(
            `⚠️ [A3] Sesión inválida o revocada - Usuario: ${user.id}, Session: ${sessionToken.substring(0, 8)}...`
          );
          throw new UnauthorizedException('Sesión inválida o expirada');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Si no hay authService inyectado, solo loguear warning
        this.logger.warn('⚠️ [A3] AuthService no disponible para validar sesión');
      }
    }

    // ✅ A3: Verificar que el usuario no esté deshabilitado
    // Cargar estado del usuario desde BD
    try {
      const userRecord = await this.authService?.findUserById(user.id);
      if (userRecord && userRecord.estado !== 'ACTIVO') {
        this.logger.warn(
          `⚠️ [A3] Usuario deshabilitado intentando acceder - Usuario: ${user.id}, Estado: ${userRecord.estado}`
        );
        throw new ForbiddenException('Usuario deshabilitado');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Si no se puede verificar, continuar (no bloquear si es problema de BD)
      this.logger.warn('⚠️ [A3] No se pudo verificar estado del usuario');
    }

    return true;
  }

  handleRequest(err: any, user: any, info: any) {
    // Si hay error o info, propagar excepción
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
} 