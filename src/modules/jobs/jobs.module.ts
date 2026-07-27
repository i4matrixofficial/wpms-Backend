import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './entities/job.entity';
import { JobNegotiation } from './entities/job-negotiation.entity';
import { JobOffer } from './entities/job-offer.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';
import { WorkersModule } from '../workers/workers.module';
import { ServiceTypesModule } from '../service-types/service-types.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, JobNegotiation, JobOffer]),
    WorkersModule,
    ServiceTypesModule,
  ],
  controllers: [JobsController, NegotiationsController],
  providers: [JobsService, NegotiationsService],
  exports: [JobsService], // ← chat will inject this later
})
export class JobsModule {}
