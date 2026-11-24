import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import {
  CABECERA_CREDENCIAL,
  ESTADO_POR_CODIGO,
  PrincipalIntegracion,
  RutaIntegracionOptions,
  alcanceDeclarado,
  leerActorExterno,
  parsearCredencial,
} from './integracion-externa.contract';

/**
 * Autentica una petición con credencial de integración externa.
 *
 * La decisión completa (secreto, revocación, vencimiento, gracia de rotación,
 * ruta permitida, alcance de empresa y sucursal, persona externa) la toma la
 * RPC `autenticar_integracion_externa_621`, que además deja el uso o el
 * rechazo en la auditoría dentro de la misma transacción. Aquí sólo se reúnen
 * los datos del request y se traduce el veredicto a HTTP. Cualquier fallo de
 * infraestructura cierra el paso: nunca se cae a la sesión de usuario.
 */
@Injectable()
export class IntegracionExternaAuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async autenticar(request: any, ruta: RutaIntegracionOptions | undefined): Promise<PrincipalIntegracion> {
    const credencial = parsearCredencial(request?.headers?.[CABECERA_CREDENCIAL]);
    if (!credencial) {
      throw new UnauthorizedException('INTEGRACION_CREDENCIAL_INVALIDA');
    }

    let actorExterno: PrincipalIntegracion['actor_externo'];
    try {
      actorExterno = leerActorExterno(request?.headers ?? {});
    } catch {
      throw new BadRequestException('INTEGRACION_ACTOR_EXTERNO_INVALIDO');
    }

    const alcance = alcanceDeclarado(request);
    const contexto = {
      metodo: String(request?.method ?? ''),
      ruta: String(request?.path ?? request?.url ?? '').slice(0, 300),
      ip: String(request?.ip ?? ''),
      ruta_permitida: Boolean(ruta),
      actor_externo_requerido: ruta?.actorExterno === 'requerido',
      actor_externo_id: actorExterno?.id ?? null,
      actor_externo_nombre: actorExterno?.nombre ?? null,
      tenant_solicitado: alcance.tenant,
      sucursal_solicitada: alcance.sucursal,
    };

    let data: any;
    try {
      const respuesta = await this.supabase.getPublicClient().rpc('autenticar_integracion_externa_621', {
        p_prefijo: credencial.prefijo,
        p_hash: credencial.hash,
        p_contexto: contexto,
      });
      if (respuesta.error) throw respuesta.error;
      data = respuesta.data;
    } catch {
      throw new ServiceUnavailableException('INTEGRACION_AUTENTICACION_NO_DISPONIBLE');
    }

    if (!data || typeof data !== 'object' || data.ok !== true) {
      const codigo = typeof data?.codigo === 'string' ? data.codigo : 'INTEGRACION_CREDENCIAL_INVALIDA';
      const estado = ESTADO_POR_CODIGO[codigo] ?? 401;
      if (estado === 400) throw new BadRequestException(codigo);
      if (estado === 403) throw new ForbiddenException(codigo);
      throw new UnauthorizedException(codigo);
    }

    return {
      credencial_id: data.credencial_id,
      tenant_id: data.tenant_id,
      sucursal_id: data.sucursal_id,
      cuenta_tecnica_id: data.cuenta_tecnica_id,
      nombre: data.nombre,
      sistema: data.sistema,
      secreto_id: data.secreto_id,
      actor_externo: actorExterno,
    };
  }
}
