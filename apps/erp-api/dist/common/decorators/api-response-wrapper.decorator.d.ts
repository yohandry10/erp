import { Type } from '@nestjs/common';
export declare const ApiResponseWrapper: <TModel extends Type<any>>(model: TModel, options?: {
    status?: number;
    description?: string;
    isArray?: boolean;
    example?: any;
}) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare const ApiErrorResponse: (status: number, description: string, errorCode?: string) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
export declare const ApiStandardResponses: <TModel extends Type<any>>(model: TModel, options?: {
    successStatus?: number;
    successDescription?: string;
    isArray?: boolean;
    includeCommonErrors?: boolean;
}) => <TFunction extends Function, Y>(target: TFunction | object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<Y>) => void;
