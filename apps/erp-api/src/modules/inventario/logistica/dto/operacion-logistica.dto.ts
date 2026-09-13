import { IsString, Length } from 'class-validator';

export class OperacionLogisticaDto {
  @IsString()
  @Length(8, 200)
  idempotency_key!: string;
}
