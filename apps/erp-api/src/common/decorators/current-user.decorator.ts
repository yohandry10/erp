import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para obtener el usuario completo del request o una propiedad específica
 * 
 * Uso:
 * @Get()
 * getProfile(@CurrentUser() user: any) {
 *   return user;
 * }
 * 
 * @Get()
 * getUserId(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      return undefined;
    }
    
    // Si se solicita una propiedad específica, retornarla
    if (data) {
      return user[data];
    }
    
    // Si no se solicita propiedad específica, retornar el usuario completo
    return user;
  },
);
