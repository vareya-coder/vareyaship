import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  asendiaCustomerMappings,
  batches,
  shipments,
} from '@/lib/db/schema';

export async function listManifestUiBatchesForDate(selectedDate: string, timeZone: string) {
  const directRows = await db
    .select()
    .from(batches)
    .where(or(
      eq(batches.operational_date, selectedDate as any),
      sql`DATE(${batches.created_at} AT TIME ZONE ${timeZone}) = ${selectedDate}`,
    ))
    .orderBy(desc(batches.created_at), desc(batches.batch_id));

  const shipmentBatchRefs = await db
    .select({ batchId: shipments.batch_id })
    .from(shipments)
    .where(and(
      isNotNull(shipments.batch_id),
      sql`DATE(${shipments.created_at} AT TIME ZONE ${timeZone}) = ${selectedDate}`,
    ));

  const batchIdsFromShipments = Array.from(new Set(
    shipmentBatchRefs
      .map((row) => row.batchId)
      .filter((batchId): batchId is number => typeof batchId === 'number'),
  ));

  const shipmentBatchRows = batchIdsFromShipments.length > 0
    ? await db
      .select()
      .from(batches)
      .where(inArray(batches.batch_id, batchIdsFromShipments))
    : [];

  const byId = new Map<number, any>();
  for (const batch of [...directRows, ...shipmentBatchRows] as any[]) {
    byId.set(batch.batch_id, batch);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return (right.batch_id ?? 0) - (left.batch_id ?? 0);
  });
}

export async function listActiveAsendiaCustomerMappingsByCrmId() {
  const mappings = await db
    .select()
    .from(asendiaCustomerMappings)
    .where(eq(asendiaCustomerMappings.is_active, true));

  return new Map(
    (mappings as any[])
      .filter((mapping) => !!mapping.crm_id)
      .map((mapping) => [mapping.crm_id as string, mapping]),
  );
}

