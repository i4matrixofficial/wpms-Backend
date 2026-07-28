import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { WorkersModule } from './modules/workers/workers.module';
import { MailModule } from './modules/mail/mail.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChatModule } from './modules/chat/chat.module';
import { LocationModule } from './modules/location/location.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    MailModule,
    WorkersModule,
    ServiceTypesModule,
    JobsModule,
    PaymentsModule,
    ChatModule,
    LocationModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
