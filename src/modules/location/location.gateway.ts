import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LocationService } from './location.service';
import { UpdateLocationSchema } from './dto/update-location.dto';
import {
  LOCATION_TRACKING_ENDED,
  LOCATION_UPDATED,
  type LocationTrackingEndedEvent,
  type LocationUpdatedEvent,
} from './location.events';

// Dedicated realtime channel for worker location, kept separate from /chat so
// a customer can watch a job's map without subscribing to message traffic
// (and vice versa). Auth happens on connect (JWT in handshake), same as chat.
@WebSocketGateway({ namespace: '/location', cors: { origin: true } })
export class LocationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly location: LocationService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      (client.data as { userId: string }).userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  // either participant joins to receive 'location' events for this job
  @SubscribeMessage('watch')
  async onWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const userId = (client.data as { userId: string }).userId;
    if (!data?.jobId) return { ok: false, error: 'jobId required' };
    try {
      await this.location.assertParticipant(userId, data.jobId);
      await client.join(this.room(data.jobId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // worker pushes a position update
  @SubscribeMessage('update')
  async onUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { jobId?: string; lat?: number; lng?: number; accuracy?: number },
  ) {
    const userId = (client.data as { userId: string }).userId;
    const parsed = UpdateLocationSchema.safeParse({
      lat: data?.lat,
      lng: data?.lng,
      accuracy: data?.accuracy,
    });
    if (!data?.jobId || !parsed.success) {
      return { ok: false, error: 'Invalid jobId/lat/lng' };
    }
    try {
      // the broadcast happens in onLocationUpdated, off the emitted event —
      // so a ping sent over REST reaches the room the same way this one does
      await this.location.saveLocation(userId, data.jobId, parsed.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // fired by LocationService after any ping is persisted (REST or socket) —
  // the single place a position actually goes out over the wire
  @OnEvent(LOCATION_UPDATED)
  onLocationUpdated(event: LocationUpdatedEvent) {
    this.server.to(this.room(event.jobId)).emit('location', event.ping);
  }

  // job settled — tell watchers to stop expecting updates and drop the marker
  @OnEvent(LOCATION_TRACKING_ENDED)
  onTrackingEnded(event: LocationTrackingEndedEvent) {
    this.server
      .to(this.room(event.jobId))
      .emit('tracking-ended', { jobId: event.jobId, reason: event.reason });
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
}
