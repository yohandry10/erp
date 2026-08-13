// NestJS ConfigModule maneja la carga de .env automáticamente
// No necesitamos dotenv directamente

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { SecurityService } from './shared/security/security.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CorrelationIdMiddleware } from './shared/middleware/correlation-id.middleware';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { StructuredLogger } from './shared/logging/structured-logger.service';
import helmet from 'helmet';
import compression from 'compression';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Definir puerto al inicio
  const port = configService.get<number>('PORT', 3002);

  // Obtener servicio de seguridad
  const securityService = app.get(SecurityService);

  // Configurar Helmet para headers de seguridad
  app.use(helmet(securityService.getHelmetConfig()));

  // Configurar compresión
  app.use(compression(securityService.getCompressionConfig()));

  // Configurar trust proxy para obtener IP real (usando getHttpAdapter)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance().set('trust proxy', 1);

  // Global exception filter for consistent error handling
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Validación global de DTOs con configuración más estricta
  app.useGlobalPipes(new ValidationPipe({
    transform: true,                    // Auto-transform payloads to DTO instances
    whitelist: true,                    // Strip properties that don't have decorators
    forbidNonWhitelisted: true,         // Throw error if non-whitelisted properties are present
      disableErrorMessages: configService.get<string>('NODE_ENV') === 'production',
    validateCustomDecorators: true,
    transformOptions: {
      enableImplicitConversion: true,   // Enable implicit type conversion for primitives
    },
  }));

  // Middleware de correlation ID (debe ir primero para capturar todas las requests)
  app.use(new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()));

  // Configuración CORS mejorada con correlation ID en headers expuestos
  const corsConfig = securityService.getCorsConfig();
  app.enableCors({
    ...corsConfig,
    exposedHeaders: [
      ...(corsConfig.exposedHeaders || []),
      'x-correlation-id',
    ],
  });

  // PREFIJO GLOBAL
  app.setGlobalPrefix('api');

  // Swagger documentation (solo en desarrollo)
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ERP Suite API - Multi-Level Admin System')
      .setDescription(`
# Sistema ERP con Administración Multi-Nivel

## Descripción General
API REST para sistema ERP con arquitectura multi-tenant y tres niveles de administración:
- **Super-Admin**: Administrador del sistema completo
- **Admin de Empresa**: Administrador de tenant/empresa
- **Usuario Regular**: Usuario con permisos específicos

## Características Principales
- ✅ Autenticación JWT con contexto de tenant
- ✅ Aislamiento completo de datos entre tenants (RLS)
- ✅ Control de acceso basado en roles (RBAC)
- ✅ Auditoría completa de acciones
- ✅ Gestión de sesiones y seguridad avanzada

## Flujo de Autenticación

### 1. Login
\`\`\`
POST /api/auth/login
{
  "email": "usuario@empresa.com",
  "password": "contraseña"
}
\`\`\`

**Respuesta:**
\`\`\`json
{
  "access_token": "REPLACE_WITH_TEST_JWT",
  "user": {
    "id": "uuid",
    "email": "usuario@empresa.com",
    "tenant_id": "tenant-uuid",
    "is_super_admin": false,
    "roles": ["ADMIN_EMPRESA"]
  }
}
\`\`\`

### 2. Usar Token
Incluir el token en el header de todas las peticiones:
\`\`\`
Authorization: Bearer {access_token}
\`\`\`

### 3. Cambio de Tenant (Solo Super-Admin)
\`\`\`
POST /api/auth/switch-tenant
{
  "targetTenantId": "otro-tenant-uuid"
}
\`\`\`

## Modelo de Permisos

### Estructura de Permisos
Los permisos se definen con tres componentes:
- **Módulo**: ventas, compras, inventario, etc.
- **Acción**: create, read, update, delete, export
- **Recurso**: clientes, productos, facturas, etc.

### Ejemplo de Verificación
\`\`\`typescript
// El sistema verifica automáticamente:
checkPermission(userId, tenantId, 'ventas', 'create', 'facturas')
\`\`\`

### Roles Predefinidos
- **SUPER_ADMIN**: Acceso total al sistema
- **ADMIN_EMPRESA**: Administrador del tenant
- **CONTADOR**: Acceso a módulos contables
- **VENDEDOR**: Acceso a módulos de ventas
- **ALMACENERO**: Acceso a inventario

## Aislamiento de Tenants

### Row Level Security (RLS)
Todas las consultas se filtran automáticamente por \`tenant_id\`:
\`\`\`sql
-- Configurado automáticamente en cada request
SET app.current_tenant_id = 'tenant-uuid';
SET app.current_user_id = 'user-uuid';
\`\`\`

### Middleware de Tenant
El \`TenantMiddleware\` extrae el \`tenant_id\` del JWT y configura el contexto de la base de datos antes de cada operación.

## Seguridad

### Características de Seguridad
- 🔒 Contraseñas hasheadas con bcrypt
- 🔒 Bloqueo de cuenta tras 5 intentos fallidos
- 🔒 Tokens JWT con expiración (8 horas)
- 🔒 Rate limiting por endpoint
- 🔒 Validación estricta de entrada
- 🔒 Headers de seguridad con Helmet
- 🔒 Auditoría completa de acciones

### Rate Limits
- Login: 5 intentos/minuto
- Refresh: 10 intentos/minuto
- Password Reset: 3 intentos/minuto
- API General: 100 requests/minuto por usuario

## Auditoría

Todas las acciones administrativas se registran en \`audit_log\`:
- Creación/modificación/eliminación de usuarios
- Cambios de permisos y roles
- Accesos de super-admin a datos de tenants
- Cambios de configuración

## Códigos de Estado HTTP

- **200 OK**: Operación exitosa
- **201 Created**: Recurso creado exitosamente
- **400 Bad Request**: Datos inválidos
- **401 Unauthorized**: No autenticado o token inválido
- **403 Forbidden**: Sin permisos suficientes
- **404 Not Found**: Recurso no encontrado
- **409 Conflict**: Conflicto (ej: email duplicado)
- **429 Too Many Requests**: Rate limit excedido
- **500 Internal Server Error**: Error del servidor

## Soporte
Para más información, consulte la documentación técnica en el repositorio.
      `)
      .setVersion('1.0.0')
      .setContact(
        'ERP Suite Support',
        'https://github.com/your-repo',
        'support@erpsuite.com'
      )
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Ingrese el token JWT obtenido del endpoint /auth/login',
          in: 'header',
        },
        'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controllers
      )
      .addTag('Autenticación', 'Endpoints de autenticación, login, logout y gestión de tokens')
      .addTag('Gestión de Tenants (Super-Admin)', 'Gestión de empresas/tenants - Solo Super-Administradores')
      .addTag('Gestión de Usuarios', 'Gestión de usuarios dentro del tenant actual')
      .addTag('Gestión de Roles', 'Gestión de roles y asignación de permisos')
      .addTag('Gestión de Permisos', 'Consulta y gestión de permisos')
      .addTag('Auditoría', 'Consulta de logs de auditoría y trazabilidad')
      .addTag('Inventario', 'Gestión de productos, almacenes y movimientos')
      .addTag('Ventas', 'Gestión de ventas, facturas y clientes')
      .addTag('Compras', 'Gestión de compras, proveedores y órdenes')
      .addTag('Contabilidad', 'Gestión contable y libros')
      .addTag('RRHH', 'Gestión de recursos humanos')
      .addServer('http://localhost:3002', 'Desarrollo Local')
      .addServer('https://api-dev.erpsuite.com', 'Desarrollo')
      .addServer('https://api-staging.erpsuite.com', 'Staging')
      .addServer('https://api.erpsuite.com', 'Producción')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (
        controllerKey: string,
        methodKey: string
      ) => methodKey,
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        syntaxHighlight: {
          activate: true,
          theme: 'monokai',
        },
        tryItOutEnabled: true,
      },
      customSiteTitle: 'ERP Suite API Documentation',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 20px 0; }
        .swagger-ui .info .title { font-size: 2.5em; }
      `,
    });

    console.log(`📚 Documentación Swagger disponible en http://localhost:${port}/api/docs`);
  }

  // Configurar logging interceptor global  
  const logger = await app.resolve(StructuredLogger);
  logger.setService('Bootstrap');
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  await app.listen(port);

  // Log startup con structured logger
    logger.log(`Servidor corriendo en puerto ${port}`, {
    environment: configService.get<string>('NODE_ENV') || 'development',
    port,
    features: ['Helmet', 'Rate Limiting', 'Compression', 'Correlation IDs', 'Structured Logging'],
  });

  console.log(`🚀 Servidor corriendo en puerto ${port}`);
  console.log(`🔒 Seguridad habilitada: Helmet, Rate Limiting, Compression`);
  console.log(`📊 Logging estructurado activado con Correlation IDs`);

  if (configService.get<string>('NODE_ENV') !== 'production') {
    console.log(`📚 Documentación disponible en http://localhost:${port}/api/docs`);
  }

  console.log(`🔗 CORS configurado para entornos permitidos`);
}

// Sin este catch, un fallo al arrancar terminaba el proceso sin decir por que:
// en un servidor gestionado solo se veia "Exited with status 1" y a adivinar.
bootstrap().catch((error) => {
  console.error('[bootstrap] La API no pudo arrancar:', error);
  process.exit(1);
});
