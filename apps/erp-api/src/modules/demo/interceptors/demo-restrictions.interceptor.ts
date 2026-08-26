import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
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
    const fullPath = String(request.originalUrl || request.url || path).toLowerCase();
    const method = String(request.method || '').toUpperCase();
    const routePath = fullPath.split('?')[0].replace(/\/+$/, '');
    const isDemoIdentityMutation =
      (method === 'PUT' && /\/(?:configuration|configuracion)\/empresa$/.test(routePath)) ||
      (method === 'POST' && /\/configuration\/complete$/.test(routePath));
    const isFiscalNetworkOperation =
      fullPath.includes('enviar-sunat') ||
      fullPath.includes('enviar-arca') ||
      fullPath.includes('/fiscal/enviar') ||
      fullPath.includes('/ose/enviar') ||
      /\/configuration\/colombia\/dian\/test(?:[/?]|$)/.test(fullPath) ||
      /\/(?:comunicacion|resumen)\/[^/?]+\/enviar(?:[/?]|$)/.test(fullPath) ||
      /\/guias\/[^/?]+\/reenviar(?:[/?]|$)/.test(fullPath) ||
      /\/cpe\/[^/?]+\/resend(?:[/?]|$)/.test(fullPath) ||
      /\/cpe\/(?:worker\/)?[^/?]+\/status(?:[/?]|$)/.test(fullPath) ||
      /\/cpe\/baja\/(?:comunicacion|resumen)\/[^/?]+\/estado(?:[/?]|$)/.test(fullPath) ||
      /\/gre\/guias\/[^/?]+\/consultar-sunat(?:[/?]|$)/.test(fullPath) ||
      /\/sire\/reportes\/[^/?]+\/consultar-ticket(?:[/?]|$)/.test(fullPath);

    // Si no hay tenant, continuar normal
    if (!tenantId) {
      return next.handle();
    }

    // Verificar si es demo (usar cliente público para evitar validación de contexto)
    const { data, error } = await this.supabase.getPublicClient()
      .from('empresa_config')
      .select(
        'is_demo, pais, pais_id, ruc, sunat_environment, arca_environment, dian_environment',
      )
      .eq('tenant_id', tenantId)
      .single();

    if ((error || !data) && (isFiscalNetworkOperation || isDemoIdentityMutation)) {
      throw new ServiceUnavailableException(
        'No se pudo verificar de forma segura la configuración demo antes de una operación fiscal sensible.',
      );
    }
    if (error || !data) {
      return next.handle();
    }

    const isDemo = data.is_demo === true;

    // Si no es demo, continuar normal
    if (!isDemo) {
      return next.handle();
    }

    // RESTRICCIONES PARA DEMOS

    // La identidad fiscal sembrada forma parte del fixture demo. Se permiten
    // cambios operativos (nombre comercial, dirección, logística, etc.), pero
    // no convertir silenciosamente el fixture en otro contribuyente o país.
    if (isDemoIdentityMutation) {
      const candidate =
        request.body?.configuration && typeof request.body.configuration === 'object'
          ? request.body.configuration
          : request.body || {};
      const country = String(data.pais ?? '').trim().toUpperCase();
      const changesFiscalEnvironment =
        (country === 'PE' &&
          candidate.sunat_environment !== undefined &&
          String(candidate.sunat_environment).trim().toLowerCase() !==
            String(data.sunat_environment ?? '').trim().toLowerCase()) ||
        (country === 'AR' &&
          candidate.arca_environment !== undefined &&
          String(candidate.arca_environment).trim().toLowerCase() !==
            String(data.arca_environment ?? '').trim().toLowerCase()) ||
        (country === 'CO' &&
          candidate.dian_environment !== undefined &&
          String(candidate.dian_environment).trim().toUpperCase() !==
            String(data.dian_environment ?? '').trim().toUpperCase());
      const changesIdentity =
        (candidate.ruc !== undefined &&
          String(candidate.ruc).trim() !== String(data.ruc ?? '').trim()) ||
        (candidate.pais !== undefined &&
          String(candidate.pais).trim().toUpperCase() !==
            String(data.pais ?? '').trim().toUpperCase()) ||
        (candidate.pais_id !== undefined &&
          Number(candidate.pais_id) !== Number(data.pais_id)) ||
        changesFiscalEnvironment;

      if (changesIdentity) {
        throw new BadRequestException({
          message: 'No puedes cambiar la identidad fiscal de una empresa demo',
          suggestion:
            'Convierte tu cuenta a real para modificar RUC, país o entorno fiscal SUNAT/ARCA/DIAN',
          is_demo_restriction: true,
        });
      }
    }

    // 1. Bloquear envío real a SUNAT
    const autoridadFiscal =
      data?.pais === 'AR' ? 'ARCA' : data?.pais === 'CO' ? 'DIAN' : 'SUNAT';
    if (isFiscalNetworkOperation) {
      throw new BadRequestException({
        message: `En modo demo no se envían documentos a ${autoridadFiscal} real`,
        suggestion: 'La demo permite generar y firmar documentos, sin fabricar aceptación ni CDR fiscal',
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

    // Continuar con la ejecución normal
    return next.handle();
  }
}
