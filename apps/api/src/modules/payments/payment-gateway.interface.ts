export interface IPaymentGateway {
  initiatePayment(amountRials: number, callbackUrl: string, description: string): Promise<{ authority: string; redirectUrl: string }>;
  verifyPayment(authority: string, amountRials: number): Promise<{ isSuccessful: boolean; referenceIdRrn?: string; cardPanMasked?: string }>;
}

export class MockShaparakGateway implements IPaymentGateway {
  async initiatePayment(amountRials: number, callbackUrl: string, description: string): Promise<{ authority: string; redirectUrl: string }> {
    const authority = 'MOCK_SHAPARAK_' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const redirectUrl = `${callbackUrl}?Authority=${authority}&Status=OK`;
    return { authority, redirectUrl };
  }

  async verifyPayment(authority: string, amountRials: number): Promise<{ isSuccessful: boolean; referenceIdRrn?: string; cardPanMasked?: string }> {
    return {
      isSuccessful: true,
      referenceIdRrn: 'RRN_' + Date.now().toString().slice(-8),
      cardPanMasked: '603799******1234',
    };
  }
}
