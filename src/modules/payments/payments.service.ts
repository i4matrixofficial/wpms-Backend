import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from './entities/payment.entity';
import { Payout, PayoutStatus, PayoutReason } from './entities/payout.entity';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import type { PaymentGateway } from './gateways/payment-gateway.interface';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus } from '../jobs/entities/job.entity';
import { JOB_COMPLETED, JOB_CANCELLED } from '../jobs/jobs.events';
import type { JobCompletedEvent, JobCancelledEvent } from '../jobs/jobs.events';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    @InjectRepository(Payout) private payoutRepo: Repository<Payout>,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private jobs: JobsService,
    private config: ConfigService,
  ) {}

  async pay(customerId: string, dto: CreatePaymentDto) {
    // reuses the job's own ownership check — throws 404/403 if not this customer's job
    const job = await this.jobs.getById(customerId, dto.jobId);
    if (job.customerId !== customerId) {
      throw new ForbiddenException('Not your job');
    }

    const amount = job.finalPrice ?? job.estimatedPrice;
    if (amount == null) {
      throw new BadRequestException('This job has no price to pay yet');
    }

    const existing = await this.repo.findOne({
      where: {
        jobId: job.id,
        status: In([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED]),
      },
    });
    if (existing) {
      throw new ConflictException('A payment for this job already exists');
    }

    const payment = await this.repo.save(
      this.repo.create({
        jobId: job.id,
        customerId,
        amount,
        currency: 'LKR',
        status: PaymentStatus.PENDING,
        method: PaymentMethod.ONLINE,
        gatewayProvider: this.gateway.name,
      }),
    );

    const result = await this.gateway.charge({
      amount,
      currency: 'LKR',
      reference: payment.id,
      description: `Payment for job ${job.id}`,
    });

    payment.status = result.success
      ? PaymentStatus.SUCCEEDED
      : PaymentStatus.FAILED;
    payment.gatewayReference = result.gatewayReference;
    payment.failureReason = result.failureReason ?? null;
    payment.paidAt = result.success ? new Date() : null;
    await this.repo.save(payment);

    if (!result.success) {
      throw new BadRequestException(
        `Payment failed: ${result.failureReason ?? 'declined'} (paymentId: ${payment.id})`,
      );
    }

    return {
      id: payment.id,
      jobId: payment.jobId,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      gatewayProvider: payment.gatewayProvider,
      gatewayReference: payment.gatewayReference,
      paidAt: payment.paidAt,
    };
  }

  // worker records a cash payment collected off-app — no gateway involved,
  // this just attests it happened. Same idempotency and pricing rules as online.
  async payCash(workerUserId: string, dto: CreatePaymentDto) {
    // reuses the job's own ownership check — throws 404/403 if not this worker's job
    const job = await this.jobs.getById(workerUserId, dto.jobId);
    if (job.workerId !== workerUserId) {
      throw new ForbiddenException('Not your job');
    }

    const amount = job.finalPrice ?? job.estimatedPrice;
    if (amount == null) {
      throw new BadRequestException('This job has no price to record yet');
    }

    const existing = await this.repo.findOne({
      where: {
        jobId: job.id,
        status: In([PaymentStatus.PENDING, PaymentStatus.SUCCEEDED]),
      },
    });
    if (existing) {
      throw new ConflictException('A payment for this job already exists');
    }

    const payment = await this.repo.save(
      this.repo.create({
        jobId: job.id,
        customerId: job.customerId,
        amount,
        currency: 'LKR',
        status: PaymentStatus.SUCCEEDED,
        method: PaymentMethod.CASH,
        gatewayProvider: null,
        confirmedBy: workerUserId,
        paidAt: new Date(),
      }),
    );

    return {
      id: payment.id,
      jobId: payment.jobId,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      confirmedBy: payment.confirmedBy,
      paidAt: payment.paidAt,
    };
  }

  async refund(paymentId: string, reason?: string) {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException('Only succeeded payments can be refunded');
    }

    // cash never touched a gateway — refunding it is just a record change,
    // the actual money hand-back happens out-of-band
    if (payment.method === PaymentMethod.ONLINE) {
      const result = await this.gateway.refund({
        gatewayReference: payment.gatewayReference!,
        amount: payment.amount,
        reason,
      });
      if (!result.success) {
        throw new BadRequestException(
          `Refund failed: ${result.failureReason ?? 'declined'}`,
        );
      }
    }

    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAmount = Number(payment.amount);
    payment.refundedAt = new Date();
    payment.refundReason = reason ?? null;
    await this.repo.save(payment);

    return {
      id: payment.id,
      status: payment.status,
      refundedAt: payment.refundedAt,
    };
  }

  // ─── Settlement (event-driven from the Jobs lifecycle) ───────────────────
  // These react to job.completed / job.cancelled. They never throw — a failure
  // here must not roll back the job transition that already happened; it's
  // logged for an admin to reconcile.

  @OnEvent(JOB_COMPLETED)
  async settleCompletion(evt: JobCompletedEvent) {
    try {
      const payment = await this.onlineSucceededPayment(evt.jobId);
      if (!payment) return; // cash or unpaid job → worker already has their money

      const already = await this.payoutRepo.findOne({
        where: { jobId: evt.jobId, reason: PayoutReason.JOB_COMPLETED },
      });
      if (already) return; // idempotent — event fired twice

      await this.createPayout({
        jobId: evt.jobId,
        workerId: evt.workerId,
        paymentId: payment.id,
        grossAmount: Number(payment.amount),
        currency: payment.currency,
        reason: PayoutReason.JOB_COMPLETED,
      });
    } catch (err) {
      this.logger.error(
        `settleCompletion failed for job ${evt.jobId}`,
        err as Error,
      );
    }
  }

  @OnEvent(JOB_CANCELLED)
  async settleCancellation(evt: JobCancelledEvent) {
    try {
      const payment = await this.onlineSucceededPayment(evt.jobId);
      if (!payment) return; // nothing paid online → nothing to unwind here

      const amount = Number(payment.amount);
      const workerCancelled = evt.cancelledByUserId === evt.workerId;
      const workStarted = evt.priorStatus === JobStatus.IN_PROGRESS;

      // decide the split
      let refundToCustomer: number;
      if (workerCancelled || !workStarted) {
        // worker defaulted, OR customer cancelled before work began → full refund
        refundToCustomer = amount;
      } else {
        // customer cancelled mid-work → configurable split
        const pct = this.config.get<number>(
          'CANCEL_INPROGRESS_REFUND_PERCENT',
          50,
        );
        refundToCustomer = round2((amount * pct) / 100);
      }
      const workerShare = round2(amount - refundToCustomer);

      const reasonText = workerCancelled
        ? 'Job cancelled by worker'
        : workStarted
          ? 'Job cancelled by customer mid-work'
          : 'Job cancelled by customer before work started';

      if (refundToCustomer > 0) {
        await this.applyRefund(payment, refundToCustomer, reasonText);
      }
      if (workerShare > 0 && evt.workerId) {
        await this.createPayout({
          jobId: evt.jobId,
          workerId: evt.workerId,
          paymentId: payment.id,
          grossAmount: workerShare,
          currency: payment.currency,
          reason: PayoutReason.CANCELLATION_FEE,
        });
      }
    } catch (err) {
      this.logger.error(
        `settleCancellation failed for job ${evt.jobId}`,
        err as Error,
      );
    }
  }

  private onlineSucceededPayment(jobId: string) {
    return this.repo.findOne({
      where: {
        jobId,
        method: PaymentMethod.ONLINE,
        status: PaymentStatus.SUCCEEDED,
      },
    });
  }

  private async createPayout(params: {
    jobId: string;
    workerId: string;
    paymentId: string;
    grossAmount: number;
    currency: string;
    reason: PayoutReason;
  }) {
    const commissionPct = this.config.get<number>(
      'PLATFORM_COMMISSION_PERCENT',
      0,
    );
    const commissionAmount = round2((params.grossAmount * commissionPct) / 100);
    const netAmount = round2(params.grossAmount - commissionAmount);

    const payout = await this.payoutRepo.save(
      this.payoutRepo.create({
        jobId: params.jobId,
        workerId: params.workerId,
        paymentId: params.paymentId,
        grossAmount: params.grossAmount,
        commissionAmount,
        netAmount,
        currency: params.currency,
        status: PayoutStatus.PENDING,
        reason: params.reason,
        gatewayProvider: this.gateway.name,
      }),
    );

    const result = await this.gateway.payout({
      amount: netAmount,
      currency: params.currency,
      reference: payout.id,
      workerId: params.workerId,
    });

    payout.status = result.success ? PayoutStatus.PAID : PayoutStatus.FAILED;
    payout.gatewayReference = result.gatewayReference;
    payout.failureReason = result.failureReason ?? null;
    payout.paidAt = result.success ? new Date() : null;
    await this.payoutRepo.save(payout);
    return payout;
  }

  private async applyRefund(
    payment: Payment,
    amountToRefund: number,
    reason: string,
  ) {
    if (payment.method === PaymentMethod.ONLINE) {
      const result = await this.gateway.refund({
        gatewayReference: payment.gatewayReference!,
        amount: amountToRefund,
        reason,
      });
      if (!result.success) {
        this.logger.error(
          `Refund failed for payment ${payment.id}: ${result.failureReason ?? 'declined'}`,
        );
        return;
      }
    }
    const newTotal = round2(Number(payment.refundedAmount) + amountToRefund);
    payment.refundedAmount = newTotal;
    payment.refundedAt = new Date();
    payment.refundReason = reason;
    payment.status =
      newTotal >= Number(payment.amount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    await this.repo.save(payment);
  }

  async getById(userId: string, isAdmin: boolean, paymentId: string) {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!isAdmin && payment.customerId !== userId) {
      throw new ForbiddenException('Not your payment');
    }
    return payment;
  }

  async mine(customerId: string) {
    return this.repo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async list(opts: ListPaymentsDto) {
    const [rows, total] = await this.repo.findAndCount({
      where: opts.status ? { status: opts.status as PaymentStatus } : {},
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });
    return {
      data: rows,
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }

  // ─── Payouts (read) ──────────────────────────────────────────────────────

  async myPayouts(workerId: string) {
    return this.payoutRepo.find({
      where: { workerId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPayoutById(userId: string, isAdmin: boolean, payoutId: string) {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!isAdmin && payout.workerId !== userId) {
      throw new ForbiddenException('Not your payout');
    }
    return payout;
  }

  async listPayouts(opts: {
    status?: PayoutStatus;
    page: number;
    limit: number;
  }) {
    const [rows, total] = await this.payoutRepo.findAndCount({
      where: opts.status ? { status: opts.status } : {},
      order: { createdAt: 'DESC' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    });
    return {
      data: rows,
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }
}
