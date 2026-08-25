import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CerrarCajaDto {
  /**
   * Autorización de supervisor. `cerrar_caja_tx` la exige cuando la diferencia
   * entre lo contado y lo esperado supera la tolerancia del tenant
   * (CASH_CLOSE_SUPERVISOR_REQUIRED). Antes no existía forma de enviarla desde el
   * POS: el cierre sólo mandaba monto y notas, así que una caja descuadrada no
   * tenía manera de completarse. El PIN se verifica contra su hash antes de
   * llamar a la RPC y se vuelve a acreditar dentro de la transacción; quién
   * decide si hacía falta sigue siendo el writer autoritativo.
   */
  @IsOptional()
  @IsUUID('4')
  supervisor_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'El código de supervisor debe tener 6 dígitos' })
  codigo_supervisor?: string;

  @IsNumber()
  @IsNotEmpty()
  monto_cierre: number;

  @IsOptional()
  @IsNumber()
  monto_contado?: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsOptional()
  resumen?: Record<string, any>;

  @IsOptional()
  @IsString()
  sesion_id?: string;

  @IsOptional()
  @IsString()
  sesionId?: string;
}
