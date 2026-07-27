import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { Payout } from './entities/payout.entity';
import { PaymentsController } from './payments.controller';
import { PayoutsController } from './payouts.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { JobsModule } from '../jobs/jobs.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Payout]),
    JobsModule,
    WorkersModule,
  ],
  controllers: [PaymentsController, PayoutsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      // swap gateways here by provider name — add a case, no other file changes
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('PAYMENT_GATEWAY_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
          default:
            return new MockPaymentGateway();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
