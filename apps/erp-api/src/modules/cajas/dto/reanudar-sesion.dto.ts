import { IsOptional, IsUUID } from 'class-validator';

export class ReanudarSesionDto {
    @IsOptional()
    @IsUUID()
    usuario_id?: string; // Usuario que reanuda (para validación)
}
