import { Controller, Get } from '@nestjs/common';

@Controller('inventario')
export class InventarioController {
  @Get()
  getInventario() {
    return {
      message: 'Inventario endpoint - En desarrollo',
      data: []
    };
  }
}