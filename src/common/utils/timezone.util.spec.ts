import { isValidTimeZone, partsInZone, zonedTimeOnDay } from './timezone.util';

describe('isValidTimeZone', () => {
  it.each(['Asia/Colombo', 'America/New_York', 'UTC'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(['Not/AZone', 'Asia/Colomboo', ''])('rejects %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });

  // a rejected zone must not poison the formatter cache for later lookups
  it('stays usable after a rejection', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('Asia/Colombo')).toBe(true);
  });
});

describe('partsInZone', () => {
  it('reports the wall clock in the requested zone, not the server zone', () => {
    const instant = new Date('2099-06-15T20:00:00Z');
    expect(partsInZone(instant, 'Asia/Colombo')).toEqual({
      year: 2099,
      month: 6,
      day: 16, // already tomorrow in Colombo
      hour: 1,
      minute: 30,
      second: 0,
    });
  });

  it('renders midnight as hour 0, never 24', () => {
    const midnight = new Date('2099-06-15T18:30:00Z'); // 00:00 in Colombo
    expect(partsInZone(midnight, 'Asia/Colombo').hour).toBe(0);
  });
});

describe('zonedTimeOnDay', () => {
  const at = (iso: string, tz: string, hour: number) =>
    zonedTimeOnDay(new Date(iso), tz, hour).toISOString();

  it('resolves a wall-clock hour on the same calendar day in a half-hour zone', () => {
    // 08:00 in Colombo (UTC+5:30) is 02:30Z
    expect(at('2099-06-15T14:00:00+05:30', 'Asia/Colombo', 8)).toBe(
      '2099-06-15T02:30:00.000Z',
    );
  });

  // the calendar day is the one the instant falls on *in the zone*; taking it
  // from the UTC date would land a day early here
  it('uses the zone’s calendar day, not UTC’s', () => {
    expect(at('2099-06-15T20:00:00Z', 'Asia/Colombo', 8)).toBe(
      '2099-06-16T02:30:00.000Z',
    );
  });

  it('applies the offset in effect on that day, summer and winter', () => {
    // New York is UTC-4 in June and UTC-5 in January — a single cached offset
    // would be an hour out for half the year
    expect(at('2099-06-15T18:00:00Z', 'America/New_York', 8)).toBe(
      '2099-06-15T12:00:00.000Z',
    );
    expect(at('2099-01-15T18:00:00Z', 'America/New_York', 8)).toBe(
      '2099-01-15T13:00:00.000Z',
    );
  });

  // the offset at the start of the day differs from the offset at 08:00 here,
  // which is what the correction pass exists for
  it('lands correctly on a spring-forward day', () => {
    expect(at('2024-03-10T18:00:00Z', 'America/New_York', 8)).toBe(
      '2024-03-10T12:00:00.000Z',
    );
  });

  it('lands correctly on a fall-back day', () => {
    expect(at('2024-11-03T18:00:00Z', 'America/New_York', 8)).toBe(
      '2024-11-03T13:00:00.000Z',
    );
  });

  it('handles hour 0 and hour 23', () => {
    expect(at('2099-06-15T14:00:00+05:30', 'Asia/Colombo', 0)).toBe(
      '2099-06-14T18:30:00.000Z',
    );
    expect(at('2099-06-15T14:00:00+05:30', 'Asia/Colombo', 23)).toBe(
      '2099-06-15T17:30:00.000Z',
    );
  });

  it('is a no-op transform for UTC', () => {
    expect(at('2099-06-15T14:00:00Z', 'UTC', 8)).toBe(
      '2099-06-15T08:00:00.000Z',
    );
  });

  // sub-second precision on the input must not leak into the resolved instant
  it('ignores milliseconds on the input', () => {
    expect(at('2099-06-15T14:00:00.777+05:30', 'Asia/Colombo', 8)).toBe(
      '2099-06-15T02:30:00.000Z',
    );
  });
});
