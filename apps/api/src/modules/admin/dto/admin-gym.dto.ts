import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { GymAccessMode, Gender, GymTier } from '@gym-app/shared-types';

export class CreateAdminGymDto {
  @IsString()
  @IsNotEmpty({ message: 'نام مجموعه ورزشی الزامی است.' })
  nameFa!: string;

  @IsEnum(GymTier, { message: 'سطح دسترسی مجموعه نامعتبر است.' })
  @IsNotEmpty({ message: 'سطح مجموعه الزامی است.' })
  tier!: GymTier;

  @IsOptional()
  @IsEnum(GymAccessMode, { message: 'حالت دسترسی جنسیتی نامعتبر است.' })
  accessMode?: GymAccessMode;

  @IsString()
  @IsNotEmpty({ message: 'نام شهر الزامی است.' })
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام منطقه یا محله الزامی است.' })
  district!: string;

  @IsString()
  @IsNotEmpty({ message: 'آدرس دقیق الزامی است.' })
  addressFa!: string;

  @IsNumber({}, { message: 'عرض جغرافیایی باید عدد معتبر باشد.' })
  latitude!: number;

  @IsNumber({}, { message: 'طول جغرافیایی باید عدد معتبر باشد.' })
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @IsString()
  @Matches(/^(IR)?[0-9]{24}$/i, {
    message: 'شماره شبا باید شامل ۲۴ رقم (با یا بدون پیشوند IR) باشد.',
  })
  shebaNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام صاحب حساب بانکی الزامی است.' })
  bankAccountHolder!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  descriptionFa?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminGymDto {
  @IsOptional()
  @IsString()
  nameFa?: string;

  @IsOptional()
  @IsEnum(GymTier)
  tier?: GymTier;

  @IsOptional()
  @IsEnum(GymAccessMode)
  accessMode?: GymAccessMode;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  addressFa?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(IR)?[0-9]{24}$/i, {
    message: 'شماره شبا باید شامل ۲۴ رقم (با یا بدون پیشوند IR) باشد.',
  })
  shebaNumber?: string;

  @IsOptional()
  @IsString()
  bankAccountHolder?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  descriptionFa?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ToggleGymStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateGymAccessModeDto {
  @IsEnum(GymAccessMode)
  @IsNotEmpty()
  accessMode!: GymAccessMode;
}

export class CreateGymSansDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsEnum(Gender)
  @IsNotEmpty()
  gender!: Gender;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'فرمت زمان شروع باید به‌صورت HH:mm یا HH:mm:ss باشد.',
  })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'فرمت زمان پایان باید به‌صورت HH:mm یا HH:mm:ss باشد.',
  })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isPeak?: boolean;
}
