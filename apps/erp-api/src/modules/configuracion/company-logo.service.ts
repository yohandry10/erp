import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { SupabaseService } from '../../shared/supabase/supabase.service';

export type CompanyLogoUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type CompanyLogoOperation = {
  operation_id: string;
  asset_id?: string;
  bucket_id?: string;
  object_path?: string;
  logo_url?: string | null;
  completed?: boolean;
  cleanup?: {
    asset_id: string;
    bucket_id: string;
    object_path: string;
  };
  cleanup_pending?: boolean;
  [key: string]: unknown;
};

type CompanyLogoCleanup = {
  asset_id: string;
  bucket_id?: string;
  object_path: string;
};

type CompanyLogoCleanupList = {
  cleanup?: CompanyLogoCleanup[];
};

export const COMPANY_ASSETS_BUCKET = 'company-assets';
export const MAX_COMPANY_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_COMPANY_LOGO_DIMENSION = 4096;
export const MAX_COMPANY_LOGO_PIXELS = 16_000_000;
const ALLOWED_COMPANY_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

let pngCrcTable: Uint32Array | undefined;

function calculatePngCrc(bytes: Buffer): number {
  if (!pngCrcTable) {
    pngCrcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) !== 0
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
      }
      pngCrcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngPassLength(size: number, start: number, step: number): number {
  return size <= start ? 0 : Math.ceil((size - start) / step);
}

function validateInflatedPng(
  compressed: Buffer,
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  interlace: number,
): boolean {
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) return false;
  const bitsPerPixel = channels * bitDepth;
  const passes = interlace === 0
    ? [[0, 0, 1, 1]]
    : [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ];
  const rows: Array<{ count: number; bytes: number }> = [];
  let expectedBytes = 0;
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = pngPassLength(width, startX, stepX);
    const passHeight = pngPassLength(height, startY, stepY);
    if (passWidth === 0 || passHeight === 0) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    expectedBytes += passHeight * (rowBytes + 1);
    rows.push({ count: passHeight, bytes: rowBytes });
  }
  const maxDecodedBytes = MAX_COMPANY_LOGO_PIXELS * 4 + MAX_COMPANY_LOGO_DIMENSION;
  if (expectedBytes < 1 || expectedBytes > maxDecodedBytes) return false;

  let inflated: Buffer;
  try {
    inflated = inflateSync(compressed, { maxOutputLength: expectedBytes });
  } catch {
    return false;
  }
  if (inflated.length !== expectedBytes) return false;
  let offset = 0;
  for (const row of rows) {
    for (let index = 0; index < row.count; index++) {
      if (inflated[offset] > 4) return false;
      offset += row.bytes + 1;
    }
  }
  return offset === inflated.length;
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 57
    || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  ) {
    return null;
  }
  let offset = 8;
  let chunkIndex = 0;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let sawIdat = false;
  let idatClosed = false;
  let sawIend = false;
  let sawPalette = false;
  const idat: Buffer[] = [];

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const crcOffset = dataStart + length;
    if (crcOffset + 4 > bytes.length) return null;
    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    const storedCrc = bytes.readUInt32BE(crcOffset);
    if (calculatePngCrc(bytes.subarray(typeStart, crcOffset)) !== storedCrc) return null;
    const data = bytes.subarray(dataStart, crcOffset);

    if (chunkIndex === 0 && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (chunkIndex !== 0 || length !== 13) return null;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        width < 1
        || height < 1
        || !validDepths[colorType]?.includes(bitDepth)
        || data[10] !== 0
        || data[11] !== 0
        || ![0, 1].includes(interlace)
      ) {
        return null;
      }
    } else if (type === 'PLTE') {
      if (sawIdat || sawPalette || length < 3 || length > 768 || length % 3 !== 0) {
        return null;
      }
      if (colorType === 0 || colorType === 4) return null;
      sawPalette = true;
    } else if (type === 'IDAT') {
      if (idatClosed || length === 0 || (colorType === 3 && !sawPalette)) return null;
      sawIdat = true;
      idat.push(data);
    } else if (type === 'IEND') {
      if (!sawIdat || sawIend || length !== 0) return null;
      sawIend = true;
      offset = crcOffset + 4;
      if (offset !== bytes.length) return null;
      break;
    } else {
      if (sawIdat) idatClosed = true;
      // Un chunk crítico desconocido no puede ignorarse de forma segura.
      if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) return null;
    }
    offset = crcOffset + 4;
    chunkIndex++;
  }
  if (!sawIend || !sawIdat || width < 1 || height < 1) return null;
  if (
    width > MAX_COMPANY_LOGO_DIMENSION
    || height > MAX_COMPANY_LOGO_DIMENSION
    || width * height > MAX_COMPANY_LOGO_PIXELS
  ) {
    return { width, height };
  }
  return validateInflatedPng(
    Buffer.concat(idat), width, height, bitDepth, colorType, interlace,
  ) ? { width, height } : null;
}

function validateJpegTableSegment(marker: number, data: Buffer): boolean {
  if (marker === 0xdb) {
    let offset = 0;
    while (offset < data.length) {
      const precision = data[offset] >>> 4;
      const tableId = data[offset] & 0x0f;
      if (precision > 1 || tableId > 3) return false;
      offset += 1 + (precision === 0 ? 64 : 128);
    }
    return offset === data.length;
  }
  if (marker === 0xc4) {
    let offset = 0;
    while (offset < data.length) {
      if (offset + 17 > data.length) return false;
      const tableClass = data[offset] >>> 4;
      const tableId = data[offset] & 0x0f;
      if (tableClass > 1 || tableId > 3) return false;
      let symbols = 0;
      for (let index = 1; index <= 16; index++) symbols += data[offset + index];
      if (symbols < 1 || symbols > 256 || offset + 17 + symbols > data.length) return false;
      offset += 17 + symbols;
    }
    return offset === data.length;
  }
  return true;
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 16
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff
    || bytes[bytes.length - 1] !== 0xd9
  ) {
    return null;
  }
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2]);
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  let sawQuantization = false;
  let sawHuffman = false;
  let sawScan = false;
  let entropyBytes = 0;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const markerStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      return offset === bytes.length
        && Boolean(dimensions)
        && sawQuantization
        && sawHuffman
        && sawScan
        && entropyBytes > 0
        ? dimensions
        : null;
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01
        || (marker >= 0xd0 && marker <= 0xd7)) {
      return null;
    }
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const data = bytes.subarray(offset + 2, offset + segmentLength);

    if (sofMarkers.has(marker)) {
      if (dimensions || data.length < 6) return null;
      const components = data[5];
      if (
        data[0] !== 8
        || ![1, 3, 4].includes(components)
        || segmentLength !== 8 + 3 * components
      ) {
        return null;
      }
      dimensions = { height: data.readUInt16BE(1), width: data.readUInt16BE(3) };
      if (dimensions.width < 1 || dimensions.height < 1) return null;
    } else if (marker === 0xdb || marker === 0xc4) {
      if (!validateJpegTableSegment(marker, data)) return null;
      if (marker === 0xdb) sawQuantization = true;
      if (marker === 0xc4) sawHuffman = true;
    } else if (marker === 0xda) {
      const components = data[0];
      if (!dimensions || components < 1 || segmentLength !== 6 + 2 * components) return null;
      sawScan = true;
      offset += segmentLength;
      const scanStart = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const escapeStart = offset++;
        while (offset < bytes.length && bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) return null;
        const escapedMarker = bytes[offset];
        if (escapedMarker === 0x00 || (escapedMarker >= 0xd0 && escapedMarker <= 0xd7)) {
          offset++;
          continue;
        }
        entropyBytes += escapeStart - scanStart;
        offset = escapeStart;
        break;
      }
      continue;
    }
    offset += segmentLength;
    if (offset <= markerStart) return null;
  }
  return null;
}

export function readCompanyLogoDimensions(
  bytes: Buffer,
  mimetype: string,
): { width: number; height: number } | null {
  if (mimetype === 'image/png') return readPngDimensions(bytes);
  if (mimetype === 'image/jpeg') return readJpegDimensions(bytes);
  return null;
}

@Injectable()
export class CompanyLogoService {
  private readonly logger = new Logger(CompanyLogoService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async upload(
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
    file: CompanyLogoUpload | undefined,
  ): Promise<CompanyLogoOperation> {
    this.requireContext(actorId, idempotencyKey);
    this.validateFile(file);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const client = this.supabase.getClient();
    await this.reconcilePendingCleanups(client, tenantId, actorId);
    const reservation = await this.rpc<CompanyLogoOperation>('reservar_logo_empresa_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_idempotency_key: idempotencyKey,
      p_sha256: checksum,
      p_mime_type: file.mimetype,
      p_bytes: file.size,
    });

    if (reservation.completed) {
      const cleanupPending = await this.reconcilePendingCleanups(client, tenantId, actorId);
      return { ...reservation, cleanup_pending: cleanupPending };
    }
    if (!reservation.object_path || !reservation.operation_id) {
      throw new ConflictException('La reserva del logo no devolvió una ruta utilizable');
    }

    const storage = client.storage.from(COMPANY_ASSETS_BUCKET);
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
          `No se pudo almacenar el logo empresarial: ${uploadError.message}`,
        );
      }
      await this.assertStoredObjectMatches(storage, reservation.object_path, checksum);
    }

    const publicUrl = storage.getPublicUrl(reservation.object_path).data.publicUrl;
    if (!publicUrl) {
      throw new BadRequestException('Supabase Storage no devolvió la URL pública del logo');
    }
    const completed = await this.rpc<CompanyLogoOperation>('finalizar_logo_empresa_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operation_id: reservation.operation_id,
      p_public_url: publicUrl,
    });
    const cleanupPending = await this.reconcilePendingCleanups(client, tenantId, actorId);
    return { ...completed, cleanup_pending: cleanupPending };
  }

  async remove(
    tenantId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<CompanyLogoOperation> {
    this.requireContext(actorId, idempotencyKey);
    const client = this.supabase.getClient();
    await this.reconcilePendingCleanups(client, tenantId, actorId);
    const reservation = await this.rpc<CompanyLogoOperation>(
      'reservar_borrado_logo_empresa_tx',
      {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (reservation.completed || !reservation.object_path) {
      const cleanupPending = await this.reconcilePendingCleanups(client, tenantId, actorId);
      return { ...reservation, cleanup_pending: cleanupPending };
    }

    const { error } = await client.storage
      .from(COMPANY_ASSETS_BUCKET)
      .remove([reservation.object_path]);
    if (error && !this.isNotFound(error)) {
      throw new BadRequestException(
        `No se pudo borrar el logo de Supabase Storage: ${error.message}`,
      );
    }
    const completed = await this.rpc<CompanyLogoOperation>('finalizar_borrado_logo_empresa_tx', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_operation_id: reservation.operation_id,
    });
    const cleanupPending = await this.reconcilePendingCleanups(client, tenantId, actorId);
    return { ...completed, cleanup_pending: cleanupPending };
  }

  private requireContext(actorId: string, idempotencyKey: string): void {
    if (!String(actorId || '').trim()) {
      throw new BadRequestException('No se pudo identificar al actor de la operación');
    }
    const key = String(idempotencyKey || '').trim();
    if (key.length < 8 || key.length > 180) {
      throw new BadRequestException('Idempotency-Key debe tener entre 8 y 180 caracteres');
    }
  }

  private validateFile(
    file: CompanyLogoUpload | undefined,
  ): asserts file is CompanyLogoUpload {
    if (!file?.buffer || file.size < 1 || file.buffer.length < 1) {
      throw new BadRequestException('Seleccione un logo empresarial');
    }
    if (file.size !== file.buffer.length) {
      throw new BadRequestException('El tamaño declarado del logo no coincide con su contenido');
    }
    if (file.size > MAX_COMPANY_LOGO_BYTES) {
      throw new BadRequestException('El logo no puede superar 2 MB');
    }
    if (!ALLOWED_COMPANY_LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Use un logo PNG o JPG');
    }
    const bytes = file.buffer;
    const isJpeg = bytes.length >= 3
      && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    if (
      (file.mimetype === 'image/jpeg' && !isJpeg)
      || (file.mimetype === 'image/png' && !isPng)
    ) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con el formato de imagen declarado',
      );
    }
    const dimensions = readCompanyLogoDimensions(bytes, file.mimetype);
    if (!dimensions) {
      throw new BadRequestException('No se pudieron validar las dimensiones del logo');
    }
    if (
      dimensions.width < 1
      || dimensions.height < 1
      || dimensions.width > MAX_COMPANY_LOGO_DIMENSION
      || dimensions.height > MAX_COMPANY_LOGO_DIMENSION
      || dimensions.width * dimensions.height > MAX_COMPANY_LOGO_PIXELS
    ) {
      throw new BadRequestException(
        'El logo debe medir entre 1 y 4096 px por lado y no superar 16 megapíxeles',
      );
    }
  }

  private async assertStoredObjectMatches(
    storage: any,
    objectPath: string,
    expectedChecksum: string,
  ): Promise<void> {
    const { data, error } = await storage.download(objectPath);
    if (error || !data) {
      throw new ConflictException(
        'La ruta idempotente ya existe y no se pudo verificar su contenido',
      );
    }
    const actual = createHash('sha256')
      .update(Buffer.from(await data.arrayBuffer()))
      .digest('hex');
    if (actual !== expectedChecksum) {
      throw new ConflictException('La ruta idempotente ya contiene otro archivo');
    }
  }

  private async reconcilePendingCleanups(
    client: ReturnType<SupabaseService['getClient']>,
    tenantId: string,
    actorId: string,
  ): Promise<boolean> {
    let cleanups: CompanyLogoCleanup[];
    try {
      const response = await this.rpc<CompanyLogoCleanupList>(
        'listar_limpiezas_logo_empresa_tx',
        { p_tenant_id: tenantId, p_actor_id: actorId },
      );
      cleanups = Array.isArray(response.cleanup) ? response.cleanup : [];
    } catch (error) {
      this.logger.warn(
        `No se pudieron consultar las limpiezas de logos pendientes: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }

    let pending = false;
    for (const cleanup of cleanups) {
      if (!cleanup?.asset_id || !cleanup.object_path) {
        pending = true;
        continue;
      }
      const { error } = await client.storage
        .from(cleanup.bucket_id || COMPANY_ASSETS_BUCKET)
        .remove([cleanup.object_path]);
      if (error && !this.isNotFound(error)) {
        this.logger.warn(`Limpieza Storage pendiente para logo ${cleanup.asset_id}`);
        pending = true;
        continue;
      }
      try {
        await this.rpc('confirmar_limpieza_logo_empresa_tx', {
          p_tenant_id: tenantId,
          p_actor_id: actorId,
          p_asset_id: cleanup.asset_id,
        });
      } catch (error) {
        this.logger.warn(
          `Logo eliminado de Storage, pero su metadata quedó pendiente: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        pending = true;
      }
    }
    return pending;
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
    const message = String(error.message || 'Error gestionando el logo empresarial');
    if (error.code === '42501' || /ACTOR_INVALID|ACTOR_MISMATCH|FORBIDDEN/.test(message)) {
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
