export enum EmailProvider {
  SENDGRID = 'sendgrid',
  AWS_SES = 'aws-ses',
  SMTP = 'smtp',
}

export interface EmailConfig {
  provider: EmailProvider;
  from: {
    email: string;
    name: string;
  };
  sendgrid?: {
    apiKey: string;
  };
  awsSes?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

