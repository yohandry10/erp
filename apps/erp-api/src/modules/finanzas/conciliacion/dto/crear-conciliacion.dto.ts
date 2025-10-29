import {
  IsDateString,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CrearConciliacionDto {
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id!: string;

  @IsString({ message: 'El período es requerido' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'El período debe estar en formato YYYY-MM (ej: 2025-10)' })
  periodo!: string;

  @IsDateString({}, { message: 'La fecha desde debe ser una fecha válida' })
  fecha_desde!: string;

  @IsDateString({}, { message: 'La fecha hasta debe ser una fecha válida' })
  fecha_hasta!: string;
}
