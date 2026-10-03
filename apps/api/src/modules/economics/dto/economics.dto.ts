import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class ValidateBoundingDto {
  @IsNumber()
  @IsPositive()
  creditCost!: number;

  @IsNumber()
  @Min(0)
  monetaryPayoutTomans!: number;
}

export class UpdateClubPricingDto {
  @IsNumber()
  @IsPositive()
  creditCost!: number;

  @IsNumber()
  @Min(0)
  monetaryPayoutTomans!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  offpeakCreditCost?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  peakCreditCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecommendTierDto {
  @IsNumber()
  @IsPositive()
  retailWalkinPrice!: number;

  @IsNumber()
  @IsPositive()
  retailMonthlyPrice!: number;

  @IsNumber()
  facilityIndex!: number;

  @IsNumber()
  locationIndex!: number;
}
