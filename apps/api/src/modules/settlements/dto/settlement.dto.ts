import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateSettlementBatchDto {
  @IsString()
  @IsNotEmpty()
  cycleStart!: string;

  @IsString()
  @IsNotEmpty()
  cycleEnd!: string;
}

export class ApproveSettlementBatchDto {
  @IsString()
  @IsNotEmpty()
  bankReferenceRrn!: string;
}
