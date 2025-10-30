import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthTasksService } from './auth.tasks';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { EmailModule } from '../../shared/email/email.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    PassportModule,
    SupabaseModule,
    EmailModule, // ✅ Email service para password reset
    PermissionsModule, // ✅ B1: Para invalidar cache de permisos al cambiar tenant
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-default-secret-key',
        signOptions: { expiresIn: '8h' }, // 8 hours to match session expiration
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JwtStrategy, 
    AuthTasksService,
    JwtAuthGuard, // ✅ A3: Guard con inyección automática de AuthService
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}