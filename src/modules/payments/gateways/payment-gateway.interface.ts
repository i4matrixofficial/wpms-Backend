// The contract every payment gateway adapter must satisfy. Swap MockPaymentGateway
// for a real one (e.g. PayHere) later by writing a new class that implements this —
// PaymentsService and PaymentsController never change.

export interface ChargeParams {
  amount: number;
  currency: string;
  reference: string; // our Payment row's id — lets a real gateway dedupe/trace
  description?: string;
}

export interface ChargeResult {
  success: boolean;
  gatewayReference: string;
  failureReason?: string;
}

export interface RefundParams {
  gatewayReference: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  success: boolean;
  gatewayReference: string;
  failureReason?: string;
}

export interface PayoutParams {
  amount: number;
  currency: string;
  reference: string; // our Payout row's id
  workerId: string; // recipient — a real gateway maps this to a payout account
}

export interface PayoutResult {
  success: boolean;
  gatewayReference: string;
  failureReason?: string;
}

export interface PaymentGateway {
  readonly name: string;
  charge(params: ChargeParams): Promise<ChargeResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  payout(params: PayoutParams): Promise<PayoutResult>; // money OUT to a worker
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
