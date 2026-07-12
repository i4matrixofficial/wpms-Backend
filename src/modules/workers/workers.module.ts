import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from './entities/worker.entity';
import { WorkerDocument } from './entities/worker-document.entity';
import { WorkerDocumentsController } from './worker-documents.controller';
import { WorkerDocumentsService } from './worker-documents.service';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { ServiceType } from '../service-types/entities/service-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Worker, WorkerDocument, ServiceType])],
  controllers: [WorkerDocumentsController, WorkersController],
  providers: [WorkerDocumentsService, WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
