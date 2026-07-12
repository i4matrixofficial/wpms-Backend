import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodBody } from '../../common/decorators/zod-schema.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateNotificationSchema,
  ListNotificationsQuerySchema,
  type CreateNotificationDto,
  type ListNotificationsQueryDto,
} from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ZodBody(CreateNotificationSchema)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Get()
  findByUser(
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema))
    query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.findByUser(query);
  }

  @Patch('read-all')
  markAllAsRead(@Query('userId', ParseUUIDPipe) userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }
}
