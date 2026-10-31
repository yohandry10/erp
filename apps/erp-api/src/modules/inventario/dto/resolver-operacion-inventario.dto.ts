import { BadRequestException, ConflictException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsUUID, ValidateNested } from 'class-validator';
import { RegistrarAjusteInventarioDto, TransferirInventarioDto } from './operacion-inventario.dto';

export class OriginalInventoryScopeDto {
  @IsUUID()
  tenant_id!: string;

  @IsUUID()
  actor_id!: string;
}

export class ResolverAjusteOriginalDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => OriginalInventoryScopeDto)
  expected_scope!: OriginalInventoryScopeDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => RegistrarAjusteInventarioDto)
  original!: RegistrarAjusteInventarioDto;
}

export class ResolverTransferenciaOriginalDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => OriginalInventoryScopeDto)
  expected_scope!: OriginalInventoryScopeDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TransferirInventarioDto)
  original!: TransferirInventarioDto;
}

export function readOriginalInventoryResolutionRequest<T>(request: { expected_scope: OriginalInventoryScopeDto; original: T }, tenantId: string, actorId: string): T {
  const object = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
  const uuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const scope = request?.expected_scope;
  if (!object(request) || Object.keys(request).length !== 2 || !['original', 'expected_scope'].every(k => Object.prototype.hasOwnProperty.call(request, k))
    || !object(request.original) || !object(scope) || Object.keys(scope).length !== 2
    || !['tenant_id', 'actor_id'].every(k => Object.prototype.hasOwnProperty.call(scope, k))
    || !uuid(scope.tenant_id) || !uuid(scope.actor_id) || !uuid(tenantId) || !uuid(actorId)) {
    throw new BadRequestException('La resolución requiere la empresa, el usuario y los datos originales del pendiente.');
  }
  if (scope.tenant_id.toLowerCase() !== tenantId.toLowerCase() || scope.actor_id.toLowerCase() !== actorId.toLowerCase()) {
    throw new ConflictException('La sesión actual no corresponde a la empresa y al usuario originales. Conserve el pendiente y vuelva a su sesión original.');
  }
  return request.original;
}
