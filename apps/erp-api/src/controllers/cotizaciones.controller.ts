import { Controller, Get } from '@nestjs/common';

@Controller('cotizaciones')
export class CotizacionesController {
  @Get()
  getCotizaciones() {
    return {
      message: 'Cotizaciones endpoint - En desarrollo',
      data: []
    };
  }
}