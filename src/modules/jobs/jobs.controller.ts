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
} from '@nestjs/swagger';
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
import { NearbyJobsSchema } from './dto/nearby-jobs.dto';
import type { NearbyJobsDto } from './dto/nearby-jobs.dto';

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

  @Get('nearby')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Find nearby jobs',
    description:
      'Worker discovers REQUESTED jobs within a radius, matching their skills, ordered by distance (nearest first). Requires a verified worker profile with at least one skill.',
  })
  @ApiQuery({
    name: 'lat',
    required: true,
    description: "Worker's current latitude",
  })
  @ApiQuery({
    name: 'lng',
    required: true,
    description: "Worker's current longitude",
  })
  @ApiQuery({
    name: 'radiusKm',
    required: false,
    description: 'Search radius in kilometers (default 10, max 50)',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  nearby(
    @CurrentUser() user: { userId: string },
    @Query(new ZodValidationPipe(NearbyJobsSchema)) query: NearbyJobsDto,
  ) {
    return this.jobs.findNearby(user.userId, query);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'My jobs (scoped to active mode)',
    description:
      'Returns jobs for the mode you are currently in — in customer mode, the jobs you posted; in worker mode, the jobs you accepted. A dual-role user only ever sees one side at a time, so switching mode hides the other.',
  })
  mine(@CurrentUser() user: { userId: string; activeMode: Role }) {
    return this.jobs.mine(user.userId, user.activeMode);
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
