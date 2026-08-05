import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsController } from './reviews.controller';
import { JobReviewsController } from './job-reviews.controller';
import { ReviewsService } from './reviews.service';
import { JobsModule } from '../jobs/jobs.module';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review]), JobsModule, WorkersModule],
  controllers: [JobReviewsController, ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
