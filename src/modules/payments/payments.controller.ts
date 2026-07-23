import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CreatePaymentSchema } from './dto/create-payment.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentSchema } from './dto/refund-payment.dto';
import type { RefundPaymentDto } from './dto/refund-payment.dto';
import { ListPaymentsSchema } from './dto/list-payments.dto';
import type { ListPaymentsDto } from './dto/list-payments.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'Pay for a job',
    description:
      'Customer pays for a job through the configured payment gateway (currently mock — swappable via config, no code changes elsewhere). Amount comes from the job itself, never the client. One payment per job — retrying after a failure needs admin/support intervention in this version.',
  })
  @ZodApiBody(CreatePaymentSchema)
  pay(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(CreatePaymentSchema)) dto: CreatePaymentDto,
  ) {
    return this.payments.pay(user.userId, dto);
  }

  @Get('mine')
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'My payments',
    description: "Customer's own payment history, newest first.",
  })
  mine(@CurrentUser() user: { userId: string }) {
    return this.payments.mine(user.userId);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List payments (admin)',
    description: 'Paginated list of all payments, filterable by status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'succeeded', 'failed', 'refunded'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query(new ZodValidationPipe(ListPaymentsSchema)) query: ListPaymentsDto,
  ) {
    return this.payments.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a payment',
    description: 'Customer sees their own; admin can see any.',
  })
  @ApiParam({ name: 'id', description: 'Payment id (UUID)' })
  getById(
    @CurrentUser() user: { userId: string; roles: Role[] },
    @Param('id') id: string,
  ) {
    const isAdmin = user.roles?.includes(Role.ADMIN) ?? false;
    return this.payments.getById(user.userId, isAdmin, id);
  }

  @Patch(':id/refund')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Refund a payment (admin)',
    description: 'Refunds a succeeded payment in full through the gateway.',
  })
  @ApiParam({ name: 'id', description: 'Payment id (UUID)' })
  @ZodApiBody(RefundPaymentSchema)
  refund(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RefundPaymentSchema)) dto: RefundPaymentDto,
  ) {
    return this.payments.refund(id, dto.reason);
  }
}
