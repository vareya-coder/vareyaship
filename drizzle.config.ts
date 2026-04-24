import { Config } from "drizzle-kit";
import * as dotenv from 'dotenv';
import path from "path";

dotenv.config(
    {path : '.env',}
)

export default {
    driver :"pg",
    schema : "./src/lib/db/schema.ts",
    out: "./drizzle",
    dbCredentials :{
        connectionString :process.env.VAREYASHIP_DATABASE_DATABASE_URL as string,
    },

} satisfies Config