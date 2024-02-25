import {neon , neonConfig} from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

//neonConfig.fetchConnectionCache = true
// if(!process.env.DATABASE_URL){
//     throw new Error(" Database URL not found")
// }

const sql = neon("postgresql://syedhasnain769:ksdEp3uAx9Oe@ep-weathered-forest-a509tbmy.us-east-2.aws.neon.tech/vareyaship?sslmode=require") 

export const db =drizzle(sql)
console.log(db)
