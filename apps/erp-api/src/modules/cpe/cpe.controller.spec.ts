import 'reflect-metadata';
import { PUBLIC_METADATA_KEY } from '../../common/decorators/public.decorator';
import { CpeController } from './cpe.controller';

describe('CpeController security metadata', () => {
  const workerMethods: Array<keyof CpeController> = [
    'createFromWorker',
    'enviarSunatWorker',
    'checkStatusWorker',
    'downloadPdfWorker',
  ];

  it.each(workerMethods)('marks %s as public so WorkerAuthGuard can run behind the global JwtAuthGuard', (methodName) => {
    expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, CpeController.prototype[methodName])).toBe(true);
  });
});

describe('CpeController.createComprobante', () => {
  it('entrega Idempotency-Key al servicio que reconcilia la emisión', async () => {
    const cpeService = {
      createFromComprobantePayload: jest.fn().mockResolvedValue({ id: 'cpe-1' }),
    };
    const controller = new CpeController(
      cpeService as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const payload = { tipoComprobante: '01', items: [] } as any;

    await controller.createComprobante(
      payload,
      'cpe-ui-retry-1',
      'tenant-1',
      'actor-1',
    );

    expect(cpeService.createFromComprobantePayload).toHaveBeenCalledWith(
      payload,
      'tenant-1',
      'actor-1',
      'cpe-ui-retry-1',
    );
  });
});
