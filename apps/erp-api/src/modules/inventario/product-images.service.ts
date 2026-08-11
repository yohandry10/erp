import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';

export type ProductImageUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type ImageOperation = {
  operation_id: string;
  producto_id: string;
  imagen_id?: string;
  bucket_id?: string;
  object_path?: string;
  imagen_url?: string;
  completed?: boolean;
  cleanup?: {
    imagen_id: string;
    bucket_id: string;
    object_path: string;
  };
  [key: string]: unknown;
};

const PRODUCT_IMAGE_BUCKET = 'product-images';
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async upload(
    tenantId: string,
    actorId: string,
    productId: string,
    idempotencyKey: string,
    file: ProductImageUpload | undefined,
  ): Promise<ImageOperation> {
    this.validateFile(file);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const client = this.supabase.getClient();
    const reservation = await this.rpc<ImageOperation>('reservar_imagen_producto_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_producto_id: productId,
      p_idempotency_key: idempotencyKey,
      p_sha256: checksum,
      p_mime_type: file.mimetype,
      p_bytes: file.size,
    });

    if (reservation.completed) {
      return this.retryReplacementCleanup(client, tenantId, actorId, reservation);
    }
    if (!reservation.object_path || !reservation.operation_id) {
      throw new ConflictException('La reserva de imagen no devolvió una ruta utilizable');
    }

    const storage = client.storage.from(PRODUCT_IMAGE_BUCKET);
    const { error: uploadError } = await storage.upload(
      reservation.object_path,
      file.buffer,
      {
        cacheControl: '3600',
        contentType: file.mimetype,
        upsert: false,
      },
    );
    if (uploadError) {
      if (!this.isAlreadyExists(uploadError)) {
        throw new BadRequestException(
          `No se pudo almacenar la imagen del producto: ${uploadError.message}`,
        );
      }
      await this.assertStoredObjectMatches(storage, reservation.object_path, checksum);
    }

    const publicUrl = storage.getPublicUrl(reservation.object_path).data.publicUrl;
    if (!publicUrl) {
      throw new BadRequestException('Supabase Storage no devolvió la URL pública de la imagen');
    }
    const completed = await this.rpc<ImageOperation>('finalizar_imagen_producto_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operation_id: reservation.operation_id,
      p_public_url: publicUrl,
    });
    return this.retryReplacementCleanup(client, tenantId, actorId, completed);
  }

  async remove(
    tenantId: string,
    actorId: string,
    productId: string,
    idempotencyKey: string,
  ): Promise<ImageOperation> {
    const client = this.supabase.getClient();
    const reservation = await this.rpc<ImageOperation>(
      'reservar_borrado_imagen_producto_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_producto_id: productId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (reservation.completed || !reservation.object_path) {
      return reservation;
    }

    const { error } = await client.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .remove([reservation.object_path]);
    if (error && !this.isNotFound(error)) {
      throw new BadRequestException(
        `No se pudo borrar la imagen de Supabase Storage: ${error.message}`,
      );
    }
    return this.rpc<ImageOperation>('finalizar_borrado_imagen_producto_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operation_id: reservation.operation_id,
    });
  }

  private validateFile(
    file: ProductImageUpload | undefined,
  ): asserts file is ProductImageUpload {
    if (!file?.buffer || file.size < 1) {
      throw new BadRequestException('Seleccione una imagen para el producto');
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new BadRequestException('La imagen no puede superar 5 MB');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Use una imagen JPG, PNG o WebP');
    }

    const bytes = file.buffer;
    const isJpeg = bytes.length >= 3
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const isWebp = bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    const matchesMime =
      (file.mimetype === 'image/jpeg' && isJpeg)
      || (file.mimetype === 'image/png' && isPng)
      || (file.mimetype === 'image/webp' && isWebp);
    if (!matchesMime) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con el formato de imagen declarado',
      );
    }
  }

  private async assertStoredObjectMatches(
    storage: ReturnType<ReturnType<SupabaseService['getClient']>['storage']['from']>,
    objectPath: string,
    expectedChecksum: string,
  ): Promise<void> {
    const { data, error } = await storage.download(objectPath);
    if (error || !data) {
      throw new ConflictException(
        'La ruta reservada ya existe y no se pudo verificar su contenido',
      );
    }
    const actual = createHash('sha256')
      .update(Buffer.from(await data.arrayBuffer()))
      .digest('hex');
    if (actual !== expectedChecksum) {
      throw new ConflictException(
        'La ruta idempotente ya contiene un objeto con otra huella',
      );
    }
  }

  private async retryReplacementCleanup(
    client: ReturnType<SupabaseService['getClient']>,
    tenantId: string,
    actorId: string,
    operation: ImageOperation,
  ): Promise<ImageOperation> {
    if (!operation.cleanup?.object_path || !operation.cleanup.imagen_id) {
      return operation;
    }
    const { error } = await client.storage
      .from(operation.cleanup.bucket_id || PRODUCT_IMAGE_BUCKET)
      .remove([operation.cleanup.object_path]);
    if (error && !this.isNotFound(error)) {
      this.logger.warn(
        `Limpieza Storage pendiente para imagen reemplazada ${operation.cleanup.imagen_id}`,
      );
      return { ...operation, cleanup_pending: true };
    }
    try {
      await this.rpc('confirmar_limpieza_imagen_producto_tx', {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_imagen_id: operation.cleanup.imagen_id,
      });
      return { ...operation, cleanup_pending: false };
    } catch (error) {
      this.logger.warn(
        `Objeto reemplazado eliminado, pero su metadata quedó pendiente: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ...operation, cleanup_pending: true };
    }
  }

  private isAlreadyExists(error: { message?: string; statusCode?: string | number }): boolean {
    return Number(error.statusCode) === 409
      || /already exists|duplicate/i.test(String(error.message || ''));
  }

  private isNotFound(error: { message?: string; statusCode?: string | number }): boolean {
    return Number(error.statusCode) === 404
      || /not found|does not exist/i.test(String(error.message || ''));
  }

  private async rpc<T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await this.supabase.getClient().rpc(name, args);
    if (!error) return (data ?? {}) as T;

    const message = String(error.message || 'Error en imágenes de producto');
    if (error.code === '42501' || message.includes('ACTOR_INVALID')) {
      throw new ForbiddenException('El actor no pertenece al tenant o está inactivo');
    }
    if (error.code === '23503' || message.includes('NOT_FOUND')) {
      throw new NotFoundException(message);
    }
    if (error.code === '23505' || message.includes('DIFFERENT_PAYLOAD')) {
      throw new ConflictException(message);
    }
    throw new BadRequestException(message);
  }
}

export { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_BUCKET };
