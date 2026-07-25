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
