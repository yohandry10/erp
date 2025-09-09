"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponseDto = void 0;
class ApiResponseDto {
    constructor(success, data, message, error) {
        this.success = success;
        this.data = data;
        this.message = message;
        this.error = error;
        this.timestamp = new Date();
    }
    static success(data, message) {
        return new ApiResponseDto(true, data, message);
    }
    static error(error, message) {
        return new ApiResponseDto(false, undefined, message, error);
    }
}
exports.ApiResponseDto = ApiResponseDto;
//# sourceMappingURL=response.dto.js.map