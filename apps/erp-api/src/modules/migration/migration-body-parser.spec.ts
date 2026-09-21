import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { migrationBodyParser } from './migration-body-parser';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';

@Controller()
class PayloadController {
  @Post(['migration/preview', 'ordinary'])
  receive(@Body() body: { fileBase64: string }) { return { length: body.fileBase64.length }; }
}
@Module({ controllers: [PayloadController] })
class PayloadModule {}

describe('límite HTTP de importaciones', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create(PayloadModule, { logger: false });
    app.use('/api/migration', migrationBodyParser());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('acepta archivos superiores al límite JSON predeterminado de Nest', async () => {
    const fileBase64 = Buffer.from('a,b\n1,2\n'.repeat(20_000)).toString('base64');
    await request(app.getHttpServer()).post('/api/migration/preview').send({ fileBase64 })
      .expect(201).expect({ length: fileBase64.length });
  });
  it('mantiene 100 KiB en las demás rutas', async () => {
    await request(app.getHttpServer()).post('/api/ordinary').send({ fileBase64: 'a'.repeat(110_000) }).expect(413);
  });
  it('rechaza cargas mayores a 21 MiB en migración', async () => {
    await request(app.getHttpServer()).post('/api/migration/preview')
      .send({ fileBase64: 'a'.repeat(21 * 1024 * 1024) }).expect(413);
  });
  it('informa JSON inválido sin devolver contenido del archivo', async () => {
    const response = await request(app.getHttpServer()).post('/api/migration/preview')
      .set('Content-Type', 'application/json').send('{"fileBase64": "private-file-content"').expect(400);
    expect(response.body.message).toBe('El cuerpo JSON de la solicitud no es válido');
    expect(JSON.stringify(response.body)).not.toContain('private-file-content');
  });
});
