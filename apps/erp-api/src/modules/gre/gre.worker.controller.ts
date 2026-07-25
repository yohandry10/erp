import { Controller, Post, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkerAuthGuard } from '../../shared/guards/worker-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { GreService } from './gre.service';

@ApiTags('gre-worker')
@Controller('gre/worker')
@Public()
@UseGuards(WorkerAuthGuard)
export class GreWorkerController {
  constructor(private readonly greService: GreService) {}

  @Post(':id/enviar-sunat')
  @ApiOperation({ summary: 'Enviar GRE a SUNAT (worker)' })
  async enviarSunatWorker(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.greService.enviarManualmenteSunat(id, tenantId, { idempotencyKey });
  }
}
