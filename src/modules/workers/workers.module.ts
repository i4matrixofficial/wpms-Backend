import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from './entities/worker.entity';
import { WorkerDocument } from './entities/worker-document.entity';
import { WorkerDocumentsController } from './worker-documents.controller';
import { WorkerDocumentsService } from './worker-documents.service';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Worker, WorkerDocument])],
  controllers: [WorkerDocumentsController, WorkersController],
  providers: [WorkerDocumentsService, WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
