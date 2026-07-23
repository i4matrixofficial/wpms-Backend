import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import type { PaymentGateway } from './gateways/payment-gateway.interface';
import { JobsService } from '../jobs/jobs.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private repo: Repository<Payment>,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private jobs: JobsService,
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
      amount: payment.amount,
      currency: payment.currency,
      gatewayProvider: payment.gatewayProvider,
      gatewayReference: payment.gatewayReference,
      paidAt: payment.paidAt,
    };
  }

  async refund(paymentId: string, reason?: string) {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException('Only succeeded payments can be refunded');
    }

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

    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.refundReason = reason ?? null;
    await this.repo.save(payment);

    return {
      id: payment.id,
      status: payment.status,
      refundedAt: payment.refundedAt,
    };
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
}
