import {
  Body,
  Controller,
  Param,
  Patch,
  Query,
  Get,
  Put,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { WorkersService } from './workers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { WorkerStatus } from './entities/worker.entity';
import { SetWorkerStatusSchema } from './dto/set-worker-status.dto';
import type { SetWorkerStatusDto } from './dto/set-worker-status.dto';
import { ListWorkersSchema } from './dto/list-workers.dto';
import type { ListWorkersDto } from './dto/list-workers.dto';
import { SetSkillsSchema } from './dto/set-skills.dto';
import type { SetSkillsDto } from './dto/set-skills.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Workers (Admin)')
@ApiBearerAuth()
@Controller('workers')
export class WorkersController {
  constructor(private workers: WorkersService) {}

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Override a worker verification status',
    description:
      "Admin only. Manually sets a worker's verification status (unverified | pending | verified | rejected). An escape hatch alongside the automatic status derived from document approvals.",
  })
  @ApiParam({ name: 'id', description: 'Worker id (UUID)' })
  @ZodApiBody(SetWorkerStatusSchema)
  @ApiResponse({ status: 200, description: 'Worker status updated' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  @ApiResponse({ status: 404, description: 'Worker not found' })
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetWorkerStatusSchema)) dto: SetWorkerStatusDto,
  ) {
    return this.workers.setStatus(id, dto.status as WorkerStatus);
  }
  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List workers (admin)',
    description:
      'Paginated list of workers, filterable by verification status. Returns the worker id needed for status/detail actions.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Query(new ZodValidationPipe(ListWorkersSchema)) query: ListWorkersDto) {
    return this.workers.list({
      status: query.status as WorkerStatus | undefined,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get worker detail (admin)',
    description:
      'Full worker profile including their current documents and skills.',
  })
  getDetail(@Param('id') id: string) {
    return this.workers.getDetail(id);
  }

  @Put('me/skills')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Set my skills',
    description:
      'Worker sets the services they offer (replaces the full list). Must match active service types.',
  })
  @ZodApiBody(SetSkillsSchema)
  setSkills(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(SetSkillsSchema)) dto: SetSkillsDto,
  ) {
    return this.workers.setSkills(user.userId, dto.serviceTypeIds);
  }

  @Get('me/skills')
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Get my skills',
    description: 'The services this worker currently offers.',
  })
  getMySkills(@CurrentUser() user: { userId: string }) {
    return this.workers.getMySkills(user.userId);
  }
}
