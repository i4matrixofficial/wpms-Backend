import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { JobLocation } from './entities/job-location.entity';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { LocationGateway } from './location.gateway';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobLocation]),
    JwtModule.register({}), // secret passed per verify call, same as ChatModule
    JobsModule,
  ],
  controllers: [LocationController],
  providers: [LocationService, LocationGateway],
})
export class LocationModule {}
