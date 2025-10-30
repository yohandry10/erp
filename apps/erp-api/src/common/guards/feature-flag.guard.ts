import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_METADATA, FeatureFlagKey } from '../decorators/feature-flag.decorator';
import { FEATURE_POS_ENABLED, FEATURE_RRHH_ENABLED } from '../feature-flags';

// HARDENING: Guard que bloquea módulos con feature flags deshabilitados.
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const flag =
      this.reflector.get<FeatureFlagKey>(FEATURE_FLAG_METADATA, context.getHandler()) ??
      this.reflector.get<FeatureFlagKey>(FEATURE_FLAG_METADATA, context.getClass());

    if (!flag) {
      return true;
    }

    switch (flag) {
      case 'rrhh':
        if (!FEATURE_RRHH_ENABLED) {
          throw new ServiceUnavailableException('RRHH nómina no habilitado en este entorno');
        }
        break;
      case 'pos':
        if (!FEATURE_POS_ENABLED) {
          throw new ServiceUnavailableException('POS no habilitado en este entorno');
        }
        break;
      default:
        return true;
    }

    return true;
  }
}
