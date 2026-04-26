import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class WorkerAuthGuard implements CanActivate {
    private readonly logger = new Logger(WorkerAuthGuard.name);

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        const tenantIdHeader = request.headers['x-tenant-id'];

        if (!authHeader) {
            this.logger.warn('Missing Authorization header');
            throw new UnauthorizedException('Missing Authorization header');
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            this.logger.warn('Missing Bearer token');
            throw new UnauthorizedException('Missing Bearer token');
        }

        const secret = process.env.POS_WORKER_JWT_SECRET || process.env.WORKER_API_JWT_SECRET;
        if (!secret) {
            this.logger.error('POS_WORKER_JWT_SECRET not configured in API');
            throw new UnauthorizedException('Server configuration error');
        }

        try {
            const decoded = jwt.verify(token, secret) as any;

            if (decoded.iss !== 'pos.worker') {
                this.logger.warn(`Invalid issuer: ${decoded.iss}`);
                throw new UnauthorizedException('Invalid token issuer');
            }

            if (tenantIdHeader && decoded.tenant_id !== tenantIdHeader) {
                this.logger.warn(`Tenant mismatch: Token=${decoded.tenant_id}, Header=${tenantIdHeader}`);
                throw new UnauthorizedException('Tenant mismatch');
            }

            // Set user/context for the request
            request.user = {
                id: 'worker-service',
                role: 'service_role',
                tenant_id: decoded.tenant_id,
                is_worker: true
            };

            // Set tenant context
            request.tenantId = decoded.tenant_id;
            request.tenant_id = decoded.tenant_id;

            return true;
        } catch (error) {
            this.logger.error(`Token validation failed: ${error.message}`);
            throw new UnauthorizedException('Invalid worker token');
        }
    }
}
