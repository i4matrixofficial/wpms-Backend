import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodBody } from '../../common/decorators/zod-schema.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ComplaintsService } from './complaints.service';
import {
  ListComplaintsQuerySchema,
  SubmitComplaintSchema,
  UpdateComplaintStatusSchema,
  type ListComplaintsQueryDto,
  type SubmitComplaintDto,
  type UpdateComplaintStatusDto,
} from './dto/complaint.dto';

@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  /** Customer / Worker: submit a complaint. */
  @Post()
  @ZodBody(SubmitComplaintSchema)
  submit(@Body() dto: SubmitComplaintDto) {
    return this.complaintsService.submit(dto);
  }

  /**
   * List complaints (filter by user, against user, booking, status).
   * Admin: omit filters or filter by status.
   * Customer/Worker: pass own userId to see their submissions.
   */
  @Get()
  findAll(
    @Query(new ZodValidationPipe(ListComplaintsQuerySchema))
    query: ListComplaintsQueryDto,
  ) {
    return this.complaintsService.findAll(query);
  }

  /** Admin / involved user: view complaint details. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.complaintsService.findOne(id);
  }

  /** Admin: review or resolve a complaint. */
  @Patch(':id/status')
  @ZodBody(UpdateComplaintStatusSchema)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplaintStatusDto,
  ) {
    return this.complaintsService.updateStatus(id, dto);
  }
}
