import { db } from '@/lib/db';
import { shipments } from '@/lib/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';

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

export async function markShipmentsManifestedByParcelIds(parcelIds: string[], manifestId?: string | null) {
  if (parcelIds.length === 0) return;
  await db.update(shipments).set({
    is_manifested: true,
    manifest_id: manifestId ?? null,
  }).where(inArray(shipments.parcel_id, parcelIds));
}

export async function setManifestInfoForParcelIds(params: {
  parcelIds: string[];
  manifestId: string;
  isManifested?: boolean;
}) {
  if (params.parcelIds.length === 0) return;
  await db.update(shipments).set({
    manifest_id: params.manifestId,
    is_manifested: params.isManifested ?? true,
  }).where(inArray(shipments.parcel_id, params.parcelIds));
}

export async function listUnmanifestedParcelIdsForBatch(batchId: number): Promise<string[]> {
  const rows = await db.select({ pid: shipments.parcel_id }).from(shipments).where(eq(shipments.batch_id, batchId));
  return rows.map((r) => r.pid as unknown as string);
}

export async function listRecentShipments(limit = 100) {
  return db
    .select()
    .from(shipments)
    .orderBy(desc(shipments.created_at), desc(shipments.id))
    .limit(limit);
}
