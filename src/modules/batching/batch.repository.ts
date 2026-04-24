import { db } from '@/lib/db';
import { batches, shipments } from '@/lib/db/schema';
import { and, eq, sql, desc, isNull } from 'drizzle-orm';
import type { BatchStatus } from './batch.types';

export async function findBatchById(batchId: number) {
  const rows = await db.select().from(batches).where(eq(batches.batch_id, batchId));
  return rows[0] ?? null;
}

export async function findOpenBatch(groupingKey: string | null, operationalDateISO: string) {
  const rows = await db
    .select()
    .from(batches)
    .where(and(
      eq(batches.status, 'OPEN'),
      eq(batches.operational_date, operationalDateISO as any),
      groupingKey ? eq(batches.grouping_key, groupingKey) : sql`1=1`
    ))
    .orderBy(desc(batches.created_at));
  return rows[0] ?? null;
}

export async function createBatch(params: {
  groupingKey: string | null;
  operationalDateISO: string;
}): Promise<any> {
  const res = await db.insert(batches).values({
    grouping_key: params.groupingKey ?? null,
    operational_date: params.operationalDateISO as any,
    status: 'OPEN',
    shipment_count: 0,
  }).returning({ batch_id: batches.batch_id });
  return res[0];
}

export async function incrementBatchShipmentCount(batchId: number) {
  await db.execute(sql`UPDATE ${batches} SET shipment_count = shipment_count + 1 WHERE ${batches.batch_id} = ${batchId}`);
}

export async function setBatchStatusGuarded(batchId: number, fromStatus: BatchStatus, toStatus: BatchStatus) {
  await db.update(batches)
    .set({ status: toStatus, closing_at: toStatus === 'CLOSING' ? new Date() : null })
    .where(and(eq(batches.batch_id, batchId), eq(batches.status, fromStatus)));
}

export async function listOpenBatches() {
  const rows = await db.select().from(batches).where(eq(batches.status, 'OPEN'));
  return rows;
}

export async function listBatchShipments(batchId: number) {
  return db.select().from(shipments).where(eq(shipments.batch_id, batchId));
}

export async function getBatchShipments(batchId: number) {
  const rows = await db.select().from(shipments).where(and(eq(shipments.batch_id, batchId), eq(shipments.is_manifested, false)));
  return rows;
}

export async function findLatestOpenBatchAnyDate(groupingKey: string | null) {
  const rows = await db
    .select()
    .from(batches)
    .where(and(
      eq(batches.status, 'OPEN'),
      groupingKey ? eq(batches.grouping_key, groupingKey) : sql`1=1`
    ))
    .orderBy(desc(batches.created_at));
  return rows[0] ?? null;
}
