import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SendMessageSchema } from './dto/send-message.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesSchema } from './dto/list-messages.dto';
import type { ListMessagesDto } from './dto/list-messages.dto';

// REST surface for chat — history is fetched here, live delivery goes over
// the /chat WebSocket namespace (ChatGateway). Sending also works over REST
// for clients that aren't connected to the socket.
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('jobs/:jobId/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @ApiOperation({
    summary: 'Send a message',
    description:
      'Either the customer or the assigned worker on this job sends a message. Requires the job to already have an assigned worker, not be blocked by the other side, and not be cancelled/expired.',
  })
  @ZodApiBody(SendMessageSchema)
  send(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.chat.send(user.userId, jobId, dto);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Send an image message',
    description:
      'Uploads an image (multipart/form-data) as a chat message. Max 5MB; JPEG/PNG only.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  sendImage(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.chat.sendImage(user.userId, jobId, file);
  }

  @Get()
  @ApiOperation({
    summary: 'Message history',
    description:
      'Paginated chat history for this job, oldest first. Either participant can read it.',
  })
  history(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
    @Query(new ZodValidationPipe(ListMessagesSchema)) query: ListMessagesDto,
  ) {
    return this.chat.history(user.userId, jobId, query);
  }

  @Post('seen')
  @ApiOperation({
    summary: "Mark this job's thread as seen",
    description:
      'Marks every message the other participant sent as read, and clears the unread counter for this job.',
  })
  markSeen(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.chat.markSeen(user.userId, jobId);
  }

  @Get('unread')
  @ApiOperation({
    summary: 'Unread count for this job',
  })
  unread(
    @CurrentUser() user: { userId: string },
    @Param('jobId') jobId: string,
  ) {
    return this.chat.unreadForJob(user.userId, jobId).then((count) => ({
      count,
    }));
  }
}
