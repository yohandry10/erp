import { Controller, Get } from '@nestjs/common';

@Controller('usuarios')
export class UsuariosController {
  @Get()
  getUsuarios() {
    return {
      message: 'Usuarios endpoint - En desarrollo',
      data: []
    };
  }
}