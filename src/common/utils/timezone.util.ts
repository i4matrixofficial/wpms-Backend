// Zoned wall-clock arithmetic without a date library.
//
// `Date`'s local-time methods (getHours/setHours) read the *server's* timezone,
// which in production is whatever the container was built with — usually UTC.
// Any business rule phrased in local terms ("tracking opens at 8am") has to be
// evaluated in the market's timezone instead, or it silently fires at the wrong
// wall-clock time. Intl already carries the full IANA database, so we use it as
// the offset source rather than adding a dependency.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

/** True if the runtime recognises this IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    formatters.delete(timeZone);
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock fields an instant maps to in the given zone. */
export function partsInZone(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

// Zone offset east of UTC, in ms, at a given instant. Derived by rendering the
// instant in the zone and re-reading those fields as if they were UTC — the
// gap between the two is the offset, DST included.
function offsetMsAt(utcMs: number, timeZone: string): number {
  const p = partsInZone(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  // formatToParts drops sub-second precision; round to whole seconds so the
  // subtraction yields a clean offset rather than offset-minus-millis.
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant at which `hour:00:00` occurs, in `timeZone`, on the calendar day
 * that `onDay` falls on *in that same zone*.
 *
 * Resolved iteratively because the offset we need is the one in effect at the
 * target instant, not at `onDay` — one correction pass settles it for every
 * real-world DST transition.
 */
export function zonedTimeOnDay(
  onDay: Date,
  timeZone: string,
  hour: number,
): Date {
  const { year, month, day } = partsInZone(onDay, timeZone);
  const wallClock = Date.UTC(year, month - 1, day, hour, 0, 0);

  let utcMs = wallClock - offsetMsAt(onDay.getTime(), timeZone);
  utcMs = wallClock - offsetMsAt(utcMs, timeZone);
  return new Date(utcMs);
}
