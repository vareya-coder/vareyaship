import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { vacierTurkeyCustomsOverrides } from '@/lib/db/schema';

export type VacierTurkeyCustomsOverrideRow = typeof vacierTurkeyCustomsOverrides.$inferSelect;

export async function listActiveVacierTurkeyCustomsOverrides(): Promise<VacierTurkeyCustomsOverrideRow[]> {
  return db
    .select()
    .from(vacierTurkeyCustomsOverrides)
    .where(eq(vacierTurkeyCustomsOverrides.isActive, true))
    .orderBy(asc(vacierTurkeyCustomsOverrides.sku));
}
