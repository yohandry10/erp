import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ProductImagesService } from './product-images.service';

const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');

function buildService(rpcImpl: (name: string, args: any) => any) {
  const upload = jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null });
  const remove = jest.fn().mockResolvedValue({ data: [], error: null });
  const download = jest.fn().mockResolvedValue({ data: new Blob([png]), error: null });
  const getPublicUrl = jest.fn((path: string) => ({
    data: { publicUrl: `https://prod.supabase.co/storage/v1/object/public/product-images/${path}` },
  }));
  const storageApi = { upload, remove, download, getPublicUrl };
  const rpc = jest.fn(async (name: string, args: any) => rpcImpl(name, args));
  const client = {
    rpc,
    storage: { from: jest.fn(() => storageApi) },
  };
  const service = new ProductImagesService({ getClient: () => client } as any);
  return { service, client, storageApi, rpc };
}

describe('ProductImagesService', () => {
  it('reserva, sube y finaliza una imagen con la misma huella', async () => {
    const path = 'tenant/product/image.png';
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', object_path: path, completed: false }, error: null };
      }
      if (name === 'finalizar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', imagen_url: 'https://prod/image.png', completed: true }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });

    const result = await ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-1', {
      buffer: png, mimetype: 'image/png', size: png.length, originalname: 'producto.png',
    });

    expect(result.completed).toBe(true);
    expect(ctx.storageApi.upload).toHaveBeenCalledWith(
      path,
      png,
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
    expect(ctx.rpc).toHaveBeenCalledWith(
      'reservar_imagen_producto_tx',
      expect.objectContaining({
        p_sha256: createHash('sha256').update(png).digest('hex'),
        p_bytes: png.length,
      }),
    );
  });

  it('un replay completado no vuelve a subir el objeto', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', completed: true, imagen_url: 'https://prod/image.png' }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });

    const result = await ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });

    expect(result.imagen_url).toBe('https://prod/image.png');
    expect(ctx.storageApi.upload).not.toHaveBeenCalled();
  });

  it('si Storage reporta duplicado verifica bytes antes de finalizar', async () => {
    const path = 'tenant/product/image.png';
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', object_path: path, completed: false }, error: null };
      }
      if (name === 'finalizar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', completed: true }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.upload.mockResolvedValueOnce({
      data: null, error: { statusCode: 409, message: 'The resource already exists' },
    });

    await ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });

    expect(ctx.storageApi.download).toHaveBeenCalledWith(path);
  });

  it('rechaza una extensión declarada que no coincide con la firma binaria', async () => {
    const ctx = buildService(() => ({ data: {}, error: null }));

    await expect(ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-1', {
      buffer: Buffer.from('texto'), mimetype: 'image/png', size: 5,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.rpc).not.toHaveBeenCalled();
  });

  it('no finaliza un duplicado si la huella almacenada es distinta', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-1', object_path: 'tenant/product/image.png' }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.upload.mockResolvedValueOnce({
      data: null, error: { statusCode: 409, message: 'already exists' },
    });
    ctx.storageApi.download.mockResolvedValueOnce({
      data: new Blob([Buffer.from('89504e470d0a1a0affffffff', 'hex')]), error: null,
    });

    await expect(ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-1', {
      buffer: png, mimetype: 'image/png', size: png.length,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reemplazar elimina el objeto anterior y confirma su metadata', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-2', object_path: 'tenant/product/new.webp' }, error: null };
      }
      if (name === 'finalizar_imagen_producto_tx') {
        return {
          data: {
            operation_id: 'op-2', completed: true,
            cleanup: { imagen_id: 'old-image', bucket_id: 'product-images', object_path: 'tenant/product/old.webp' },
          },
          error: null,
        };
      }
      if (name === 'confirmar_limpieza_imagen_producto_tx') {
        return { data: { imagen_id: 'old-image', estado: 'BORRADA' }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    const webp = Buffer.from('524946460000000057454250', 'hex');

    const result = await ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-2', {
      buffer: webp, mimetype: 'image/webp', size: webp.length,
    });

    expect(ctx.storageApi.remove).toHaveBeenCalledWith(['tenant/product/old.webp']);
    expect(result.cleanup_pending).toBe(false);
  });

  it('mantiene la operación reintentable si Storage no puede limpiar la imagen anterior', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_imagen_producto_tx') {
        return { data: { operation_id: 'op-3', object_path: 'tenant/product/new.png' }, error: null };
      }
      if (name === 'finalizar_imagen_producto_tx') {
        return {
          data: {
            operation_id: 'op-3', completed: true,
            cleanup: { imagen_id: 'old-image', bucket_id: 'product-images', object_path: 'tenant/product/old.png' },
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada ${name}`);
    });
    ctx.storageApi.remove.mockResolvedValueOnce({
      data: null, error: { statusCode: 503, message: 'Storage unavailable' },
    });

    const result = await ctx.service.upload('tenant-1', 'actor-1', 'product-1', 'upload-key-3', {
      buffer: png, mimetype: 'image/png', size: png.length,
    });

    expect(result.cleanup_pending).toBe(true);
    expect(ctx.rpc).not.toHaveBeenCalledWith(
      'confirmar_limpieza_imagen_producto_tx',
      expect.anything(),
    );
  });

  it('borrar despeja la referencia antes de remover Storage y luego finaliza', async () => {
    const ctx = buildService((name) => {
      if (name === 'reservar_borrado_imagen_producto_tx') {
        return {
          data: { operation_id: 'delete-1', object_path: 'tenant/product/image.png', completed: false },
          error: null,
        };
      }
      if (name === 'finalizar_borrado_imagen_producto_tx') {
        return { data: { operation_id: 'delete-1', estado: 'BORRADA', completed: true }, error: null };
      }
      throw new Error(`RPC inesperada ${name}`);
    });

    const result = await ctx.service.remove(
      'tenant-1', 'actor-1', 'product-1', 'delete-image-key',
    );

    expect(ctx.storageApi.remove).toHaveBeenCalledWith(['tenant/product/image.png']);
    expect(result.estado).toBe('BORRADA');
  });
});
