import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UpdateReviewSchema } from './dto/update-review.dto';
import type { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsSchema } from './dto/list-reviews.dto';
import type { ListReviewsDto } from './dto/list-reviews.dto';
import { HideReviewSchema } from './dto/hide-review.dto';
import type { HideReviewDto } from './dto/hide-review.dto';

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('mine')
  @ApiOperation({
    summary: 'Reviews I wrote',
    description: 'Newest first. Includes ones an admin has hidden.',
  })
  mine(
    @CurrentUser() user: { userId: string },
    @Query(new ZodValidationPipe(ListReviewsSchema)) query: ListReviewsDto,
  ) {
    return this.reviews.mine(user.userId, query);
  }

  @Get('users/:userId')
  @ApiOperation({
    summary: 'Reviews a user received',
    description:
      'Public profile feed with a star breakdown. Filter with `direction=customer_to_worker` for their reputation as a worker, or `worker_to_customer` as a customer.',
  })
  received(
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(ListReviewsSchema)) query: ListReviewsDto,
  ) {
    return this.reviews.received(userId, query);
  }

  @Get('users/:userId/summary')
  @ApiOperation({ summary: 'Rating summary for a user' })
  summary(
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(ListReviewsSchema)) query: ListReviewsDto,
  ) {
    return this.reviews.summary(userId, query.direction);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit my review',
    description:
      'The author can correct their own rating or comment within 24 hours of posting; after that it is frozen.',
  })
  @ZodApiBody(UpdateReviewSchema)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateReviewSchema)) dto: UpdateReviewDto,
  ) {
    return this.reviews.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Withdraw my review',
    description:
      'The author can withdraw their own review within the same 24-hour window they can edit it in. It disappears from the listings and the ratings, and they are free to post a replacement on that job.',
  })
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.reviews.remove(user.userId, id);
  }

  @Post(':id/hide')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Hide a review (admin)',
    description:
      'Moderation: drops the review from public listings and from the rating averages. The row is kept for audit.',
  })
  @ZodApiBody(HideReviewSchema)
  hide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(HideReviewSchema)) dto: HideReviewDto,
  ) {
    return this.reviews.setHidden(id, true, dto.reason);
  }

  @Post(':id/unhide')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Restore a hidden review (admin)' })
  unhide(@Param('id') id: string) {
    return this.reviews.setHidden(id, false);
  }
}
