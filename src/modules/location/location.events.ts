// Emitted by LocationService after a ping is persisted, or once a job stops
// being trackable. LocationGateway listens and pushes them over the socket —
// decouples the "save it" path (REST or gateway) from the "broadcast it live"
// path, same pattern as Chat and Jobs -> Payments.
export const LOCATION_UPDATED = 'location.updated';
export const LOCATION_TRACKING_ENDED = 'location.tracking.ended';

export interface LocationPing {
  jobId: string;
  workerId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  // straight-line metres from the worker to the job's destination, null if
  // the job row has no usable location
  distanceMeters: number | null;
  updatedAt: Date;
  // always false on a live ping; present so this payload and the REST
  // last-known read are the same shape for clients rendering from both
  stale: boolean;
}

export interface LocationUpdatedEvent {
  jobId: string;
  ping: LocationPing;
}

export interface LocationTrackingEndedEvent {
  jobId: string;
  reason: 'completed' | 'cancelled';
}
