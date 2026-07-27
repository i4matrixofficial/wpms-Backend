import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NegotiationsService } from './negotiations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { StartNegotiationSchema } from './dto/start-negotiation.dto';
import type { StartNegotiationDto } from './dto/start-negotiation.dto';
import { CounterOfferSchema } from './dto/counter-offer.dto';
import type { CounterOfferDto } from './dto/counter-offer.dto';

// Price negotiation for "on_completion" (negotiable) service types. Fixed
// upfront-priced jobs never touch this — they use POST /jobs/:id/accept.
@ApiTags('Job Negotiations')
@ApiBearerAuth()
@Controller('jobs/:jobId/negotiations')
export class NegotiationsController {
  constructor(private readonly negotiations: NegotiationsService) {}

  @Post()
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Open a negotiation',
    description:
      'Worker proposes an opening price on a negotiable REQUESTED job. Multiple workers can each open their own thread on the same job.',
  })
  @ZodApiBody(StartNegotiationSchema)
  start(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(StartNegotiationSchema))
    dto: StartNegotiationDto,
  ) {
    return this.negotiations.start(user.userId, jobId, dto);
  }

  @Get()
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'List negotiations on my job',
    description:
      'Customer views every negotiation thread (across all competing workers) on a job they posted.',
  })
  listForJob(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.negotiations.listForJob(user.userId, jobId);
  }

  @Get('mine')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'My negotiation on this job',
    description: 'Worker views their own thread on this job, if they have one.',
  })
  myThread(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.negotiations.myThread(user.userId, jobId);
  }

  @Post(':negotiationId/offers')
  @ApiOperation({
    summary: 'Counter with a new price',
    description:
      'Either the customer or the worker in this thread proposes a new price. You cannot counter your own last offer twice in a row.',
  })
  @ZodApiBody(CounterOfferSchema)
  counter(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Param('negotiationId') negotiationId: string,
    @Body(new ZodValidationPipe(CounterOfferSchema)) dto: CounterOfferDto,
  ) {
    return this.negotiations.counter(user.userId, jobId, negotiationId, dto);
  }

  @Post(':negotiationId/accept')
  @ApiOperation({
    summary: 'Accept the current price',
    description:
      "Accepts the OTHER side's last proposed price. If it's the customer accepting, the job is assigned to that worker at that price and every other open thread on the job is superseded.",
  })
  accept(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.negotiations.accept(user.userId, jobId, negotiationId);
  }

  @Post(':negotiationId/decline')
  @ApiOperation({
    summary: 'Decline / end this thread',
    description: 'Either side ends this negotiation without accepting.',
  })
  decline(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.negotiations.decline(user.userId, jobId, negotiationId);
  }

  @Post(':negotiationId/withdraw')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Withdraw my negotiation',
    description: 'Worker pulls their own thread.',
  })
  withdraw(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.negotiations.withdraw(user.userId, jobId, negotiationId);
  }
}
