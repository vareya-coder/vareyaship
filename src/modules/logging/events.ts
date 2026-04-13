import { logger } from '@/utils/logger';

type EventPayload = {
  event: string;
  batch_id?: number | string | null;
  shipment_id?: number | string | null;
  manifest_id?: string | null;
  status?: string | null;
  timestamp?: string;
  [k: string]: any;
};

export function logEvent(payload: EventPayload) {
  const body = {
    timestamp: new Date().toISOString(),
    ...payload,
  } as any;
  const level = payload.event?.includes('failed') ? 'error' : payload.event?.includes('warn') ? 'warn' : 'info';
  logger.log({ level, message: payload.event, ...body });
}

