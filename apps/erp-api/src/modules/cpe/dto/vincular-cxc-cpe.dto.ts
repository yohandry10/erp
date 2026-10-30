import { IsUUID } from 'class-validator';

export class VincularCxcCpeDto {
  @IsUUID('4')
  cliente_id!: string;
}
