import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@gym-app/shared-types';
import {
  CheckoutDto,
  VerifyPaymentDto,
  CancelPaymentDto,
  RefundPaymentDto,
  ClassCheckoutDto,
  ClassVerifyPaymentDto,
} from './dto/payment.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  async checkout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.paymentsService.initiateCheckout(userId, dto.planId);
  }

  @Post('verify')
  async verify(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(userId, dto.planId, dto.gatewayAuthority, dto.status);
  }

  /**
   * Dedicated checkout endpoint for Coach Classes (Single Session & Monthly Plan).
   */
  @Post('classes/checkout')
  async checkoutClass(
    @CurrentUser('sub') userId: string,
    @Body() dto: ClassCheckoutDto,
  ) {
    return this.paymentsService.initiateClassCheckout(userId, dto.purpose, dto.referenceId);
  }

  /**
   * Dedicated verification endpoint for Coach Classes.
   */
  @Post('classes/verify')
  async verifyClass(
    @CurrentUser('sub') userId: string,
    @Body() dto: ClassVerifyPaymentDto,
  ) {
    return this.paymentsService.verifyClassPayment(userId, dto.gatewayAuthority, dto.status);
  }

  /**
   * Member cancels a PENDING checkout session.
   */
  @Post('cancel')
  async cancel(
    @CurrentUser('sub') userId: string,
    @Body() dto: CancelPaymentDto,
  ) {
    return this.paymentsService.cancelCheckout(dto.authority, userId);
  }

  /**
   * Administrative refund: revokes subscription, claws back credits, and updates transaction.
   * Strictly restricted to ADMIN and SUPER_ADMIN roles.
   */
  @Post('refund')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async refund(
    @CurrentUser('sub') adminUserId: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refundPayment(dto.paymentId, adminUserId, dto.reason);
  }

  /**
   * Member retrieves their payment and invoice history.
   * Scoped exclusively to the authenticated user.
   */
  @Get('history')
  async getMyPaymentHistory(@CurrentUser('sub') userId: string) {
    return this.paymentsService.getUserPaymentHistory(userId);
  }
}
