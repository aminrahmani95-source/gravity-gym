import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class GenerateQrDto {
  @IsString()
  @IsNotEmpty()
  gymId!: string;

  // Accepted for backward compatibility with existing test scripts
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsNumber()
  clientLat?: number;

  @IsOptional()
  @IsNumber()
  clientLng?: number;
}

export class VerifyCheckinDto {
  @IsString()
  @IsNotEmpty()
  qrToken!: string;
}
