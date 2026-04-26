import { SetMetadata } from '@nestjs/common';

export const PUBLIC_METADATA_KEY = 'isPublic';
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(PUBLIC_METADATA_KEY, true);
