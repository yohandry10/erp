// NestJS ConfigModule maneja la carga de .env automáticamente
// No necesitamos dotenv directamente

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SupabaseService } from './shared/supabase/supabase.service';
import { ValidationPipe } from '@nestjs/common';
import { SecurityService } from './shared/security/security.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import helmet from 'helmet';
import compression from 'compression';

/**
 * Notifica a PostgREST para que recargue el esquema de la base de datos.
 * Esto es útil después de realizar migraciones o cambios en la DB.
 */
async function notifySchemaReload(supabase: SupabaseService) {
  try {
    // Usar cliente público porque no hay tenant context en el arranque
    const client = supabase.getPublicClient();
    if (client) {
      console.log('📢 Notificando a PostgREST para recargar el esquema...');
      await client.rpc('pgrst_reload_schema');
      console.log('✅ Esquema notificado para recarga.');
    }
  } catch (error) {
    console.warn('⚠️ No se pudo notificar la recarga del esquema a PostgREST. Esto es seguro de ignorar si el rol no tiene permisos.', error.message);
  }
}

/**
 * A4: Validar JWT_SECRET en arranque
 * 
 * Valida que:
 * 1. JWT_SECRET exista
 * 2. Tenga mínimo 32 caracteres
 * 3. Tenga entropía suficiente (mayúsculas, minúsculas, números, símbolos)
 */
async function validateCriticalSecrets(): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error(
      '❌ [A4] JWT_SECRET no está configurado. Configure esta variable de entorno antes de iniciar la aplicación.'
    );
  }

  // Validar longitud mínima
  if (jwtSecret.length < 32) {
    throw new Error(
      `❌ [A4] JWT_SECRET debe tener mínimo 32 caracteres. Actual: ${jwtSecret.length} caracteres.`
    );
  }

  // Validar entropía (debe contener caracteres aleatorios, no palabras simples)
  const hasUpperLower = /[A-Z]/.test(jwtSecret) && /[a-z]/.test(jwtSecret);
  const hasNumber = /\d/.test(jwtSecret);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>\[\]\\\/_+\-=\[\]`~]/.test(jwtSecret);

  if (!hasUpperLower || !hasNumber || !hasSpecial) {
    throw new Error(
      '❌ [A4] JWT_SECRET debe contener mayúsculas, minúsculas, números y caracteres especiales para mayor seguridad.'
    );
  }

  console.log('✅ [A4] JWT_SECRET validado correctamente');
}

async function bootstrap() {
  // ✅ A4: Validar antes de crear app
  await validateCriticalSecrets();

  const app = await NestFactory.create(AppModule);
  
  // Definir puerto al inicio
  const port = process.env.PORT || 3002;
  
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
    disableErrorMessages: process.env.NODE_ENV === 'production',
    validateCustomDecorators: true,
    transformOptions: {
      enableImplicitConversion: true,   // Enable implicit type conversion for primitives
    },
  }));
  
  // Configuración CORS mejorada
  app.enableCors(securityService.getCorsConfig());

  // PREFIJO GLOBAL
  app.setGlobalPrefix('api');

  // Swagger documentation (solo en desarrollo)
  if (process.env.NODE_ENV !== 'production') {
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
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
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

  // Forzar recarga de esquema de Supabase al iniciar
  const supabaseService = app.get(SupabaseService);
  await notifySchemaReload(supabaseService);

  await app.listen(port);
  
  console.log(`🚀 Servidor corriendo en puerto ${port}`);
  console.log(`🔒 Seguridad habilitada: Helmet, Rate Limiting, Compression`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Documentación disponible en http://localhost:${port}/api/docs`);
  }
  
  console.log(`🔗 CORS configurado para entornos permitidos`);
}

bootstrap();
