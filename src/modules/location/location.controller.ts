import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { LocationService } from './location.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UpdateLocationSchema } from './dto/update-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

// REST surface for location — live delivery goes over the /location
// WebSocket namespace (LocationGateway); this is the fallback for clients
// that aren't holding the socket open. Pings sent here still reach socket
// watchers, since LocationService emits and the gateway broadcasts.
@ApiTags('Location')
@ApiBearerAuth()
@Controller('jobs/:jobId/location')
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Post()
  @Roles(Role.WORKER)
  @ApiOperation({
    summary: 'Report the current position for this job',
    description:
      "Only the job's assigned worker, and only while the job is accepted or in progress. Overwrites the previous fix — no movement history is kept. Rate limited per job (`LOCATION_MIN_PING_INTERVAL_MS`), so clients should ping on a timer rather than on every GPS callback.",
  })
  @ApiTooManyRequestsResponse({
    description:
      'Pings for this job are arriving faster than the configured minimum interval. Back off and send the next fix; nothing was stored.',
  })
  @ZodApiBody(UpdateLocationSchema)
  update(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(UpdateLocationSchema)) dto: UpdateLocationDto,
  ) {
    return this.location.saveLocation(user.userId, jobId, dto);
  }

  @Get()
  @ApiOperation({
    summary: "Worker's last known location for this job",
    description:
      'Either the customer or the assigned worker on this job can read it. 404 if the worker has not reported a position yet; 409 once the job has settled, since the stored fix is deleted when tracking ends — a polling client should treat that as "stop polling", not as a transient error. `stale` is true when the fix is over a minute old.',
  })
  getLatest(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.location.getLatest(user.userId, jobId);
  }
}
