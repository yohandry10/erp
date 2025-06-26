import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
// import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Module({
  imports: [
    PassportModule,
    SupabaseModule,
    // JwtModule.registerAsync({
    //   imports: [ConfigModule],
    //   useFactory: async (configService: ConfigService) => ({
    //     secret: configService.get<string>('JWT_SECRET') || 'your-default-secret-key',
    //     signOptions: { expiresIn: '24h' },
    //   }),
    //   inject: [ConfigService],
    // }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}