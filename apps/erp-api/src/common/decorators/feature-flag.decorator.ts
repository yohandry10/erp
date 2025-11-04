import { SetMetadata } from '@nestjs/common';

// HARDENING: metadata para exigir banderas de características antes de ejecutar endpoints.
export type FeatureFlagKey = 'rrhh' | 'pos' | 'inventario';

export const FEATURE_FLAG_METADATA = 'featureFlag';

export const RequireFeatureFlag = (flag: FeatureFlagKey) => SetMetadata(FEATURE_FLAG_METADATA, flag);
