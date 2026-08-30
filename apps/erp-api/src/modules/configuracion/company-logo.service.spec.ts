import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import {
  COMPANY_ASSETS_BUCKET,
  CompanyLogoService,
  MAX_COMPANY_LOGO_BYTES,
  readCompanyLogoDimensions,
} from './company-logo.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.from('89504e470d0a1a0a0000000d4948445200000000000000000806000000', 'hex');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function pngCrc(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(pngCrc(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = makePng(100, 50);
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyK7/4/J/+ujfzooor9nwX+7U/8K/I5cX/ALxU9X+Z/9k=',
  'base64',
);

function buildService(
  rpcImpl: (name: string, args: any) => any,
  cleanupProvider: () => Array<{
    asset_id: string;
    bucket_id?: string;
    object_path: string;
  }> = () => [],
) {
  const upload = jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null });
  const remove = jest.fn().mockResolvedValue({ data: [], error: null });
  const download = jest.fn().mockResolvedValue({ data: new Blob([png]), error: null });
  const getPublicUrl = jest.fn((path: string) => ({
    data: {
      publicUrl: `https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/${COMPANY_ASSETS_BUCKET}/${path}`,
    },
  }));
  const storageApi = { upload, remove, download, getPublicUrl };
  const rpc = jest.fn(async (name: string, args: any) => {
    if (name === 'listar_limpiezas_logo_empresa_tx') {
      return { data: { cleanup: cleanupProvider() }, error: null };
    }
    return rpcImpl(name, args);
  });
  const client = { rpc, storage: { from: jest.fn(() => storageApi) } };
  const service = new CompanyLogoService({ getClient: () => client } as any);
  return { service, client, storageApi, rpc };
}

describe('CompanyLogoService', () => {
  it('reserva, sube y finaliza el logo bajo la ruta del tenant', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        return { data: { operation_id: 'op-1', object_path: path }, error: null };
      }
      if (name === 'finalizar_logo_empresa_tx') {
        return {
          data: {
            operation_id: 'op-1', asset_id: assetId, object_path: path,
            logo_url: `https://wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/company-assets/${path}`,
            completed: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    });

    const result = await ctx.service.upload(tenantId, 'actor-1', 'logo-upload-1', {
      buffer: png,
      mimetype: 'image/png',
      size: png.length,
      originalname: 'logo.png',
    });

    expect(result.logo_url).toContain(`/company-assets/${tenantId}/logos/${assetId}.png`);
    expect(ctx.storageApi.upload).toHaveBeenCalledWith(
      path,
      png,
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
    expect(ctx.rpc).toHaveBeenCalledWith(
      'reservar_logo_empresa_tx',
      expect.objectContaining({
        p_sha256: createHash('sha256').update(png).digest('hex'),
        p_bytes: png.length,
      }),
    );
  });

  it('un replay completado no vuelve a subir el objeto', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        return { data: { operation_id: 'op-1', completed: true, logo_url: 'https://prod/logo.png' }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    const result = await ctx.service.upload(tenantId, 'actor-1', 'logo-upload-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });
    expect(result.logo_url).toBe('https://prod/logo.png');
    expect(ctx.storageApi.upload).not.toHaveBeenCalled();
  });

  it('verifica la huella si Storage reporta un duplicado', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        return { data: { operation_id: 'op-1', object_path: path }, error: null };
      }
      if (name === 'finalizar_logo_empresa_tx') {
        return { data: { operation_id: 'op-1', completed: true }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.upload.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 409, message: 'The resource already exists' },
    });
    await ctx.service.upload(tenantId, 'actor-1', 'logo-upload-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });
    expect(ctx.storageApi.download).toHaveBeenCalledWith(path);
  });

  it('rechaza MIME falso y archivos mayores a 2 MiB antes de reservar', async () => {
    const ctx = buildService(() => ({ data: {}, error: null }));
    await expect(ctx.service.upload(tenantId, 'actor-1', 'logo-upload-1', {
      buffer: Buffer.from('texto'), mimetype: 'image/png', size: 5,
    })).rejects.toBeInstanceOf(BadRequestException);
    const huge = Buffer.alloc(MAX_COMPANY_LOGO_BYTES + 1, 0);
    await expect(ctx.service.upload(tenantId, 'actor-1', 'logo-upload-2', {
      buffer: huge, mimetype: 'image/png', size: huge.length,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it('rechaza dimensiones que puedan descomprimir una imagen-bomba', async () => {
    const ctx = buildService(() => ({ data: {}, error: null }));
    const oversizedDimensions = makePng(4097, 1);
    await expect(ctx.service.upload(tenantId, 'actor-1', 'logo-upload-bomb', {
      buffer: oversizedDimensions,
      mimetype: 'image/png',
      size: oversizedDimensions.length,
    })).rejects.toThrow('no superar 16 megapíxeles');
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it('no finaliza un duplicado cuyo contenido no coincide', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        return { data: { operation_id: 'op-1', object_path: path }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.upload.mockResolvedValueOnce({
      data: null, error: { statusCode: 409, message: 'already exists' },
    });
    ctx.storageApi.download.mockResolvedValueOnce({
      data: new Blob([Buffer.from('89504e470d0a1a0affffffff', 'hex')]), error: null,
    });
    await expect(ctx.service.upload(tenantId, 'actor-1', 'logo-upload-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('elimina el objeto y finaliza el borrado idempotente', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    const ctx = buildService((name) => {
      if (name === 'reservar_borrado_logo_empresa_tx') {
        return { data: { operation_id: 'delete-1', object_path: path }, error: null };
      }
      if (name === 'finalizar_borrado_logo_empresa_tx') {
        return { data: { operation_id: 'delete-1', logo_url: null, completed: true }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    const result = await ctx.service.remove(tenantId, 'actor-1', 'logo-delete-1');
    expect(ctx.storageApi.remove).toHaveBeenCalledWith([path]);
    expect(result.logo_url).toBeNull();
  });

  it('recupera un borrado fallido tras recargar y usar una nueva clave', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    let pending = false;
    const ctx = buildService((name, args) => {
      if (name === 'reservar_borrado_logo_empresa_tx') {
        if (args.p_idempotency_key === 'logo-delete-before-reload') {
          pending = true;
          return { data: { operation_id: 'delete-old', asset_id: assetId, object_path: path }, error: null };
        }
        return {
          data: {
            operation_id: 'delete-new', logo_url: null, estado: 'SIN_OBJETO', completed: true,
          },
          error: null,
        };
      }
      if (name === 'confirmar_limpieza_logo_empresa_tx') {
        pending = false;
        return { data: { asset_id: assetId, estado: 'BORRADA' }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    }, () => pending ? [{ asset_id: assetId, object_path: path }] : []);
    ctx.storageApi.remove
      .mockResolvedValueOnce({ data: null, error: { statusCode: 503, message: 'Storage unavailable' } })
      .mockResolvedValue({ data: [], error: null });

    await expect(ctx.service.remove(
      tenantId,
      'actor-1',
      'logo-delete-before-reload',
    )).rejects.toThrow('No se pudo borrar el logo');

    const result = await ctx.service.remove(
      tenantId,
      'actor-1',
      'logo-delete-after-reload',
    );
    expect(ctx.storageApi.remove).toHaveBeenNthCalledWith(2, [path]);
    expect(ctx.rpc).toHaveBeenCalledWith('confirmar_limpieza_logo_empresa_tx', {
      p_tenant_id: tenantId,
      p_actor_id: 'actor-1',
      p_asset_id: assetId,
    });
    expect(result).toEqual(expect.objectContaining({ completed: true, cleanup_pending: false }));
  });

  it('reconcilia todos los reemplazos pendientes sin cruzar tenant ni actor', async () => {
    const first = {
      asset_id: '33333333-3333-4333-8333-333333333333',
      object_path: `${tenantId}/logos/old-1.png`,
    };
    const second = {
      asset_id: '44444444-4444-4444-8444-444444444444',
      object_path: `${tenantId}/logos/old-2.png`,
    };
    let pending = [first, second];
    const ctx = buildService((name, args) => {
      if (name === 'confirmar_limpieza_logo_empresa_tx') {
        pending = pending.filter((item) => item.asset_id !== args.p_asset_id);
        return { data: { asset_id: args.p_asset_id, estado: 'BORRADA' }, error: null };
      }
      if (name === 'reservar_logo_empresa_tx') {
        return {
          data: { operation_id: 'upload-replay', completed: true, logo_url: 'https://prod/logo.png' },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    }, () => pending);

    const result = await ctx.service.upload(tenantId, 'actor-1', 'logo-upload-reconcile', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });

    expect(ctx.storageApi.remove).toHaveBeenCalledTimes(2);
    expect(ctx.storageApi.remove).toHaveBeenNthCalledWith(1, [first.object_path]);
    expect(ctx.storageApi.remove).toHaveBeenNthCalledWith(2, [second.object_path]);
    expect(ctx.rpc).toHaveBeenCalledWith('listar_limpiezas_logo_empresa_tx', {
      p_tenant_id: tenantId,
      p_actor_id: 'actor-1',
    });
    expect(result.cleanup_pending).toBe(false);
  });

  it('adopta la misma ruta tras recargar cuando Storage subió pero la finalización falló', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    let reservations = 0;
    let finalizations = 0;
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        reservations += 1;
        return {
          data: {
            operation_id: reservations === 1 ? 'upload-old' : 'upload-adopted',
            asset_id: assetId,
            object_path: path,
            adopted_from_operation_id: reservations === 1 ? undefined : 'upload-old',
          },
          error: null,
        };
      }
      if (name === 'finalizar_logo_empresa_tx') {
        finalizations += 1;
        if (finalizations === 1) {
          return { data: null, error: { code: '503', message: 'PostgREST unavailable' } };
        }
        return {
          data: {
            operation_id: 'upload-adopted', asset_id: assetId,
            object_path: path, logo_url: 'https://prod/logo.png', completed: true,
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.upload
      .mockResolvedValueOnce({ data: { path }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { statusCode: 409, message: 'The resource already exists' },
      });

    await expect(ctx.service.upload(tenantId, 'actor-1', 'logo-upload-before-reload', {
      buffer: png, mimetype: 'image/png', size: png.length,
    })).rejects.toThrow('PostgREST unavailable');

    const result = await ctx.service.upload(tenantId, 'actor-1', 'logo-upload-after-reload', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });
    expect(ctx.storageApi.upload).toHaveBeenNthCalledWith(
      2,
      path,
      png,
      expect.objectContaining({ upsert: false }),
    );
    expect(ctx.storageApi.download).toHaveBeenCalledWith(path);
    expect(result).toEqual(expect.objectContaining({
      asset_id: assetId,
      completed: true,
      cleanup_pending: false,
    }));
  });

  it('tolera dos intenciones concurrentes que adoptan un único objeto', async () => {
    const path = `${tenantId}/logos/${assetId}.png`;
    let reservation = 0;
    const ctx = buildService((name) => {
      if (name === 'reservar_logo_empresa_tx') {
        reservation += 1;
        return {
          data: {
            operation_id: `upload-concurrent-${reservation}`,
            asset_id: assetId,
            object_path: path,
          },
          error: null,
        };
      }
      if (name === 'finalizar_logo_empresa_tx') {
        return {
          data: { asset_id: assetId, object_path: path, completed: true },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    let stored = false;
    ctx.storageApi.upload.mockImplementation(async () => {
      if (!stored) {
        stored = true;
        return { data: { path }, error: null };
      }
      return { data: null, error: { statusCode: 409, message: 'already exists' } };
    });

    const [first, second] = await Promise.all([
      ctx.service.upload(tenantId, 'actor-1', 'logo-upload-concurrent-a', {
        buffer: png, mimetype: 'image/png', size: png.length,
      }),
      ctx.service.upload(tenantId, 'actor-1', 'logo-upload-concurrent-b', {
        buffer: png, mimetype: 'image/png', size: png.length,
      }),
    ]);

    expect(ctx.storageApi.upload).toHaveBeenCalledTimes(2);
    expect(ctx.storageApi.download).toHaveBeenCalledTimes(1);
    expect(first.asset_id).toBe(assetId);
    expect(second.asset_id).toBe(assetId);
  });
});

describe('readCompanyLogoDimensions', () => {
  it('lee dimensiones PNG y JPEG desde sus cabeceras reales', () => {
    expect(readCompanyLogoDimensions(makePng(320, 180), 'image/png'))
      .toEqual({ width: 320, height: 180 });
    expect(readCompanyLogoDimensions(jpeg, 'image/jpeg'))
      .toEqual({ width: 2, height: 1 });
  });

  it('rechaza PNG truncado, sin IDAT/IEND o con CRC corrupto', () => {
    expect(readCompanyLogoDimensions(pngHeader(100, 50), 'image/png')).toBeNull();
    expect(readCompanyLogoDimensions(png.subarray(0, -12), 'image/png')).toBeNull();
    const corrupted = Buffer.from(png);
    corrupted[corrupted.length - 5] ^= 0xff;
    expect(readCompanyLogoDimensions(corrupted, 'image/png')).toBeNull();
  });

  it('rechaza JPEG truncado o sin EOI aunque conserve SOI y SOF', () => {
    expect(readCompanyLogoDimensions(jpeg.subarray(0, -2), 'image/jpeg')).toBeNull();
    expect(readCompanyLogoDimensions(Buffer.from('ffd8ffc00011080032006403ffd9', 'hex'), 'image/jpeg'))
      .toBeNull();
  });
});
