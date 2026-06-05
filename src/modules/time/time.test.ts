import assert from 'node:assert/strict';
import {
  AMSTERDAM_TIME_ZONE,
  getShipmentOperationalDateISO,
  hasReachedCutoff,
  isWithinLocalTimeRange,
  toAmsterdamDate,
} from './time';

assert.equal(
  toAmsterdamDate(new Date('2026-05-05T22:30:00.000Z')),
  '2026-05-06',
);

assert.equal(
  getShipmentOperationalDateISO(new Date('2026-05-05T14:59:00.000Z'), '17:00', AMSTERDAM_TIME_ZONE),
  '2026-05-05',
);

assert.equal(
  getShipmentOperationalDateISO(new Date('2026-05-05T15:00:00.000Z'), '17:00', AMSTERDAM_TIME_ZONE),
  '2026-05-05',
);

assert.equal(
  getShipmentOperationalDateISO(new Date('2026-05-05T15:01:00.000Z'), '17:00', AMSTERDAM_TIME_ZONE),
  '2026-05-06',
);

assert.equal(
  hasReachedCutoff(new Date('2026-05-05T14:59:00.000Z'), '17:00', AMSTERDAM_TIME_ZONE),
  false,
);

assert.equal(
  hasReachedCutoff(new Date('2026-05-05T15:00:00.000Z'), '17:00', AMSTERDAM_TIME_ZONE),
  true,
);


assert.equal(
  isWithinLocalTimeRange(new Date('2026-06-05T03:00:00.000Z'), '05:00', '19:00', AMSTERDAM_TIME_ZONE),
  true,
);

assert.equal(
  isWithinLocalTimeRange(new Date('2026-06-05T17:00:00.000Z'), '05:00', '19:00', AMSTERDAM_TIME_ZONE),
  false,
);

assert.equal(
  isWithinLocalTimeRange(new Date('2026-01-05T04:00:00.000Z'), '05:00', '19:00', AMSTERDAM_TIME_ZONE),
  true,
);

assert.equal(
  isWithinLocalTimeRange(new Date('2026-01-05T18:00:00.000Z'), '05:00', '19:00', AMSTERDAM_TIME_ZONE),
  false,
);

console.log('Amsterdam operational date tests passed.');
