import { haversineMeters, parsePoint } from './geo.util';

describe('haversineMeters', () => {
  it('measures a degree of latitude at the accepted ~111.19km', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(
      111194.93,
      -1,
    );
  });

  it('agrees with the published Colombo–Kandy great-circle distance', () => {
    const colombo = { lat: 6.9271, lng: 79.8612 };
    const kandy = { lat: 7.2906, lng: 80.6337 };
    // ~94.3km; the spheroidal figure PostGIS would give differs by <0.5%
    expect(haversineMeters(colombo, kandy) / 1000).toBeCloseTo(94.3, 0);
  });

  it('is zero at the destination and symmetric between endpoints', () => {
    const a = { lat: 6.9271, lng: 79.8612 };
    const b = { lat: 6.95, lng: 79.9 };
    expect(haversineMeters(a, a)).toBe(0);
    expect(haversineMeters(a, b)).toBe(haversineMeters(b, a));
  });

  // sqrt(h) can drift just past 1 in floating point for near-antipodal pairs,
  // which would make asin return NaN without the clamp
  it('stays finite for antipodal points', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d / 1000).toBeCloseTo(20015, 0);
  });

  it('handles the equator/meridian crossings without sign errors', () => {
    expect(
      haversineMeters({ lat: -1, lng: -1 }, { lat: 1, lng: 1 }),
    ).toBeCloseTo(haversineMeters({ lat: 1, lng: 1 }, { lat: -1, lng: -1 }), 6);
  });
});

describe('parsePoint', () => {
  // the driver hands PostGIS geography back as GeoJSON, lng first — getting
  // that order wrong silently swaps every reported distance
  it('reads GeoJSON objects lng-first', () => {
    expect(
      parsePoint({ type: 'Point', coordinates: [79.8612, 6.9271] }),
    ).toEqual({ lat: 6.9271, lng: 79.8612 });
  });

  it('reads the same shape when it arrives as a JSON string', () => {
    expect(
      parsePoint('{"type":"Point","coordinates":[79.8612,6.9271]}'),
    ).toEqual({ lat: 6.9271, lng: 79.8612 });
  });

  // callers render this as "distance unknown"; throwing here would take down a
  // whole ping over one bad legacy row
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['unparseable text', '0101000020E6100000'],
    ['a Point with no coordinates', { type: 'Point' }],
    ['a non-point geometry', { type: 'LineString', coordinates: [] }],
    ['an unrelated object', { lat: 6.9271, lng: 79.8612 }],
    ['a truncated coordinate pair', { coordinates: [79.8612] }],
    ['non-numeric coordinates', { coordinates: ['x', 'y'] }],
  ])('returns null for %s', (_label, value) => {
    expect(parsePoint(value)).toBeNull();
  });
});
