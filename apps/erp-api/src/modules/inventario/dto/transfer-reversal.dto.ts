import { BadRequestException, ConflictException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { OriginalInventoryScopeDto, readOriginalInventoryResolutionRequest } from './resolver-operacion-inventario.dto';
import { prepareTransferReversalContext } from '../transfer-reversal-receipt';

export class TransferReversalScopeDto extends OriginalInventoryScopeDto {
  @IsUUID()
  source_operation_id!: string;
}

export class TransferReversalBodyDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsUUID()
  guia_remision_id?: string | null;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

export class TransferReversalRequestDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TransferReversalScopeDto)
  expected_scope!: TransferReversalScopeDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TransferReversalBodyDto)
  original!: TransferReversalBodyDto;
}

/** All recovery actions stay bound to the captured actor, company and source. */
export function readTransferReversalRequest(request: TransferReversalRequestDto, tenantId: string, actorId: string, operationId: string) {
  const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
  const uuid = (v: any): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
  const scope = request?.expected_scope;
  if (!object(request) || Object.keys(request).length !== 2 || !['expected_scope', 'original'].every(k => own(request, k))
    || !object(scope) || Object.keys(scope).length !== 3 || !['tenant_id', 'actor_id', 'source_operation_id'].every(k => own(scope, k))
    || !uuid(scope.source_operation_id) || !uuid(operationId) || !object(request.original) || !own(request.original, 'idempotency_key')) {
    throw new BadRequestException('La anulación requiere la empresa, el usuario, la transferencia y la intención originales.');
  }
  // The existing checker intentionally accepts only these two identity fields.
  const original = readOriginalInventoryResolutionRequest({
    expected_scope: { tenant_id: scope.tenant_id, actor_id: scope.actor_id }, original: request.original,
  }, tenantId, actorId);
  if (scope.source_operation_id.toLowerCase() !== operationId.toLowerCase()) {
    throw new ConflictException('La transferencia actual no corresponde al pendiente original. Conserve sus datos.');
  }
  const { idempotency_key, ...payload } = original;
  prepareTransferReversalContext(tenantId, actorId, operationId, idempotency_key, payload);
  return original;
}
