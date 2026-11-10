import { BadRequestException, ConflictException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { OriginalInventoryScopeDto, readOriginalInventoryResolutionRequest } from '../../inventario/dto/resolver-operacion-inventario.dto';
import { prepareReceiptReversalContext } from '../services/receipt-reversal-receipt';

export class ReceiptReversalScopeDto extends OriginalInventoryScopeDto {
  @IsUUID()
  source_operation_id!: string;
}
export class ReceiptReversalBodyDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_contable!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}
export class ReceiptReversalRequestDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ReceiptReversalScopeDto)
  expected_scope!: ReceiptReversalScopeDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ReceiptReversalBodyDto)
  original!: ReceiptReversalBodyDto;
}

export function readReceiptReversalRequest(request: ReceiptReversalRequestDto, tenantId: string, actorId: string, receiptId: string) {
  const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
  const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
  const scope = request?.expected_scope;
  if (!object(request) || Object.keys(request).length !== 2 || !['expected_scope', 'original'].every(k => own(request, k))
    || !object(scope) || Object.keys(scope).length !== 3 || !['tenant_id', 'actor_id', 'source_operation_id'].every(k => own(scope, k))
    || !uuid(scope.source_operation_id) || !uuid(receiptId) || !object(request.original) || !own(request.original, 'idempotency_key')) {
    throw new BadRequestException('La anulación requiere la empresa, el usuario, la recepción y la intención originales.');
  }
  const original = readOriginalInventoryResolutionRequest({
    expected_scope: { tenant_id: scope.tenant_id, actor_id: scope.actor_id }, original: request.original,
  }, tenantId, actorId);
  if (scope.source_operation_id.toLowerCase() !== receiptId.toLowerCase()) {
    throw new ConflictException('La recepción actual no corresponde al pendiente original. Conserve sus datos.');
  }
  const { idempotency_key, ...payload } = original;
  prepareReceiptReversalContext(tenantId, actorId, receiptId, idempotency_key, payload);
  return original;
}
