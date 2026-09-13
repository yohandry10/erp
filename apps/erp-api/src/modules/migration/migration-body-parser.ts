import { json, RequestHandler } from 'express';
import { BadRequestException } from '@nestjs/common';

// El DTO admite hasta 20 MiB base64. Reservar margen para el JSON sólo en
// migración; el límite por defecto del resto de rutas permanece en 100 KiB.
export function migrationBodyParser(): RequestHandler {
  const parse = json({ limit: '21mb' });
  // Nest detecta parsers instalados por el nombre del middleware. Un wrapper
  // evita que este parser acotado suprima el parser general de las otras rutas.
  return function migrationJsonParser(request, response, next) {
    parse(request, response, (error?: { type?: string }) => {
      next(error?.type === 'entity.parse.failed'
        ? new BadRequestException('El cuerpo JSON de la solicitud no es válido') : error);
    });
  };
}
