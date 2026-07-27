import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BlockUserSchema } from './dto/block-user.dto';
import type { BlockUserDto } from './dto/block-user.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatBlocksController {
  constructor(private readonly chat: ChatService) {}

  @Post('blocks')
  @ApiOperation({ summary: 'Block a user from messaging you' })
  @ZodApiBody(BlockUserSchema)
  block(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(BlockUserSchema)) dto: BlockUserDto,
  ) {
    return this.chat.block(user.userId, dto.userId);
  }

  @Delete('blocks/:userId')
  @ApiOperation({ summary: 'Unblock a user' })
  unblock(
    @CurrentUser() user: { userId: string },
    @Param('userId') userId: string,
  ) {
    return this.chat.unblock(user.userId, userId);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'List users you have blocked' })
  list(@CurrentUser() user: { userId: string }) {
    return this.chat.listBlocks(user.userId);
  }

  @Get('unread')
  @ApiOperation({
    summary: 'Unread message summary across all jobs',
    description: 'Total unread count plus a per-job breakdown.',
  })
  unread(@CurrentUser() user: { userId: string }) {
    return this.chat.unreadSummary(user.userId);
  }
}
