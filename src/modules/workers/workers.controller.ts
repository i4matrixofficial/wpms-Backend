import { Body, Controller, Param, Patch } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { WorkerStatus } from './entities/worker.entity';
import { SetWorkerStatusSchema } from './dto/set-worker-status.dto';
import type { SetWorkerStatusDto } from './dto/set-worker-status.dto';

@Controller('workers')
export class WorkersController {
  constructor(private workers: WorkersService) {}

  // ADMIN manual override of a worker's verification status
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetWorkerStatusSchema)) dto: SetWorkerStatusDto,
  ) {
    return this.workers.setStatus(id, dto.status as WorkerStatus);
  }
}
