export const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';

export function getOperationalDateISO(
  d: Date,
  timeZone: string,
): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA short date yields YYYY-MM-DD
  return fmt.format(d);
}

export function toAmsterdamDate(ts: Date): string {
  return getOperationalDateISO(ts, AMSTERDAM_TIME_ZONE);
}

export function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const normalized = value.trim().toLowerCase();

  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hour = Number.parseInt(hhmmMatch[1], 10);
    const minute = Number.parseInt(hhmmMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  const ampmMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    const rawHour = Number.parseInt(ampmMatch[1], 10);
    const minute = Number.parseInt(ampmMatch[2] ?? '0', 10);
    if (rawHour >= 1 && rawHour <= 12 && minute >= 0 && minute <= 59) {
      const meridiem = ampmMatch[3];
      const hour = meridiem === 'pm' && rawHour !== 12
        ? rawHour + 12
        : meridiem === 'am' && rawHour === 12
          ? 0
          : rawHour;
      return { hour, minute };
    }
  }

  throw new Error(`Invalid time format: "${value}". Use HH:mm or values like 7pm.`);
}

export function getLocalDateAndMinutes(date: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value);
  const currentHour = rawHour === 24 ? 0 : rawHour;
  const currentMinute = Number(parts.find((p) => p.type === 'minute')?.value);

  return {
    date: `${year}-${month}-${day}`,
    minutes: currentHour * 60 + currentMinute,
  };
}

function addDaysToISODate(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getShipmentOperationalDateISO(
  shipmentCreatedAt: Date,
  cutoffHHmm: string,
  timeZone: string = AMSTERDAM_TIME_ZONE,
): string {
  const local = getLocalDateAndMinutes(shipmentCreatedAt, timeZone);
  const { hour, minute } = parseTimeOfDay(cutoffHHmm);
  const cutoffTotalMin = hour * 60 + minute;

  return local.minutes > cutoffTotalMin
    ? addDaysToISODate(local.date, 1)
    : local.date;
}

export function hasReachedCutoff(now: Date, cutoffHHmm: string, timeZone: string): boolean {
  const { hour, minute } = parseTimeOfDay(cutoffHHmm);
  const currentTotalMin = getLocalDateAndMinutes(now, timeZone).minutes;
  const cutoffTotalMin = hour * 60 + minute;

  return currentTotalMin >= cutoffTotalMin;
}
