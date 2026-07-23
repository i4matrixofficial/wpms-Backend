import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), JobsModule],
  controllers: [PaymentsController],
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
