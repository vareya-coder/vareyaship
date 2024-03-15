import {neon , neonConfig} from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { logger } from '@/utils/logger';

logger.info(process.env.DATABASE_URL!);
const sql = neon(process.env.DATABASE_URL!) 

export const db =drizzle(sql)

