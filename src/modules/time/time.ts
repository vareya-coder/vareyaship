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

function parseTimeOfDay(value: string): { hour: number; minute: number } {
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

export function hasReachedCutoff(now: Date, cutoffHHmm: string, timeZone: string): boolean {
  const { hour, minute } = parseTimeOfDay(cutoffHHmm);

  // Build a Date object that represents today at cutoff in the target TZ by parsing parts
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const dNum = Number(parts.find((p) => p.type === 'day')?.value);

  // Construct local time string for that TZ day; JS Date will interpret as local time, so we compare string values for simplicity.
  // Instead, compare minutes since start of day using parts from the same TZ snapshot.
  const currentHour = Number(parts.find((p) => p.type === 'hour')?.value);
  const currentMinute = Number(parts.find((p) => p.type === 'minute')?.value);

  const currentTotalMin = currentHour * 60 + currentMinute;
  const cutoffTotalMin = hour * 60 + minute;

  return currentTotalMin >= cutoffTotalMin;
}
