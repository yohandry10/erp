import { ConfigService } from '@nestjs/config';
export declare class SecurityService {
    private configService;
    constructor(configService: ConfigService);
    getHelmetConfig(): {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: string[];
                styleSrc: string[];
                fontSrc: string[];
                imgSrc: string[];
                scriptSrc: string[];
                connectSrc: string[];
            };
        };
        crossOriginEmbedderPolicy: boolean;
        hsts: {
            maxAge: number;
            includeSubDomains: boolean;
            preload: boolean;
        };
        noSniff: boolean;
        frameguard: {
            action: "deny";
        };
        xssFilter: boolean;
    };
    getCorsConfig(): {
        origin: string[];
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        credentials: boolean;
        preflightContinue: boolean;
        optionsSuccessStatus: number;
        maxAge: number;
    };
    getCompressionConfig(): {
        filter: (req: any) => boolean;
        threshold: number;
    };
}
