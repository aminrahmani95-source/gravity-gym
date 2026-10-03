import { BadRequestException } from '@nestjs/common';

export class EconomicViolationException extends BadRequestException {
  constructor(
    public readonly lambdaRatio: number,
    public readonly maxAllowedRatio: number,
    public readonly clubName?: string,
  ) {
    const messageFa = `نقض اصل محدودیت طلایی اقتصادی (Golden Bounding Inequality): نسبت تسویه به اعتبار (${Math.round(lambdaRatio).toLocaleString('fa-IR')} تومان به ازای هر اعتبار) از سقف مجاز پلتفرم (${Math.round(maxAllowedRatio).toLocaleString('fa-IR')} تومان) فراتر رفته است. این پیکربندی باعث ایجاد حاشیه سود منفی در سطح مشترک خواهد شد.`;
    
    super({
      statusCode: 400,
      error: 'Economic Constraint Violation',
      message: messageFa,
      details: {
        violatedConstraint: 'Golden Bounding Inequality: M_club / C_club <= lambda_max',
        calculatedRatio: Math.round(lambdaRatio),
        maxAllowedRatio: Math.round(maxAllowedRatio),
        clubName: clubName || 'نامشخص',
        remediationAction: 'برای تأیید این تغییر، هزینه اعتباری باشگاه (C_club) را افزایش داده یا مبلغ تسویه نقدی (M_club) را تعدیل نمایید.'
      }
    });
  }
}
