import { IsNotEmpty, IsString } from 'class-validator';

export class PreviewComprobantesDto {
  @IsString()
  @IsNotEmpty()
  fileBase64: string;
}
