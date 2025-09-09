import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
export declare class AuthRateLimitGuard extends ThrottlerGuard {
    protected getTracker(req: Record<string, any>): string;
    protected generateKey(context: ExecutionContext, suffix: string): string;
}
