import { ConfigService } from '@nestjs/config';
export declare class SecretsService {
    private configService;
    private readonly logger;
    private readonly encryptionKey;
    private readonly algorithm;
    private readonly secretsConfig;
    constructor(configService: ConfigService);
    private validateSecrets;
    getSecret(key: string): string;
    encrypt(text: string): string;
    private decrypt;
    generateSecret(length?: number): string;
    rotateSecret(key: string): Promise<string>;
    validateSSLCertificates(): boolean;
    getSecretsStatus(): any;
}
