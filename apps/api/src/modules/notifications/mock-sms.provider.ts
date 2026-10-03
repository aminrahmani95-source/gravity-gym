import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, NotificationPattern, DispatchedNotification, maskPhoneNumber } from './notification.interface';
import * as crypto from 'crypto';

@Injectable()
export class MockSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  private logs: DispatchedNotification[] = [];
  private shouldFailNext: boolean = false;
  private shouldThrowNext: boolean = false;

  setSimulateFailure(fail: boolean) {
    this.shouldFailNext = fail;
  }

  setSimulateThrow(shouldThrow: boolean) {
    this.shouldThrowNext = shouldThrow;
  }

  async sendPattern(
    phoneNumber: string,
    pattern: NotificationPattern,
    tokens: Record<string, string>,
  ): Promise<boolean> {
    if (this.shouldThrowNext) {
      this.shouldThrowNext = false;
      this.logger.error(`[SMS Provider Simulation] Network timeout or catastrophic gateway crash for ${maskPhoneNumber(phoneNumber)}`);
      throw new Error('Downstream SMS Gateway Timeout (504 Gateway Timeout)');
    }

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      this.logger.warn(`[SMS Provider Simulation] Gateway rejected message for ${maskPhoneNumber(phoneNumber)}: insufficient credit`);
      return false;
    }

    const logEntry: DispatchedNotification = {
      id: crypto.randomUUID(),
      phoneNumber,
      pattern,
      tokens,
      dispatchedAt: new Date().toISOString(),
      success: true,
    };

    this.logs.push(logEntry);
    this.logger.log(
      `[SMS Dispatched] Pattern: ${pattern} | To: ${maskPhoneNumber(phoneNumber)} | Tokens: ${JSON.stringify(tokens)}`,
    );

    return true;
  }

  getDispatchedLogs(): DispatchedNotification[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
