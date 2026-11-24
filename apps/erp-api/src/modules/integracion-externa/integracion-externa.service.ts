import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { generarCredencial } from './integracion-externa.contract';
import {
  CrearIntegracionExternaDto,
  RevocarIntegracionExternaDto,
  RotarIntegracionExternaDto,
  VencimientoIntegracionExternaDto,
} from './dto/integracion-externa.dto';

const COLUMNAS_SECRETO = 'id, credencial_id, prefijo, estado, valido_hasta, retirado_en, created_at';
const COLUMNAS_CREDENCIAL =
  'id, tenant_id, sucursal_id, nombre, sistema, estado, expira_en, creada_por, revocada_en, revocada_por, ' +
  'motivo_revocacion, vencimiento_registrado_en, ultimo_uso_en, created_at, updated_at';

/**
 * Administración de credenciales de integración externa. Cada operación es una
 * RPC atómica que exige `users.manage` en la base y deja su evento en la misma
 * transacción. Los secretos se generan aquí, se devuelven una sola vez y a la
 * base sólo llega su hash.
 */
@Injectable()
export class IntegracionExternaService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(tenantId: string) {
    const client = this.supabase.getClient();
    const [credenciales, secretos, sucursales] = await Promise.all([
      client.from('integracion_externa_credenciales').select(COLUMNAS_CREDENCIAL)
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      client.from('integracion_externa_secretos').select(COLUMNAS_SECRETO)
        .eq('tenant_id', tenantId).neq('estado', 'RETIRADO'),
      client.from('sucursales').select('id, nombre, codigo_establecimiento').eq('tenant_id', tenantId),
    ]);
    if (credenciales.error || secretos.error || sucursales.error) {
      throw new ServiceUnavailableException('No se pudieron cargar las integraciones externas');
    }
    const nombreSucursal = new Map((sucursales.data ?? []).map((s: any) => [s.id, s.nombre]));
    const ahora = Date.now();
    return (credenciales.data ?? []).map((c: any) => ({
      ...c,
      sucursal_nombre: nombreSucursal.get(c.sucursal_id) ?? null,
      vencida: c.estado === 'ACTIVA' && new Date(c.expira_en).getTime() <= ahora,
      secretos: (secretos.data ?? []).filter((s: any) => s.credencial_id === c.id),
    }));
  }

  async eventos(tenantId: string, credencialId: string, limite = 100) {
    const { data, error } = await this.supabase.getClient()
      .from('integracion_externa_eventos')
      .select('id, evento, codigo, actor_id, sucursal_id, sistema, actor_externo_id, actor_externo_nombre, metodo, ruta, ip, secreto_id, detalle, created_at')
      .eq('tenant_id', tenantId)
      .eq('credencial_id', credencialId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limite, 1), 500));
    if (error) throw new ServiceUnavailableException('No se pudieron cargar los eventos de la integración');
    return data ?? [];
  }

  async crear(tenantId: string, actorId: string, dto: CrearIntegracionExternaDto) {
    const secreto = generarCredencial();
    const data = await this.rpc('crear_integracion_externa_621', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_sucursal_id: dto.sucursal_id,
      p_nombre: dto.nombre,
      p_sistema: dto.sistema,
      p_expira_en: dto.expira_en,
      p_prefijo: secreto.prefijo,
      p_hash: secreto.hash,
      p_idempotency_key: dto.idempotency_key,
    });
    return { ...data, credencial: secreto.token };
  }

  async rotar(tenantId: string, actorId: string, credencialId: string, dto: RotarIntegracionExternaDto) {
    const secreto = generarCredencial();
    const data = await this.rpc('rotar_integracion_externa_621', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_credencial_id: credencialId,
      p_prefijo: secreto.prefijo,
      p_hash: secreto.hash,
      p_gracia_horas: dto.gracia_horas,
    });
    return { ...data, credencial: secreto.token };
  }

  finalizarRotacion(tenantId: string, actorId: string, credencialId: string) {
    return this.rpc('finalizar_rotacion_integracion_externa_621', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_credencial_id: credencialId,
    });
  }

  actualizarVencimiento(tenantId: string, actorId: string, credencialId: string, dto: VencimientoIntegracionExternaDto) {
    return this.rpc('actualizar_vencimiento_integracion_externa_621', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_credencial_id: credencialId,
      p_expira_en: dto.expira_en,
    });
  }

  revocar(tenantId: string, actorId: string, credencialId: string, dto: RevocarIntegracionExternaDto) {
    return this.rpc('revocar_integracion_externa_621', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_credencial_id: credencialId,
      p_motivo: dto.motivo,
    });
  }

  private async rpc(fn: string, params: Record<string, unknown>): Promise<Record<string, any>> {
    let respuesta: { data: any; error: any };
    try {
      respuesta = await this.supabase.getClient().rpc(fn, params);
    } catch {
      throw new ServiceUnavailableException('INTEGRACION_ADMINISTRACION_NO_DISPONIBLE');
    }
    if (respuesta.error) throw IntegracionExternaService.aHttp(respuesta.error);
    return respuesta.data ?? {};
  }

  static aHttp(error: { code?: string; message?: string }): HttpException {
    // El código de negocio va antes de «:»; el resto (un id) no se expone.
    const codigo = String(error?.message ?? '').split(':')[0].trim() || 'INTEGRACION_ADMINISTRACION_NO_DISPONIBLE';
    switch (error?.code) {
      case '42501':
        return new ForbiddenException(codigo);
      case '22023':
        return new BadRequestException(codigo);
      case 'P0002':
        return new NotFoundException(codigo);
      case '23505':
      case '23514':
      case '55000':
        return new ConflictException(codigo);
      default:
        return new ServiceUnavailableException('INTEGRACION_ADMINISTRACION_NO_DISPONIBLE');
    }
  }
}
