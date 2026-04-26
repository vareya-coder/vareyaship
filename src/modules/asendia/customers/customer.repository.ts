import { db } from '@/lib/db';
import { asendiaCustomerMappings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function findActiveAsendiaCustomerMappingByAccountId(accountId: number) {
  const rows = await db
    .select()
    .from(asendiaCustomerMappings)
    .where(and(
      eq(asendiaCustomerMappings.account_id, accountId),
      eq(asendiaCustomerMappings.is_active, true),
    ));

  return rows[0] ?? null;
}
