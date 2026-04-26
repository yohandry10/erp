import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * DTO genérico para respuestas estandarizadas de la API
 * Proporciona una estructura consistente para todas las respuestas
 */
export class ResponseDto<T> {
  @ApiProperty({ 
    description: 'Indica si la operación fue exitosa',
    example: true
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ 
    description: 'Datos de la respuesta', 
    required: false 
  })
  @IsOptional()
  data?: T;

  @ApiProperty({ 
    description: 'Mensaje descriptivo de la operación', 
    required: false,
    example: 'Operación completada exitosamente'
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ 
    description: 'Mensaje de error en caso de fallo', 
    required: false,
    example: 'Error al procesar la solicitud'
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiProperty({ 
    description: 'Metadatos adicionales de la respuesta', 
    required: false 
  })
  @IsOptional()
  metadata?: {
    timestamp?: string;
    requestId?: string;
    version?: string;
    [key: string]: any;
  };
}

/**
 * DTO para respuestas paginadas
 * Extiende ResponseDto agregando información de paginación
 */
export class PaginatedResponseDto<T> extends ResponseDto<T[]> {
  @ApiProperty({ 
    description: 'Información de paginación',
    example: {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
      hasNext: true,
      hasPrev: false
    }
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * DTO para respuestas de error estandarizadas
 */
export class ErrorResponseDto extends ResponseDto<null> {
  @ApiProperty({ 
    description: 'Siempre false para errores',
    example: false
  })
  success: false;

  @ApiProperty({ 
    description: 'Siempre null para errores',
    example: null
  })
  data: null;

  @ApiProperty({ 
    description: 'Código de error específico',
    example: 'VALIDATION_ERROR'
  })
  errorCode?: string;

  @ApiProperty({ 
    description: 'Detalles adicionales del error',
    example: [{ field: 'email', message: 'Email is required' }]
  })
  details?: any[];
}