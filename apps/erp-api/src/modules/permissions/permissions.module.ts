import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PermissionService } from './permission.service';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { PermissionController } from './permission.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';

@Global()
@Module({
  imports: [
    SupabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [RoleController, PermissionController],
  providers: [PermissionService, RoleService],
  exports: [PermissionService, RoleService, JwtModule],
})
export class PermissionsModule {}
