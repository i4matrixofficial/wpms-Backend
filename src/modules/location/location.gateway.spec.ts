import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { LocationGateway } from './location.gateway';
import { LocationService } from './location.service';
import type { LocationPing } from './location.events';

const JOB = 'job-1';
const USER = 'user-1';
const ROOM = `job:${JOB}`;

const ping: LocationPing = {
  jobId: JOB,
  workerId: USER,
  lat: 6.9271,
  lng: 79.8612,
  accuracy: 10,
  distanceMeters: 0,
  updatedAt: new Date(),
  stale: false,
};

describe('LocationGateway', () => {
  let gateway: LocationGateway;
  let location: { saveLocation: jest.Mock; assertParticipant: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let emit: jest.Mock;
  let to: jest.Mock;

  // A mock socket. The jest.fn()s are returned alongside it rather than read
  // back off the socket, so assertions never reference an unbound method.
  const client = (handshake: unknown = { auth: {}, headers: {} }) => {
    const join = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn();
    const data: { userId?: string } = {};
    const socket = { data, join, disconnect, handshake } as unknown as Socket;
    return { socket, join, disconnect, data };
  };

  // ...already past handleConnection, so the socket carries an identity
  const authed = () => {
    const c = client();
    c.data.userId = USER;
    return c;
  };

  beforeEach(async () => {
    location = {
      saveLocation: jest.fn().mockResolvedValue(ping),
      assertParticipant: jest.fn().mockResolvedValue({ id: JOB }),
    };
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: USER }) };
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationGateway,
        { provide: LocationService, useValue: location },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    gateway = moduleRef.get(LocationGateway);
    gateway.server = { to } as unknown as Server;
  });

  describe('handleConnection', () => {
    it('stamps the socket with the authenticated user id', async () => {
      const { socket, disconnect, data } = client({
        auth: { token: 'good' },
        headers: {},
      });

      await gateway.handleConnection(socket);

      expect(data.userId).toBe(USER);
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('accepts the token from an Authorization header too', async () => {
      const { socket, disconnect } = client({
        auth: {},
        headers: { authorization: 'Bearer good' },
      });

      await gateway.handleConnection(socket);

      expect(jwt.verifyAsync).toHaveBeenCalledWith('good', {
        secret: 'test-secret',
      });
      expect(disconnect).not.toHaveBeenCalled();
    });

    // an unauthenticated socket must never linger: every later handler trusts
    // client.data.userId without re-verifying
    it('drops the socket when the token is bad', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const { socket, disconnect, data } = client({
        auth: { token: 'bad' },
        headers: {},
      });

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalledWith(true);
      expect(data.userId).toBeUndefined();
    });

    it('drops the socket when no token is supplied at all', async () => {
      const { socket, disconnect } = client();

      await gateway.handleConnection(socket);

      expect(disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('watch', () => {
    it('joins the job room once participation is confirmed', async () => {
      const { socket, join } = authed();

      await expect(gateway.onWatch(socket, { jobId: JOB })).resolves.toEqual({
        ok: true,
      });
      expect(location.assertParticipant).toHaveBeenCalledWith(USER, JOB);
      expect(join).toHaveBeenCalledWith(ROOM);
    });

    // the room carries a live position — a non-participant must not get in
    it('refuses to join a job the caller is not part of', async () => {
      location.assertParticipant.mockRejectedValue(
        new ForbiddenException('Not your job'),
      );
      const { socket, join } = authed();

      await expect(gateway.onWatch(socket, { jobId: JOB })).resolves.toEqual({
        ok: false,
        error: 'Not your job',
      });
      expect(join).not.toHaveBeenCalled();
    });

    it('rejects a watch with no jobId without hitting the service', async () => {
      const { socket } = authed();

      await expect(gateway.onWatch(socket, {})).resolves.toMatchObject({
        ok: false,
      });
      expect(location.assertParticipant).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('delegates the ping to the service under the socket’s identity', async () => {
      await expect(
        gateway.onUpdate(authed().socket, {
          jobId: JOB,
          lat: 6.9271,
          lng: 79.8612,
          accuracy: 10,
        }),
      ).resolves.toEqual({ ok: true });

      expect(location.saveLocation).toHaveBeenCalledWith(USER, JOB, {
        lat: 6.9271,
        lng: 79.8612,
        accuracy: 10,
      });
    });

    // Broadcasting here as well as on the event would double-send every socket
    // ping and leave REST pings on a different code path. The service emits;
    // onLocationUpdated is the only place that touches the wire.
    it('does not broadcast directly — the emitted event is the only fan-out', async () => {
      await gateway.onUpdate(authed().socket, { jobId: JOB, lat: 1, lng: 2 });
      expect(to).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing jobId', { lat: 1, lng: 2 }],
      ['a missing position', { jobId: JOB }],
      ['an out-of-range latitude', { jobId: JOB, lat: 91, lng: 2 }],
      ['an out-of-range longitude', { jobId: JOB, lat: 1, lng: 181 }],
    ])('rejects %s without calling the service', async (_label, payload) => {
      await expect(
        gateway.onUpdate(authed().socket, payload),
      ).resolves.toMatchObject({
        ok: false,
      });
      expect(location.saveLocation).not.toHaveBeenCalled();
    });

    // a socket error must come back as a result, not kill the connection
    it('returns a service rejection to the caller instead of throwing', async () => {
      location.saveLocation.mockRejectedValue(
        new ForbiddenException('Only the assigned worker can share location'),
      );

      await expect(
        gateway.onUpdate(authed().socket, { jobId: JOB, lat: 1, lng: 2 }),
      ).resolves.toEqual({
        ok: false,
        error: 'Only the assigned worker can share location',
      });
    });
  });

  describe('fan-out', () => {
    it('broadcasts a persisted ping to the job room', () => {
      gateway.onLocationUpdated({ jobId: JOB, ping });

      expect(to).toHaveBeenCalledWith(ROOM);
      expect(emit).toHaveBeenCalledWith('location', ping);
    });

    it('tells watchers when tracking ends', () => {
      gateway.onTrackingEnded({ jobId: JOB, reason: 'completed' });

      expect(to).toHaveBeenCalledWith(ROOM);
      expect(emit).toHaveBeenCalledWith('tracking-ended', {
        jobId: JOB,
        reason: 'completed',
      });
    });

    // rooms are namespaced per job so a customer watching one job never sees
    // another job's worker
    it('scopes every broadcast to that job’s room alone', () => {
      gateway.onLocationUpdated({ jobId: 'job-2', ping });
      expect(to).toHaveBeenCalledWith('job:job-2');
      expect(to).not.toHaveBeenCalledWith(ROOM);
    });
  });
});
