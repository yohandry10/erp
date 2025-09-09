import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SupabaseService } from './shared/supabase/supabase.service';
import { ValidationPipe } from '@nestjs/common';
import { SecurityService } from './shared/security/security.service';
import helmet from 'helmet';
import compression from 'compression';

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
  
  // Obtener servicio de seguridad
  const securityService = app.get(SecurityService);
  
  // Configurar Helmet para headers de seguridad
  app.use(helmet(securityService.getHelmetConfig()));
  
  // Configurar compresión
  app.use(compression(securityService.getCompressionConfig()));
  
  // Configurar trust proxy para obtener IP real (usando getHttpAdapter)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance().set('trust proxy', 1);
  
  // Validación global de DTOs con configuración más estricta
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    disableErrorMessages: process.env.NODE_ENV === 'production',
    validateCustomDecorators: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
  }));
  
  // Configuración CORS mejorada
  app.enableCors(securityService.getCorsConfig());

  // PREFIJO GLOBAL
  app.setGlobalPrefix('api');

  // Swagger documentation (solo en desarrollo)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ERP Suite API')
      .setDescription('Sistema ERP completo con módulos integrados')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer('http://localhost:3002', 'Desarrollo')
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // Forzar recarga de esquema de Supabase al iniciar
  const supabaseService = app.get(SupabaseService);
  await notifySchemaReload(supabaseService);

  const port = process.env.PORT || 3002;
  await app.listen(port);
  
  console.log(`🚀 Servidor corriendo en puerto ${port}`);
  console.log(`🔒 Seguridad habilitada: Helmet, Rate Limiting, Compression`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Documentación disponible en http://localhost:${port}/api/docs`);
  }
  
  console.log(`🔗 CORS configurado para entornos permitidos`);
}

bootstrap();