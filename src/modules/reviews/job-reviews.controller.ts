import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateReviewSchema } from './dto/create-review.dto';
import type { CreateReviewDto } from './dto/create-review.dto';

// job-scoped review surface: writing a review always happens in the context
// of the job it is about, so there is no way to review a stranger.
@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('jobs/:jobId/reviews')
export class JobReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @ApiOperation({
    summary: 'Review the other party on this job',
    description:
      'Either participant rates the other 1–5 stars with an optional comment. Allowed once the job is completed **or cancelled** — being paired on a job is what earns the review, not the outcome. One review per person per job.',
  })
  @ZodApiBody(CreateReviewSchema)
  create(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(CreateReviewSchema)) dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.userId, jobId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Reviews on this job',
    description:
      'Both directions, visible to the two participants of the job only.',
  })
  forJob(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.reviews.forJob(user.userId, jobId);
  }

  @Get('eligibility')
  @ApiOperation({
    summary: 'Can I review this job?',
    description:
      'Tells the client whether to show the review prompt, and whether the caller already submitted one.',
  })
  eligibility(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.reviews.eligibility(user.userId, jobId);
  }
}
