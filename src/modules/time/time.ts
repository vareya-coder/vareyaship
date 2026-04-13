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

export function hasReachedCutoff(now: Date, cutoffHHmm: string, timeZone: string): boolean {
  const [hh, mm] = cutoffHHmm.split(':').map((s) => Number.parseInt(s, 10));

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
  const cutoffTotalMin = hh * 60 + mm;

  return currentTotalMin >= cutoffTotalMin;
}

