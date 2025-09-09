"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const supabase_service_1 = require("./shared/supabase/supabase.service");
const common_1 = require("@nestjs/common");
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
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        disableErrorMessages: false,
    }));
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
    app.setGlobalPrefix('api');
    const config = new swagger_1.DocumentBuilder()
        .setTitle('ERP Suite API')
        .setDescription('Sistema ERP completo con módulos integrados')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    const supabaseService = app.get(supabase_service_1.SupabaseService);
    await notifySchemaReload(supabaseService);
    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`🚀 Servidor corriendo en puerto ${port}`);
    console.log(`📚 Documentación disponible en http://localhost:${port}/api/docs`);
    console.log(`🔗 CORS enabled for: http://localhost:3000`);
}
bootstrap();
