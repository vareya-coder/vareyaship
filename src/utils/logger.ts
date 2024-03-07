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

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
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