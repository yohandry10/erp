import { IsString, Matches } from 'class-validator';

/**
 * El identificador del supervisor vive en la ruta y el tenant/actor provienen
 * del JWT. El body contiene sólo el secreto nuevo; nunca acepta hash, versión,
 * tenant ni estado suministrados por el cliente.
 */
export class RotarPinSupervisorDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El PIN debe contener exactamente 6 dígitos',
  })
  pin: string;
}
