import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatBlock } from './entities/chat-block.entity';
import { ChatController } from './chat.controller';
import { ChatBlocksController } from './chat-blocks.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatBlock]),
    JwtModule.register({}), // secret passed per verify call, same as AuthModule
    JobsModule,
  ],
  controllers: [ChatController, ChatBlocksController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
