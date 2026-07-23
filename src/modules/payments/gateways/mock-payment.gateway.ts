import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  PaymentGateway,
  ChargeParams,
  ChargeResult,
  RefundResult,
} from './payment-gateway.interface';

// Simulates a payment gateway with no real money movement or network calls.
// Test hook: an amount ending in .13 (e.g. 1500.13) always declines — the same
// trick real sandboxes use with magic test card numbers — so failure handling
// can be tested deterministically without any extra fields in the request.
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';

  async charge(params: ChargeParams): Promise<ChargeResult> {
    await sleep(150); // pretend this is a network call
    const cents = Math.round((params.amount % 1) * 100);
    if (cents === 13) {
      return {
        success: false,
        gatewayReference: `mock_${randomUUID()}`,
        failureReason: 'Card declined (simulated)',
      };
    }
    return { success: true, gatewayReference: `mock_${randomUUID()}` };
  }

  async refund(): Promise<RefundResult> {
    await sleep(100);
    return { success: true, gatewayReference: `mock_refund_${randomUUID()}` };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
