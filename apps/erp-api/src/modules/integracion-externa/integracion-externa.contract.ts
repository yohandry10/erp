import { SetMetadata } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Contrato de la credencial de integración externa (migración 621).
 *
 * Un sistema externo opera con una credencial ligada a una empresa y a una
 * sucursal. La credencial viaja en una cabecera propia, nunca junto a una
 * sesión de usuario, y sólo la aceptan las rutas marcadas con
 * `@PermiteIntegracionExterna`.
 */
export const CABECERA_CREDENCIAL = 'x-integracion-credencial';
export const CABECERA_ACTOR_ID = 'x-actor-externo-id';
/** Nombre codificado con `encodeURIComponent` para admitir tildes. */
export const CABECERA_ACTOR_NOMBRE = 'x-actor-externo-nombre';

/** Techo de permisos. La migración 621 fija la misma lista en la base. */
export const PERMISOS_INTEGRACION: readonly string[] = [
  'pos.vender',
  'pos.read',
  'pos.caja.write',
  'inventario.productos.read',
  'cpe.comprobantes.descargar_pdf',
];

export const RUTA_INTEGRACION_KEY = 'integracion_externa_ruta';

export interface RutaIntegracionOptions {
  /** Las rutas que cobran o mueven caja exigen la persona que opera. */
  actorExterno: 'requerido' | 'opcional';
}

export const PermiteIntegracionExterna = (options: RutaIntegracionOptions) =>
  SetMetadata(RUTA_INTEGRACION_KEY, options);

export interface ActorExterno {
  id: string;
  nombre: string;
}

export interface PrincipalIntegracion {
  credencial_id: string;
  tenant_id: string;
  sucursal_id: string;
  cuenta_tecnica_id: string;
  nombre: string;
  sistema: string;
  secreto_id: string;
  actor_externo: ActorExterno | null;
}

const TOKEN = /^erpint_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$/;
const ALFABETO_PREFIJO = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function hashCredencial(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parsearCredencial(token: unknown): { prefijo: string; hash: string } | null {
  if (typeof token !== 'string') return null;
  const match = TOKEN.exec(token.trim());
  return match ? { prefijo: match[1], hash: hashCredencial(token.trim()) } : null;
}

/** Genera el secreto que se muestra una sola vez y lo que se guarda de él. */
export function generarCredencial(): { token: string; prefijo: string; hash: string } {
  const bytes = randomBytes(12);
  const prefijo = Array.from(bytes, (b) => ALFABETO_PREFIJO[b % ALFABETO_PREFIJO.length]).join('');
  const token = `erpint_${prefijo}_${randomBytes(32).toString('base64url')}`;
  return { token, prefijo, hash: hashCredencial(token) };
}

const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Lee la persona externa de las cabeceras. `null` si no viene; lanza si viene
 * incompleta o malformada para que el guard responda 400.
 */
export function leerActorExterno(headers: Record<string, unknown>): ActorExterno | null {
  const rawId = headers?.[CABECERA_ACTOR_ID];
  const rawNombre = headers?.[CABECERA_ACTOR_NOMBRE];
  if (rawId === undefined && rawNombre === undefined) return null;
  if (typeof rawId !== 'string' || typeof rawNombre !== 'string') {
    throw new Error('INTEGRACION_ACTOR_EXTERNO_INVALIDO');
  }
  let nombre: string;
  try {
    nombre = decodeURIComponent(rawNombre).trim();
  } catch {
    throw new Error('INTEGRACION_ACTOR_EXTERNO_INVALIDO');
  }
  const id = rawId.trim();
  if (!ACTOR_ID.test(id) || nombre.length < 1 || nombre.length > 160 || CONTROL.test(nombre)) {
    throw new Error('INTEGRACION_ACTOR_EXTERNO_INVALIDO');
  }
  return { id, nombre };
}

const CLAVES_TENANT = ['tenant_id', 'tenantId'];
const CLAVES_SUCURSAL = ['sucursal_id', 'sucursalId'];
const CABECERAS_TENANT = ['x-tenant-id', 'x-tenantid', 'x-erp-tenant-id'];

function valores(origen: unknown, claves: string[]): string[] {
  if (!origen || typeof origen !== 'object' || Array.isArray(origen)) return [];
  const out: string[] = [];
  for (const clave of claves) {
    const valor = (origen as Record<string, unknown>)[clave];
    if (valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) out.push(typeof v === 'string' ? v : JSON.stringify(v));
  }
  return out;
}

/**
 * Lo que el request declara de empresa y sucursal. La credencial manda: si
 * algo de esto no coincide, la base rechaza la petición y la audita.
 */
export function alcanceDeclarado(request: any): { tenant: string[]; sucursal: string[] } {
  return {
    tenant: [
      ...valores(request?.body, CLAVES_TENANT),
      ...valores(request?.query, CLAVES_TENANT),
      ...valores(request?.headers, CABECERAS_TENANT),
    ],
    sucursal: [...valores(request?.body, CLAVES_SUCURSAL), ...valores(request?.query, CLAVES_SUCURSAL)],
  };
}

/** Códigos que la base devuelve y su estado HTTP. */
export const ESTADO_POR_CODIGO: Record<string, 400 | 401 | 403> = {
  INTEGRACION_CREDENCIAL_INVALIDA: 401,
  INTEGRACION_CREDENCIAL_REVOCADA: 401,
  INTEGRACION_CREDENCIAL_VENCIDA: 401,
  INTEGRACION_SECRETO_RETIRADO: 401,
  INTEGRACION_CUENTA_INACTIVA: 401,
  INTEGRACION_RUTA_NO_PERMITIDA: 403,
  INTEGRACION_ALCANCE_TENANT: 403,
  INTEGRACION_ALCANCE_SUCURSAL: 403,
  INTEGRACION_ACTOR_EXTERNO_REQUERIDO: 400,
};

export function esIntegracion(user: any): boolean {
  return user?.auth_type === 'integracion_externa';
}
