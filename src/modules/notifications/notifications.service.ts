import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZodError } from 'zod';
import { buildNotificationContent } from './constants/notification-templates';
import {
  CreateNotificationDto,
  ListNotificationsQueryDto,
} from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
  ) {}

  /**
   * Persists a notification only (no push).
   * Title/body are built from type templates + validated `data`.
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    let content: { title: string; body: string; data: Record<string, unknown> };

    try {
      content = buildNotificationContent(dto.type, dto.data ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: `Invalid data for notification type ${dto.type}`,
          errors: error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      throw error;
    }

    const notification = this.notificationsRepo.create({
      userId: dto.userId,
      type: dto.type,
      title: content.title,
      body: content.body,
      data: content.data,
      isRead: false,
      pushedAt: null,
    });

    return this.notificationsRepo.save(notification);
  }

  /** Convenience helpers for other modules to call without knowing templates. */
  async notify(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown> = {},
  ): Promise<Notification> {
    return this.create({ userId, type, data });
  }

  async findByUser(query: ListNotificationsQueryDto): Promise<{
    items: Notification[];
    total: number;
  }> {
    const where: { userId: string; isRead?: boolean } = {
      userId: query.userId,
    };
    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [items, total] = await this.notificationsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return { items, total };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      return this.notificationsRepo.save(notification);
    }

    return notification;
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepo.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }
}
