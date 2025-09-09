import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse, getSchemaPath, ApiExtraModels } from '@nestjs/swagger';
import { ResponseDto, ErrorResponseDto } from '../dto/response.dto';

/**
 * Decorador personalizado para respuestas estandarizadas de la API
 * Combina el ResponseDto con el tipo de datos específico para documentación automática
 */
export const ApiResponseWrapper = <TModel extends Type<any>>(
  model: TModel,
  options?: {
    status?: number;
    description?: string;
    isArray?: boolean;
    example?: any;
  }
) => {
  const { 
    status = 200, 
    description = 'Operación exitosa', 
    isArray = false,
    example
  } = options || {};

  return applyDecorators(
    ApiExtraModels(ResponseDto, model),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResponseDto) },
          {
            properties: {
              success: {
                type: 'boolean',
                example: true
              },
              data: isArray
                ? {
                    type: 'array',
                    items: { $ref: getSchemaPath(model) },
                  }
                : { $ref: getSchemaPath(model) },
              message: {
                type: 'string',
                example: description
              }
            },
          },
        ],
      },
      ...(example && { example })
    })
  );
};

/**
 * Decorador para respuestas de error estandarizadas
 */
export const ApiErrorResponse = (
  status: number, 
  description: string,
  errorCode?: string
) => {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ErrorResponseDto) },
          {
            properties: {
              success: { 
                type: 'boolean', 
                example: false 
              },
              error: { 
                type: 'string', 
                example: description 
              },
              data: { 
                type: 'null' 
              },
              ...(errorCode && {
                errorCode: {
                  type: 'string',
                  example: errorCode
                }
              })
            },
          },
        ],
      },
    })
  );
};

/**
 * Decorador combinado para respuestas exitosas y de error
 */
export const ApiStandardResponses = <TModel extends Type<any>>(
  model: TModel,
  options?: {
    successStatus?: number;
    successDescription?: string;
    isArray?: boolean;
    includeCommonErrors?: boolean;
  }
) => {
  const {
    successStatus = 200,
    successDescription = 'Operación exitosa',
    isArray = false,
    includeCommonErrors = true
  } = options || {};

  const decorators = [
    ApiResponseWrapper(model, {
      status: successStatus,
      description: successDescription,
      isArray
    })
  ];

  if (includeCommonErrors) {
    decorators.push(
      ApiErrorResponse(400, 'Solicitud inválida', 'BAD_REQUEST'),
      ApiErrorResponse(401, 'No autorizado', 'UNAUTHORIZED'),
      ApiErrorResponse(403, 'Acceso denegado', 'FORBIDDEN'),
      ApiErrorResponse(404, 'Recurso no encontrado', 'NOT_FOUND'),
      ApiErrorResponse(500, 'Error interno del servidor', 'INTERNAL_ERROR')
    );
  }

  return applyDecorators(...decorators);
};