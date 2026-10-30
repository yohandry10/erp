import {IsDefined,IsObject} from 'class-validator';
export class BudgetDeleteDto {
  @IsDefined()
  @IsObject()
  expected_snapshot!: Record<string, unknown>;
}
