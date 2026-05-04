import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shipments } from '@/lib/db/schema';
import { hasUiSession, unauthorizedResponse } from '@/modules/auth/uiSession';
import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import {
  listActiveAsendiaCustomerMappingsByCrmId,
  listManifestUiBatchesForDate,
} from '@/modules/manifesting/manifestUi.repository';
import { logError } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function mapShipment(row: any, clientName?: string | null) {
  return {
    id: row.id,
    externalShipmentId: row.external_shipment_id ?? null,
    orderId: row.order_id ?? null,
    accountId: row.account_id ?? null,
    crmId: row.crm_id ?? null,
    clientName: clientName ?? null,
    senderTaxCode: row.sender_tax_code ?? null,
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

export async function GET(req: NextRequest) {
  if (!hasUiSession(req)) {
    return unauthorizedResponse();
  }

  try {
    const query = (req.nextUrl.searchParams.get('query') ?? '').trim();
    const selectedDate = req.nextUrl.searchParams.get('date');
    const batchIdFilterRaw = req.nextUrl.searchParams.get('batchId');
    const batchIdFilter = batchIdFilterRaw && batchIdFilterRaw !== 'all'
      ? Number.parseInt(batchIdFilterRaw, 10)
      : null;
    const crmIdFilter = req.nextUrl.searchParams.get('crmId');
    const limitParam = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
    const conditions: any[] = [];

    if (selectedDate) {
      const flags = getFlags();
      const dayBatches = await listManifestUiBatchesForDate(selectedDate, flags.cutoff_timezone);
      const batchIdsForDate = (dayBatches as any[])
        .filter((batch) => !batchIdFilter || batch.batch_id === batchIdFilter)
        .filter((batch) => !crmIdFilter || crmIdFilter === 'all' || batch.crm_id === crmIdFilter)
        .map((batch) => batch.batch_id)
        .filter((batchId): batchId is number => typeof batchId === 'number');

      if (batchIdsForDate.length === 0) {
        return NextResponse.json({
          query,
          shipments: [],
          refreshedAt: new Date().toISOString(),
        });
      }

      conditions.push(inArray(shipments.batch_id, batchIdsForDate));
    } else if (batchIdFilter) {
      conditions.push(eq(shipments.batch_id, batchIdFilter));
    }

    if (crmIdFilter && crmIdFilter !== 'all') {
      conditions.push(eq(shipments.crm_id, crmIdFilter));
    }

    if (query) {
      const term = `%${query}%`;
      const orderId = Number.parseInt(query, 10);
      const searchConditions = [
        ilike(shipments.parcel_id, term),
        ilike(shipments.tracking_number, term),
        ilike(shipments.external_shipment_id, term),
        ilike(shipments.manifest_id, term),
      ];

      if (Number.isFinite(orderId)) {
        searchConditions.push(eq(shipments.order_id, orderId));
      }
      conditions.push(or(...searchConditions));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(shipments)
      .where(whereClause)
      .orderBy(desc(shipments.created_at), desc(shipments.id))
      .limit(limit);
    const customerMap = await listActiveAsendiaCustomerMappingsByCrmId();

    return NextResponse.json({
      query,
      shipments: rows.map((row: any) => mapShipment(
        row,
        row.crm_id ? customerMap.get(row.crm_id)?.customer_name ?? null : null,
      )),
      refreshedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logError('shipment_inspector_api_failed', {
      error: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ message: 'Failed to load shipments' }, { status: 500 });
  }
}
