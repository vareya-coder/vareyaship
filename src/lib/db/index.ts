import {neon , neonConfig} from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

const sql = neon(process.env.VAREYASHIP_DATABASE_DATABASE_URL!) 

export const db =drizzle(sql)

