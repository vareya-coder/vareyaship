import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { batches, manifests, shipments } from '@/lib/db/schema';
import { hasUiSession, unauthorizedResponse } from '@/modules/auth/uiSession';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mapManifest(row: any) {
  const expected = row.parcel_count_expected ?? 0;
  const actual = row.parcel_count_actual ?? 0;

  return {
    manifestId: row.manifest_id,
    batchId: row.batch_id ?? null,
    status: row.status ?? null,
    parcelCountExpected: expected,
    parcelCountActual: row.parcel_count_actual ?? null,
    verificationStatus: row.verification_status ?? null,
    documentUrl: row.document_url ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    countDelta: row.parcel_count_actual === null || row.parcel_count_actual === undefined
      ? null
      : expected - actual,
  };
}

function mapShipment(row: any) {
  return {
    id: row.id,
    externalShipmentId: row.external_shipment_id ?? null,
    orderId: row.order_id ?? null,
    accountId: row.account_id ?? null,
    crmId: row.crm_id ?? null,
    shippingMethod: row.shipping_method ?? null,
    parcelId: row.parcel_id,
    trackingNumber: row.tracking_number ?? null,
    labelUrl: row.label_url ?? null,
    batchId: row.batch_id ?? null,
    manifestId: row.manifest_id ?? null,
    isManifested: row.is_manifested === true,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { manifestId: string } },
) {
  if (!hasUiSession(_req)) {
    return unauthorizedResponse();
  }

  const manifestId = decodeURIComponent(params.manifestId);

  try {
    const manifestRows = await db
      .select()
      .from(manifests)
      .where(eq(manifests.manifest_id, manifestId));
    const manifest = manifestRows[0] ?? null;

    if (!manifest) {
      return NextResponse.json({ message: 'Manifest not found' }, { status: 404 });
    }

    const manifestShipments = await db
      .select()
      .from(shipments)
      .where(eq(shipments.manifest_id, manifestId))
      .orderBy(desc(shipments.created_at), desc(shipments.id));

    const batchId = (manifest as any).batch_id ?? null;
    const batchRows = batchId
      ? await db.select().from(batches).where(eq(batches.batch_id, batchId))
      : [];
    const batch = batchRows[0] ?? null;

    const batchShipments = batchId
      ? await db
        .select()
        .from(shipments)
        .where(eq(shipments.batch_id, batchId))
        .orderBy(desc(shipments.created_at), desc(shipments.id))
      : [];

    const manifestParcelIdSet = new Set(
      manifestShipments
        .map((shipment: any) => shipment.parcel_id)
        .filter((parcelId: string | null): parcelId is string => !!parcelId),
    );
    const atRiskParcelIds = (batchShipments as any[])
      .filter((shipment) => !manifestParcelIdSet.has(shipment.parcel_id))
      .map((shipment) => shipment.parcel_id)
      .filter((parcelId): parcelId is string => !!parcelId);

    return NextResponse.json({
      manifest: mapManifest(manifest),
      batch: batch ? {
        batchId: (batch as any).batch_id,
        groupingKey: (batch as any).grouping_key ?? null,
        crmId: (batch as any).crm_id ?? null,
        status: (batch as any).status ?? null,
        operationalDate: (batch as any).operational_date?.toString() ?? null,
        shipmentCountStored: (batch as any).shipment_count ?? 0,
        createdAt: (batch as any).created_at ? new Date((batch as any).created_at).toISOString() : null,
        closingAt: (batch as any).closing_at ? new Date((batch as any).closing_at).toISOString() : null,
      } : null,
      parcels: manifestShipments.map(mapShipment),
      atRiskParcelIds,
      expectedBatchParcelIds: (batchShipments as any[])
        .map((shipment) => shipment.parcel_id)
        .filter((parcelId): parcelId is string => !!parcelId),
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logError('manifest_detail_api_failed', {
      manifest_id: manifestId,
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to load manifest detail' }, { status: 500 });
  }
}
