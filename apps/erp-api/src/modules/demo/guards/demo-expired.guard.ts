import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Guard que valida si un tenant demo está expirado
 * Si está expirado, bloquea el acceso con un mensaje amigable
 */
@Injectable()
export class DemoExpiredGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenant_id;

    if (!tenantId) {
      return true; // No hay tenant, dejar pasar (otros guards manejarán auth)
    }

    // Verificar si es demo y si está expirado (usar cliente público)
    const { data, error } = await this.supabase.getPublicClient()
      .from('empresa_config')
      .select('is_demo, demo_expires_at')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      return true; // No se pudo verificar, dejar pasar
    }

    // Si no es demo, permitir acceso
    if (!data.is_demo) {
      return true;
    }

    // Si es demo, verificar expiración
    const expiresAt = new Date(data.demo_expires_at);
    const now = new Date();

    if (expiresAt < now) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Tu demo ha expirado',
        error: 'DEMO_EXPIRED',
        expires_at: data.demo_expires_at,
        suggestion: 'Convierte tu cuenta a una cuenta real para continuar usando el sistema',
      });
    }

    // Si está por expirar (menos de 3 días), agregar header de advertencia
    const diasRestantes = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diasRestantes <= 3) {
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-Demo-Warning', `Tu demo expira en ${diasRestantes} días`);
      response.setHeader('X-Demo-Days-Remaining', diasRestantes.toString());
    }

    return true;
  }
}
