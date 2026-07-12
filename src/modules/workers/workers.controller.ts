import { Body, Controller, Param, Patch } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WorkersService } from './workers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { WorkerStatus } from './entities/worker.entity';
import { SetWorkerStatusSchema } from './dto/set-worker-status.dto';
import type { SetWorkerStatusDto } from './dto/set-worker-status.dto';

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
}
