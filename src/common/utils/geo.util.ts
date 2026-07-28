export interface GeoPoint {
  lat: number;
  lng: number;
}

// Mean Earth radius (IUGG), metres.
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres.
 *
 * This is a spherical approximation. Measured against PostGIS `ST_Distance` on
 * the WGS84 spheroid it runs ~0.5% high (7917m vs 7874m on an 8km north-south
 * leg near the equator — the worst-case orientation, since the mean radius
 * overstates the meridian's curvature there). That is dwarfed by the gap
 * between straight-line and road distance, and these numbers are only ever
 * shown as an ETA-ish "how far away is my worker", so the tradeoff buys us a
 * database round trip on every ping. Anything that needs true geodesic
 * distance — matching, pricing, radius filters — must keep using PostGIS.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(meters * 100) / 100;
}

/**
 * Reads a PostGIS `geography(Point, 4326)` column into {lat, lng}.
 *
 * Entities type these columns as `string`, but at runtime the driver hands
 * back parsed GeoJSON (`{ type: 'Point', coordinates: [lng, lat] }`) — note
 * the coordinate order, which is lng-first. A GeoJSON string is accepted too.
 *
 * Anything unrecognised yields null rather than throwing, so a caller degrades
 * to "distance unknown" instead of failing the request. That is defence against
 * a driver or column-type change, not an expected case: `jobs.location` is NOT
 * NULL, so a null here means something upstream is wrong and worth logging.
 */
export function parsePoint(value: unknown): GeoPoint | null {
  if (value === null || value === undefined) return null;

  let candidate: unknown = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof candidate !== 'object' || candidate === null) return null;

  const coords = (candidate as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}
