import { Controller, Get } from '@nestjs/common';

@Controller('contabilidad')
export class ContabilidadController {
  @Get()
  getContabilidad() {
    return {
      message: 'Contabilidad endpoint - En desarrollo',
      data: []
    };
  }
}