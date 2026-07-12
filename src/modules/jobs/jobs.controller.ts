import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CreateJobSchema } from './dto/create-job.dto';
import type { CreateJobDto } from './dto/create-job.dto';
import { CancelJobSchema } from './dto/cancel-job.dto';
import type { CancelJobDto } from './dto/cancel-job.dto';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'Create (broadcast) a job',
    description:
      'Customer posts a job. Broadcasts to nearby matching workers as "requested".',
  })
  @ZodApiBody(CreateJobSchema)
  create(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(CreateJobSchema)) dto: CreateJobDto,
  ) {
    return this.jobs.create(user.userId, dto);
  }

  @Patch(':id/accept')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Accept a job',
    description:
      'Worker claims a requested job. Race-safe — first verified, skill-matched worker wins.',
  })
  accept(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.jobs.accept(user.userId, id);
  }

  @Patch(':id/start')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Start work',
    description: 'Worker marks an accepted job as in progress.',
  })
  start(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.jobs.start(user.userId, id);
  }

  @Patch(':id/complete')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Complete work',
    description: 'Worker marks an in-progress job as completed.',
  })
  complete(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.jobs.complete(user.userId, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a job',
    description: 'Customer or the assigned worker cancels the job.',
  })
  @ZodApiBody(CancelJobSchema)
  cancel(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelJobSchema)) dto: CancelJobDto,
  ) {
    return this.jobs.cancel(user.userId, id, dto.reason);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'My jobs',
    description: 'Customer: their requested jobs. Worker: jobs they accepted.',
  })
  mine(@CurrentUser() user: { userId: string; role: Role }) {
    return this.jobs.mine(user.userId, user.role);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a job',
    description:
      'Returns one job. Only the customer or assigned worker can view it.',
  })
  getById(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.jobs.getById(user.userId, id);
  }
}
