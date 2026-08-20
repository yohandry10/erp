import { applyDecorators } from '@nestjs/common';
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * UUID opcional que además acepta la cadena vacía.
 *
 * Los formularios inicializan los selectores en `''` y lo envían tal cual
 * cuando el usuario no elige nada. Los writers ya lo contemplan: convierten con
 * `NULLIF(valor,'')::uuid`, de modo que `''` significa "sin valor". Un
 * `@IsOptional()` a secas sólo salta null y undefined, así que rechazaría ese
 * `''` y convertiría en 400 un envío que hoy funciona.
 */
export function IsUuidOpcional(): PropertyDecorator {
  return applyDecorators(
    ValidateIf((_objeto, valor) => valor !== undefined && valor !== null && valor !== ''),
    IsUUID('4'),
  );
}
