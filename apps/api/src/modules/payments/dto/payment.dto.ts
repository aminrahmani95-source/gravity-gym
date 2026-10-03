import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { PaymentPurpose } from '@gym-app/shared-types';

export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;
}

export class ClassCheckoutDto {
  @IsEnum(PaymentPurpose)
  @IsNotEmpty()
  purpose!: PaymentPurpose;

  @IsString()
  @IsNotEmpty()
  referenceId!: string;
}

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  gatewayAuthority!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class ClassVerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  gatewayAuthority!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class CancelPaymentDto {
  @IsString()
  @IsNotEmpty()
  authority!: string;
}

export class RefundPaymentDto {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
