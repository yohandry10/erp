import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerAuthGuard implements CanActivate {
    private readonly logger = new Logger(WorkerAuthGuard.name);
    constructor(private readonly configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        const tenantIdHeader = request.headers['x-tenant-id'];
        const tenantIdQuery = request.query?.tenant_id;
        if (tenantIdHeader && tenantIdQuery && String(tenantIdHeader) !== String(tenantIdQuery)) {
            this.logger.warn(`Conflicting tenant selectors: Header=${tenantIdHeader}, Query=${tenantIdQuery}`);
            throw new UnauthorizedException('Conflicting tenant selectors');
        }
        const requestedTenant = tenantIdHeader || tenantIdQuery;

        if (!authHeader) {
            this.logger.warn('Missing Authorization header');
            throw new UnauthorizedException('Missing Authorization header');
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            this.logger.warn('Missing Bearer token');
            throw new UnauthorizedException('Missing Bearer token');
        }

        const secret =
          this.configService.get<string>('POS_WORKER_JWT_SECRET') ||
          this.configService.get<string>('WORKER_API_JWT_SECRET');
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

            if (decoded.scope !== 'pos.worker') {
                this.logger.warn(`Invalid worker scope: ${decoded.scope}`);
                throw new UnauthorizedException('Invalid worker scope');
            }

            const allowedTenants: string[] = Array.isArray(decoded.tenant_ids) ? decoded.tenant_ids : [];
            const singleTenant = decoded.tenant_id;
            const allTenants = decoded.all_tenants === true;
            const isAllowed =
                !requestedTenant ||
                allTenants ||
                (singleTenant && String(singleTenant) === String(requestedTenant)) ||
                allowedTenants.some(tenantId => String(tenantId) === String(requestedTenant));

            if (!isAllowed) {
                this.logger.warn(`Tenant mismatch: Token=${singleTenant}, Requested=${requestedTenant}`);
                throw new UnauthorizedException('Tenant mismatch');
            }

            const effectiveTenant = requestedTenant || decoded.tenant_id;

            // Set user/context for the request
            request.user = {
                id: 'worker-service',
                role: 'service_role',
                tenant_id: effectiveTenant,
                is_worker: true
            };

            // Set tenant context
            request.tenantId = effectiveTenant;
            request.tenant_id = effectiveTenant;

            return true;
        } catch (error) {
            this.logger.error(`Token validation failed: ${error.message}`);
            throw new UnauthorizedException('Invalid worker token');
        }
    }
}
