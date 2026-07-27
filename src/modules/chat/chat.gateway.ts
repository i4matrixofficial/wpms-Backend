import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { ChatService } from './chat.service';
import { SendMessageSchema } from './dto/send-message.dto';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type {
  ChatMessageCreatedEvent,
  ChatMessageSeenEvent,
} from './chat.events';

// Realtime delivery for job chat. REST (ChatController) is still the source
// of truth for history and for image sends — this pushes new messages,
// presence, and read receipts to whoever is connected. Auth happens on
// connect (JWT in handshake), not per-message.
@WebSocketGateway({ namespace: '/chat', cors: { origin: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      const userId = payload.sub;
      (client.data as { userId: string }).userId = userId;
      await client.join(this.userRoom(userId));

      const count = await this.redis.incr(`presence:count:${userId}`);
      if (count === 1) {
        await this.redis.sadd('presence:online', userId);
        this.server.emit('presence', { userId, online: true });
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return;
    const count = await this.redis.decr(`presence:count:${userId}`);
    if (count <= 0) {
      await this.redis.del(`presence:count:${userId}`);
      await this.redis.srem('presence:online', userId);
      this.server.emit('presence', { userId, online: false });
    }
  }

  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const userId = (client.data as { userId: string }).userId;
    if (!data?.jobId) return { ok: false, error: 'jobId required' };
    try {
      await this.chat.assertParticipant(userId, data.jobId);
      await client.join(this.room(data.jobId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('send')
  async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string; body?: string },
  ) {
    const userId = (client.data as { userId: string }).userId;
    const parsed = SendMessageSchema.safeParse({ body: data?.body });
    if (!data?.jobId || !parsed.success) {
      return { ok: false, error: 'Invalid jobId/body' };
    }
    try {
      const message = await this.chat.send(userId, data.jobId, parsed.data);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('seen')
  async onSeen(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const userId = (client.data as { userId: string }).userId;
    if (!data?.jobId) return { ok: false, error: 'jobId required' };
    try {
      return await this.chat.markSeen(userId, data.jobId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // fired by ChatService after any message is persisted (REST send, socket
  // send, or the JOB_CANCELLED system message) — the single place messages
  // actually go out over the wire
  @OnEvent('chat.message.created')
  async onMessageCreated(event: ChatMessageCreatedEvent) {
    const room = this.room(event.jobId);
    this.server.to(room).emit('message', event.message);

    if (!event.recipientId) return; // system/broadcast message, nothing more to do

    const delivered = await this.isSocketInRoom(room, event.recipientId);
    if (delivered) {
      const messageId = (event.message as { id?: string }).id;
      if (messageId) {
        await this.chat.markDelivered(messageId);
        const deliveredAt = new Date();
        const senderId = (event.message as { senderId?: string | null })
          .senderId;
        const payload = { jobId: event.jobId, messageId, deliveredAt };
        // let both the room (if the sender is looking at it) and the
        // sender's personal room (if they aren't) see the live tick
        this.server.to(room).emit('delivered', payload);
        if (senderId) {
          this.server.to(this.userRoom(senderId)).emit('delivered', payload);
        }
      }
    } else {
      // recipient isn't looking at this job's thread right now — still nudge
      // their personal room so a client can update an unread badge live
      this.server
        .to(this.userRoom(event.recipientId))
        .emit('unread', { jobId: event.jobId });
    }
  }

  @OnEvent('chat.message.seen')
  onMessageSeen(event: ChatMessageSeenEvent) {
    this.server.to(this.room(event.jobId)).emit('seen', {
      jobId: event.jobId,
      seenBy: event.seenBy,
    });
  }

  private async isSocketInRoom(room: string, userId: string) {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.some(
      (s) => (s.data as { userId?: string }).userId === userId,
    );
  }

  private extractToken(client: Socket): string {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    const header = client.handshake.headers.authorization;
    const fromHeader = header?.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    const token = fromAuth ?? fromHeader;
    if (!token) throw new Error('No token provided');
    return token;
  }

  private room(jobId: string) {
    return `job:${jobId}`;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
