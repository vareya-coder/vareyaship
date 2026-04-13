import { db } from '@/lib/db';
import { shipments } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function findShipmentByExternalId(externalId: string) {
  const rows = await db.select().from(shipments).where(eq(shipments.external_shipment_id, externalId));
  return rows[0] ?? null;
}

export async function insertShipment(row: any) {
  const res = await db.insert(shipments).values(row).returning({ id: shipments.id });
  return res[0];
}

export async function setShipmentBatch(shipmentId: number, batchId: number) {
  await db.update(shipments).set({ batch_id: batchId }).where(eq(shipments.id, shipmentId));
}

export async function markShipmentsManifestedByParcelIds(parcelIds: string[]) {
  if (parcelIds.length === 0) return;
  await db.update(shipments).set({ is_manifested: true }).where(inArray(shipments.parcel_id, parcelIds));
}

export async function listUnmanifestedParcelIdsForBatch(batchId: number): Promise<string[]> {
  const rows = await db.select({ pid: shipments.parcel_id }).from(shipments).where(eq(shipments.batch_id, batchId));
  return rows.map((r) => r.pid as unknown as string);
}
