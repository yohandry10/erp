"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiStandardResponses = exports.ApiErrorResponse = exports.ApiResponseWrapper = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const response_dto_1 = require("../dto/response.dto");
const ApiResponseWrapper = (model, options) => {
    const { status = 200, description = 'Operación exitosa', isArray = false, example } = options || {};
    return (0, common_1.applyDecorators)((0, swagger_1.ApiExtraModels)(response_dto_1.ResponseDto, model), (0, swagger_1.ApiResponse)({
        status,
        description,
        schema: {
            allOf: [
                { $ref: (0, swagger_1.getSchemaPath)(response_dto_1.ResponseDto) },
                {
                    properties: {
                        success: {
                            type: 'boolean',
                            example: true
                        },
                        data: isArray
                            ? {
                                type: 'array',
                                items: { $ref: (0, swagger_1.getSchemaPath)(model) },
                            }
                            : { $ref: (0, swagger_1.getSchemaPath)(model) },
                        message: {
                            type: 'string',
                            example: description
                        }
                    },
                },
            ],
        },
        ...(example && { example })
    }));
};
exports.ApiResponseWrapper = ApiResponseWrapper;
const ApiErrorResponse = (status, description, errorCode) => {
    return (0, common_1.applyDecorators)((0, swagger_1.ApiExtraModels)(response_dto_1.ErrorResponseDto), (0, swagger_1.ApiResponse)({
        status,
        description,
        schema: {
            allOf: [
                { $ref: (0, swagger_1.getSchemaPath)(response_dto_1.ErrorResponseDto) },
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
    }));
};
exports.ApiErrorResponse = ApiErrorResponse;
const ApiStandardResponses = (model, options) => {
    const { successStatus = 200, successDescription = 'Operación exitosa', isArray = false, includeCommonErrors = true } = options || {};
    const decorators = [
        (0, exports.ApiResponseWrapper)(model, {
            status: successStatus,
            description: successDescription,
            isArray
        })
    ];
    if (includeCommonErrors) {
        decorators.push((0, exports.ApiErrorResponse)(400, 'Solicitud inválida', 'BAD_REQUEST'), (0, exports.ApiErrorResponse)(401, 'No autorizado', 'UNAUTHORIZED'), (0, exports.ApiErrorResponse)(403, 'Acceso denegado', 'FORBIDDEN'), (0, exports.ApiErrorResponse)(404, 'Recurso no encontrado', 'NOT_FOUND'), (0, exports.ApiErrorResponse)(500, 'Error interno del servidor', 'INTERNAL_ERROR'));
    }
    return (0, common_1.applyDecorators)(...decorators);
};
exports.ApiStandardResponses = ApiStandardResponses;
//# sourceMappingURL=api-response-wrapper.decorator.js.map