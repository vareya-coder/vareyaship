import { db } from '@/lib/db';
import { batches, shipments } from '@/lib/db/schema';
import { and, eq, sql, desc, isNull, lte } from 'drizzle-orm';
import type { BatchStatus } from './batch.types';

export async function findBatchById(batchId: number) {
  const rows = await db.select().from(batches).where(eq(batches.batch_id, batchId));
  return rows[0] ?? null;
}

export async function findOpenBatch(groupingKey: string | null, operationalDateISO: string, crmId?: string | null) {
  const rows = await db
    .select()
    .from(batches)
    .where(and(
      eq(batches.status, 'OPEN'),
      eq(batches.operational_date, operationalDateISO as any),
      groupingKey ? eq(batches.grouping_key, groupingKey) : isNull(batches.grouping_key),
      crmId ? eq(batches.crm_id, crmId) : isNull(batches.crm_id),
    ))
    .orderBy(desc(batches.created_at));
  return rows[0] ?? null;
}

export async function createBatch(params: {
  groupingKey: string | null;
  operationalDateISO: string;
  crmId?: string | null;
}): Promise<any> {
  const res = await db.insert(batches).values({
    grouping_key: params.groupingKey ?? null,
    operational_date: params.operationalDateISO as any,
    status: 'OPEN',
    crm_id: params.crmId ?? null,
    shipment_count: 0,
  }).returning({ batch_id: batches.batch_id });
  return res[0];
}

export async function incrementBatchShipmentCount(batchId: number) {
  await db.execute(sql`UPDATE ${batches} SET shipment_count = shipment_count + 1 WHERE ${batches.batch_id} = ${batchId}`);
}

export async function setBatchStatusGuarded(batchId: number, fromStatus: BatchStatus, toStatus: BatchStatus) {
  const data = toStatus === 'CLOSING'
    ? { status: toStatus, closing_at: new Date() }
    : { status: toStatus };

  await db.update(batches)
    .set(data)
    .where(and(eq(batches.batch_id, batchId), eq(batches.status, fromStatus)));
}

export async function listOpenBatches() {
  const rows = await db.select().from(batches).where(eq(batches.status, 'OPEN'));
  return rows;
}

export async function listClosingBatchesDueThrough(operationalDateISO: string) {
  return db
    .select()
    .from(batches)
    .where(and(
      eq(batches.status, 'CLOSING'),
      lte(batches.operational_date, operationalDateISO as any),
    ))
    .orderBy(desc(batches.created_at), desc(batches.batch_id));
}

export async function listBatchesForOperationalDate(operationalDateISO: string) {
  return db
    .select()
    .from(batches)
    .where(eq(batches.operational_date, operationalDateISO as any))
    .orderBy(desc(batches.created_at), desc(batches.batch_id));
}

export async function listBatchShipments(batchId: number) {
  return db.select().from(shipments).where(eq(shipments.batch_id, batchId));
}

export async function getBatchShipments(batchId: number) {
  const rows = await db.select().from(shipments).where(and(eq(shipments.batch_id, batchId), eq(shipments.is_manifested, false)));
  return rows;
}
