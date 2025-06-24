import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RrhhService } from './rrhh.service';
import { PlanillasService } from './planillas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('rrhh')
export class RrhhController {
  constructor(
    private readonly rrhhService: RrhhService,
    private readonly planillasService: PlanillasService
  ) {}

  @Get('empleados')
  async getEmpleados() {
    return this.rrhhService.getEmpleados();
  }

  @Get('departamentos')
  async getDepartamentos() {
    return this.rrhhService.getDepartamentos();
  }

  @Post('empleados')
  async createEmpleado(@Body() empleadoData: any) {
    return this.rrhhService.createEmpleado(empleadoData);
  }

  @Post('departamentos')
  async createDepartamento(@Body() departamentoData: any) {
    return this.rrhhService.createDepartamento(departamentoData);
  }

  @Get('planillas')
  async getPlanillas() {
    return this.planillasService.getPlanillas();
  }

  @Post('planillas')
  async crearPlanilla(@Body() planillaData: any) {
    console.log('Creando planilla con datos:', planillaData);
    return this.planillasService.crearPlanilla(planillaData);
  }

  @Post('planillas/:id/calcular')
  async calcularPlanilla(@Param('id') planillaId: string) {
    return this.planillasService.calcularPlanillaMensual(planillaId);
  }

  @Get('planillas/:id/detalle')
  async getDetallePlanilla(@Param('id') planillaId: string) {
    return this.planillasService.getDetallePlanilla(planillaId);
  }

  @Get('boleta/:empleadoPlanillaId')
  async getBoleta(@Param('empleadoPlanillaId') empleadoPlanillaId: string) {
    return this.planillasService.getBoleta(empleadoPlanillaId);
  }

  @Put('planillas/:id')
  async updatePlanilla(@Param('id') planillaId: string, @Body() updateData: any) {
    return this.planillasService.updatePlanilla(planillaId, updateData);
  }

  @Delete('planillas/:id')
  async deletePlanilla(@Param('id') planillaId: string) {
    console.log('🗑️ Eliminando planilla:', planillaId);
    return this.planillasService.deletePlanilla(planillaId);
  }

  @Get('debug/empleados-contratos')
  async debugEmpleadosContratos() {
    return this.rrhhService.debugEmpleadosContratos();
  }

  @Get('conceptos')
  async getConceptos() {
    return this.planillasService.getConceptos();
  }

  @Post('planillas/:id/calcular-personalizada')
  async calcularPlanillaPersonalizada(@Param('id') planillaId: string, @Body() empleadosData: any) {
    console.log('🧮 Calculando planilla personalizada:', planillaId);
    return this.planillasService.calcularPlanillaPersonalizada(planillaId, empleadosData.empleados);
  }
} 