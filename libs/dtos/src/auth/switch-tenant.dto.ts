import { IsUUID, IsNotEmpty } from 'class-validator';

export class SwitchTenantDto {
  @IsUUID('4')
  @IsNotEmpty()
  target_tenant_id: string;
}
