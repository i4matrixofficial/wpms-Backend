import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './entities/job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { WorkersModule } from '../workers/workers.module';
import { ServiceTypesModule } from '../service-types/service-types.module';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), WorkersModule, ServiceTypesModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService], // ← chat will inject this later
})
export class JobsModule {}
