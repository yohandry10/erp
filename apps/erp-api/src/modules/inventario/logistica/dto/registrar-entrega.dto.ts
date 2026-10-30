import {IsIn,IsObject,IsString,MaxLength} from 'class-validator';
import {OperacionLogisticaDto} from './operacion-logistica.dto';
export class RegistrarEntregaDto extends OperacionLogisticaDto {
 @IsIn(['ENTREGADO']) estado!: 'ENTREGADO';
 @IsString() @MaxLength(10000) notas!: string;
 @IsObject() expected_snapshot!: Record<string,unknown>;
}
