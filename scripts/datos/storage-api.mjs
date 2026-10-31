// Cliente mínimo de la API de Supabase Storage para respaldo y restauración.
// La clave de servicio nunca se imprime ni se escribe en disco.
import { createHash } from 'node:crypto';

export function clienteStorage(base, clave) {
  const url = base.replace(/\/+$/, '');
  const cabeceras = { Authorization: `Bearer ${clave}`, apikey: clave };
  const ruta = (bucket, nombre) => `${encodeURIComponent(bucket)}/${nombre.split('/').map(encodeURIComponent).join('/')}`;
  async function pedir(metodo, camino, { cuerpo, tipo, json = true, aceptar = [] } = {}) {
    const res = await fetch(`${url}${camino}`, {
      method: metodo,
      headers: { ...cabeceras, ...(tipo ? { 'Content-Type': tipo } : {}) },
      body: cuerpo,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok && !aceptar.includes(res.status)) {
      const detalle = (await res.text()).slice(0, 300);
      throw new Error(`Storage ${metodo} ${camino.split('?')[0]} respondió ${res.status}: ${detalle}`);
    }
    if (!json) return res;
    return res.status === 204 ? null : res.json();
  }
  return {
    async buckets() {
      return pedir('GET', '/bucket');
    },
    /** Lista todos los objetos de un bucket recorriendo carpetas. */
    async objetos(bucket, prefijo = '') {
      const encontrados = [];
      for (let offset = 0; ; offset += 1000) {
        const pagina = await pedir('POST', `/object/list/${encodeURIComponent(bucket)}`, {
          tipo: 'application/json',
          cuerpo: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
        });
        for (const e of pagina) {
          const nombre = `${prefijo}${e.name}`;
          if (e.id === null) encontrados.push(...(await this.objetos(bucket, `${nombre}/`)));
          else encontrados.push({ nombre, tipo: e.metadata?.mimetype ?? null, bytes: e.metadata?.size ?? null });
        }
        if (pagina.length < 1000) break;
      }
      return encontrados;
    },
    async descargar(bucket, nombre) {
      const res = await pedir('GET', `/object/authenticated/${ruta(bucket, nombre)}`, { json: false });
      return { datos: Buffer.from(await res.arrayBuffer()), tipo: res.headers.get('content-type') };
    },
    async crearBucket(b) {
      return pedir('POST', '/bucket', {
        tipo: 'application/json',
        cuerpo: JSON.stringify({ id: b.id, name: b.name ?? b.id, public: Boolean(b.public),
          file_size_limit: b.file_size_limit ?? null, allowed_mime_types: b.allowed_mime_types ?? null }),
      });
    },
    async subir(bucket, nombre, datos, tipo) {
      const res = await pedir('POST', `/object/${ruta(bucket, nombre)}`, {
        cuerpo: datos, tipo: tipo || 'application/octet-stream', json: false, aceptar: [400, 409],
      });
      if (res.ok) return 'SUBIDO';
      const texto = await res.text();
      if (/already exists|Duplicate/i.test(texto)) return 'EXISTE';
      throw new Error(`Storage no aceptó ${bucket}/${nombre}: ${texto.slice(0, 200)}`);
    },
  };
}

export const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');

/** Sólo destinos de loopback: restaurar en un proyecto remoto es una operación destructiva aparte. */
export function exigirLoopback(base) {
  const host = new URL(base).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host))
    throw new Error(`Destino ${host} rechazado: la restauración automática sólo escribe en Storage local`);
}
