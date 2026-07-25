import 'reflect-metadata';
import { PUBLIC_METADATA_KEY } from '../../common/decorators/public.decorator';
import { GreWorkerController } from './gre.worker.controller';

describe('GreWorkerController security metadata', () => {
  it('is public so WorkerAuthGuard can run behind the global JwtAuthGuard', () => {
    expect(Reflect.getMetadata(PUBLIC_METADATA_KEY, GreWorkerController)).toBe(true);
  });
});
