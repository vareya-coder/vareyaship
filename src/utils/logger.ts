// import pino from 'pino';

// export const logger = pino(
//   { level: 'info' },
//   pino.transport({
//     target: '@axiomhq/pino',
//     options: {
//       dataset: process.env.AXIOM_DATASET,
//       token: process.env.AXIOM_TOKEN,
//       orgId: process.env.AXIOM_ORGANIZATION,
//     },
//   }),
// );

import winston from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/winston';

const skipMirroredConsole = winston.format((info) => {
  if ((info as any).mirroredFromConsole) {
    return false;
  }
  return info;
});

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        skipMirroredConsole(),
        winston.format.json(),
      ),
    }),
    // You can pass an option here, if you don't the transport is configured automatically
    // using environment variables like `AXIOM_DATASET` and `AXIOM_TOKEN`
    new AxiomTransport({
      dataset: process.env.AXIOM_DATASET!,
      token: process.env.AXIOM_TOKEN!,
      orgId: process.env.AXIOM_ORGANIZATION!,
    }),
  ],
});

logger.on('finish', function (info: any) {
  // All `info` log messages has now been logged
});

logger.on('error', function (err: any) { 
  // Do Something  
});

type MirrorMeta = Record<string, unknown> | undefined;

function writeConsole(level: 'info' | 'warn' | 'error', message: string, meta?: MirrorMeta) {
  if (level === 'error') {
    console.error(message, meta ?? {});
    return;
  }
  if (level === 'warn') {
    console.warn(message, meta ?? {});
    return;
  }
  console.log(message, meta ?? {});
}

export function mirrorLog(level: 'info' | 'warn' | 'error', message: string, meta?: MirrorMeta) {
  writeConsole(level, message, meta);
  logger.log({
    level,
    message,
    mirroredFromConsole: true,
    ...(meta ?? {}),
  } as any);
}

export function logInfo(message: string, meta?: MirrorMeta) {
  mirrorLog('info', message, meta);
}

export function logWarn(message: string, meta?: MirrorMeta) {
  mirrorLog('warn', message, meta);
}

export function logError(message: string, meta?: MirrorMeta) {
  mirrorLog('error', message, meta);
}
