import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PayoutStatus } from './entities/payout.entity';
import { ListPayoutsSchema } from './dto/list-payouts.dto';
import type { ListPayoutsDto } from './dto/list-payouts.dto';

@ApiTags('Payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private payments: PaymentsService) {}

  @Get('mine')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'My payouts (worker)',
    description:
      "A worker's earnings history — payouts created automatically when a job they did is completed (or when a customer cancels mid-work and they keep a cancellation fee). Newest first.",
  })
  mine(@CurrentUser() user: { userId: string }) {
    return this.payments.myPayouts(user.userId);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List payouts (admin)',
    description: 'Paginated list of all payouts, filterable by status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'paid', 'failed'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Query(new ZodValidationPipe(ListPayoutsSchema)) query: ListPayoutsDto) {
    return this.payments.listPayouts({
      status: query.status as PayoutStatus | undefined,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a payout',
    description: 'Worker sees their own; admin can see any.',
  })
  @ApiParam({ name: 'id', description: 'Payout id (UUID)' })
  getById(
    @CurrentUser() user: { userId: string; roles: Role[] },
    @Param('id') id: string,
  ) {
    const isAdmin = user.roles?.includes(Role.ADMIN) ?? false;
    return this.payments.getPayoutById(user.userId, isAdmin, id);
  }

  @Post(':id/retry')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Retry a failed payout',
    description:
      "Re-attempts a FAILED payout — typically because the worker had no bank account on file at settlement time and has since added one via PUT /workers/me/payout-account. Fails again if they still haven't.",
  })
  @ApiParam({ name: 'id', description: 'Payout id (UUID)' })
  retry(@Param('id') id: string) {
    return this.payments.retryPayout(id);
  }
}
