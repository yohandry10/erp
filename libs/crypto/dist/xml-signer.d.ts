export interface SigningOptions {
    pfxPath?: string;
    pfxPassword?: string;
    referenceUri?: string;
    useDemoMode?: boolean;
}
export declare class XmlSigner {
    private options;
    private certificate;
    private privateKey;
    private demoMode;
    constructor(options?: SigningOptions);
    private loadCertificate;
    private loadRealCertificate;
    private generateDemoCertificate;
    signXml(xmlContent: string): string;
    private insertSignatureIntoXml;
    private getRSAModulus;
    generateHash(xmlContent: string): string;
    validateSignature(signedXml: string): boolean;
    /**
     * Información del certificado para logs
     */
    getCertificateInfo(): any;
}
//# sourceMappingURL=xml-signer.d.ts.map