import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DIAN_IDENTITY_TYPES,
  DianIdentityType,
} from '../../fiscal/colombia/dian-document.util';

export type DianEventCode = '030' | '031' | '032' | '033' | '034';

export class DianEventResponsiblePersonDto {
  @IsString()
  @IsIn([...DIAN_IDENTITY_TYPES])
  identityType!: DianIdentityType;

  @IsString()
  @Matches(/^[0-9A-Za-z.-]{3,30}$/)
  identityNumber!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  familyName!: string;

  @IsString()
  @Length(2, 120)
  jobTitle!: string;

  @IsString()
  @Length(2, 120)
  organizationDepartment!: string;
}

export class DianEventClaimReasonDto {
  @IsString()
  @IsIn(['01', '02', '03', '04'])
  listId!: '01' | '02' | '03' | '04';

  @IsString()
  @Length(3, 500)
  name!: string;
}

export class CreateDianEventDto {
  @IsIn(['030', '031', '032', '033', '034'])
  eventCode!: DianEventCode;

  @ValidateIf((value: CreateDianEventDto) =>
    ['030', '032'].includes(value.eventCode) || value.responsiblePerson != null,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => DianEventResponsiblePersonDto)
  responsiblePerson?: DianEventResponsiblePersonDto;

  @ValidateIf((value: CreateDianEventDto) =>
    value.eventCode === '031' || value.claimReason != null,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => DianEventClaimReasonDto)
  claimReason?: DianEventClaimReasonDto;

  @ValidateIf((value: CreateDianEventDto) => value.eventCode === '034')
  @IsDefined()
  @IsBoolean()
  swornConfirmation?: boolean;
}

export class ImportDianReceivedInvoiceDto {
  @IsString()
  @Matches(/^[0-9A-Fa-f]{96}$/)
  cufe!: string;

  @IsUUID('4')
  proveedorId!: string;

  @IsOptional()
  @IsUUID('4')
  cuentaPorPagarId?: string;
}
