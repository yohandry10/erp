import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SupabaseService } from './shared/supabase/supabase.service';
import { ValidationPipe } from '@nestjs/common';

/**
 * Notifica a PostgREST para que recargue el esquema de la base de datos.
 * Esto es útil después de realizar migraciones o cambios en la DB.
 */
async function notifySchemaReload(supabase: SupabaseService) {
  try {
    const client = supabase.getClient();
    if (client) {
      console.log('📢 Notificando a PostgREST para recargar el esquema...');
      await client.rpc('pgrst_reload_schema');
      console.log('✅ Esquema notificado para recarga.');
    }
  } catch (error) {
    console.warn('⚠️ No se pudo notificar la recarga del esquema a PostgREST. Esto es seguro de ignorar si el rol no tiene permisos.', error.message);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Validación global de DTOs
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    disableErrorMessages: false,
  }));
  
  // Configuración CORS para permitir peticiones desde el frontend
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://localhost:3001'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'X-HTTP-Method-Override'
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  // PREFIJO GLOBAL
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('ERP Suite API')
    .setDescription('Sistema ERP completo con módulos integrados')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Forzar recarga de esquema de Supabase al iniciar
  const supabaseService = app.get(SupabaseService);
  await notifySchemaReload(supabaseService);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 Servidor corriendo en puerto ${port}`);
  console.log(`📚 Documentación disponible en http://localhost:${port}/api/docs`);
  console.log(`🔗 CORS enabled for: http://localhost:3000`);
}

bootstrap(); 