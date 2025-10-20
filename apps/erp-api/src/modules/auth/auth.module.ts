import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthTasksService } from './auth.tasks';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [
    PassportModule,
    SupabaseModule,
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
  providers: [AuthService, JwtStrategy, AuthTasksService],
  exports: [AuthService],
})
export class AuthModule {}