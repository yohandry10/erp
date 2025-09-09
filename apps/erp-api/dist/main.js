"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("./shared/supabase/supabase.service");
const common_1 = require("@nestjs/common");
const security_service_1 = require("./shared/security/security.service");
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
async function notifySchemaReload(supabase) {
    try {
        const client = supabase.getClient();
        if (client) {
            console.log('📢 Notificando a PostgREST para recargar el esquema...');
            await client.rpc('pgrst_reload_schema');
            console.log('✅ Esquema notificado para recarga.');
        }
    }
    catch (error) {
        console.warn('⚠️ No se pudo notificar la recarga del esquema a PostgREST. Esto es seguro de ignorar si el rol no tiene permisos.', error.message);
    }
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const securityService = app.get(security_service_1.SecurityService);
    app.use((0, helmet_1.default)(securityService.getHelmetConfig()));
    app.use((0, compression_1.default)(securityService.getCompressionConfig()));
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.getInstance().set('trust proxy', 1);
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        disableErrorMessages: process.env.NODE_ENV === 'production',
        validateCustomDecorators: true,
        transformOptions: {
            enableImplicitConversion: false,
        },
    }));
    app.enableCors(securityService.getCorsConfig());
    app.setGlobalPrefix('api');
    if (process.env.NODE_ENV !== 'production') {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('ERP Suite API')
            .setDescription('Sistema ERP completo con módulos integrados')
            .setVersion('1.0')
            .addBearerAuth()
            .addServer('http://localhost:3002', 'Desarrollo')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: {
                persistAuthorization: true,
            },
        });
    }
    const supabaseService = app.get(supabase_service_1.SupabaseService);
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
//# sourceMappingURL=main.js.map