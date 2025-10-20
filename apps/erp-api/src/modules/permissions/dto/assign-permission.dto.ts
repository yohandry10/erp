import { IsUUID } from 'class-validator';

export class AssignPermissionDto {
  @IsUUID('4')
  permiso_id: string;
}
