import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Interceptor que aplica restricciones a tenants demo
 * - Simula respuestas de SUNAT en lugar de enviar realmente
 * - Bloquea operaciones sensibles
 */
@Injectable()
export class DemoRestrictionsInterceptor implements NestInterceptor {
  constructor(private supabase: SupabaseService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenant_id;
    const path = request.route?.path || '';
    const method = request.method;

    // Si no hay tenant, continuar normal
    if (!tenantId) {
      return next.handle();
    }

    // Verificar si es demo (usar cliente público para evitar validación de contexto)
    const { data } = await this.supabase.getPublicClient()
      .from('empresa_config')
      .select('is_demo, pais')
      .eq('tenant_id', tenantId)
      .single();

    const isDemo = data?.is_demo || false;

    // Si no es demo, continuar normal
    if (!isDemo) {
      return next.handle();
    }

    // RESTRICCIONES PARA DEMOS

    // 1. Bloquear envío real a SUNAT
    const autoridadFiscal =
      data?.pais === 'AR' ? 'ARCA' : data?.pais === 'CO' ? 'DIAN' : 'SUNAT';
    if (
      path.includes('enviar-sunat') ||
      path.includes('enviar-arca') ||
      path.includes('/fiscal/enviar') ||
      path.includes('/ose/enviar')
    ) {
      throw new BadRequestException({
        message: `En modo demo no se envían documentos a ${autoridadFiscal} real`,
        suggestion: 'Los documentos se marcan como "ACEPTADO" automáticamente para demostración',
        is_demo_restriction: true,
      });
    }

    // 2. Bloquear cambio de RUC
    if ((path.includes('/empresa-config') || path.includes('/configuracion')) && method === 'PATCH') {
      if (request.body?.ruc) {
        throw new BadRequestException({
          message: 'No puedes cambiar el RUC en modo demo',
          suggestion: 'Convierte tu cuenta a real para modificar datos fiscales',
          is_demo_restriction: true,
        });
      }
    }

    // 3. Bloquear subida de certificado digital real
    if (path.includes('/certificado') && method === 'POST') {
      throw new BadRequestException({
        message: 'No puedes subir certificados digitales en modo demo',
        suggestion: 'Convierte tu cuenta a real para usar certificados reales',
        is_demo_restriction: true,
      });
    }

    // 4. Simular respuestas de SUNAT en endpoints de facturación
    if (path.includes('/ventas') && method === 'POST') {
      return next.handle().pipe(
        map((data) => {
          // Si se creó una venta, simular respuesta SUNAT
          if (data?.id) {
            return {
              ...data,
              cpe_estado: 'ACEPTADO',
              cpe_respuesta_sunat: `Documento aceptado por ${autoridadFiscal} (SIMULADO - MODO DEMO)`,
              cpe_codigo_respuesta: '0',
              is_demo_simulation: true,
            };
          }
          return data;
        }),
      );
    }

    // Continuar con la ejecución normal
    return next.handle();
  }
}
