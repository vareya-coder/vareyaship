import { logEvent } from '@/modules/logging/events';
import { sendResendEmail } from './resendEmail';

type ManifestNotificationInput = {
  kind: 'partial_failure' | 'verification_mismatch';
  batchId: number;
  manifestId: string;
  occurredAt?: Date;
  failedParcelIds?: string[];
  documentUrl?: string;
};

type ManifestDryRunSummaryInput = {
  operationalDate: string;
  occurredAt?: Date;
  reason: string;
  totals: {
    batchCount: number;
    shipmentCount: number;
    manifestedShipmentCount: number;
    pendingShipmentCount: number;
    openBatchCount: number;
    closingBatchCount: number;
    manifestedBatchCount: number;
    eligibleBatchCount: number;
  };
  batches: Array<{
    batchId: number;
    status: string | null;
    crmId: string | null;
    groupingKey: string | null;
    shipmentCountStored: number;
    shipmentCountActual: number;
    manifestedShipmentCount: number;
    pendingShipmentCount: number;
    eligibleToCloseNow: boolean;
  }>;
};

function getManifestNotificationConfig() {
  return {
    to: process.env.MANIFEST_NOTIFICATION_EMAIL_TO ?? process.env.NOTIFY_EMAIL_TO,
    from: process.env.MANIFEST_NOTIFICATION_EMAIL_FROM ?? process.env.NOTIFY_EMAIL_FROM,
    timeZone: process.env.MANIFEST_NOTIFICATION_TIMEZONE || 'Europe/Amsterdam',
  };
}

function formatManifestTimestamp(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildManifestNotificationContent(input: ManifestNotificationInput, formattedTimestamp: string) {
  if (input.kind === 'partial_failure') {
    const failedParcelIds = input.failedParcelIds && input.failedParcelIds.length > 0
      ? input.failedParcelIds.join(', ')
      : 'None provided';
    const subject = `Manifest partial failure | ${formattedTimestamp} | batch ${input.batchId} | manifest ${input.manifestId}`;
    const html = [
      `<p>Manifest partial failure detected.</p>`,
      `<p><strong>Date/time:</strong> ${escapeHtml(formattedTimestamp)}</p>`,
      `<p><strong>Batch ID:</strong> ${input.batchId}</p>`,
      `<p><strong>Manifest ID:</strong> ${escapeHtml(input.manifestId)}</p>`,
      `<p><strong>Failed parcel IDs:</strong> ${escapeHtml(failedParcelIds)}</p>`,
      input.documentUrl
        ? `<p><strong>Manifest document:</strong> <a href="${escapeHtml(input.documentUrl)}">${escapeHtml(input.documentUrl)}</a></p>`
        : `<p><strong>Manifest document:</strong> not available</p>`,
    ].join('');
    return { subject, html };
  }

  const subject = `Manifest verification mismatch | ${formattedTimestamp} | batch ${input.batchId} | manifest ${input.manifestId}`;
  const html = [
    `<p>Manifest verification mismatch detected.</p>`,
    `<p><strong>Date/time:</strong> ${escapeHtml(formattedTimestamp)}</p>`,
    `<p><strong>Batch ID:</strong> ${input.batchId}</p>`,
    `<p><strong>Manifest ID:</strong> ${escapeHtml(input.manifestId)}</p>`,
    input.documentUrl
      ? `<p><strong>Manifest document:</strong> <a href="${escapeHtml(input.documentUrl)}">${escapeHtml(input.documentUrl)}</a></p>`
      : `<p><strong>Manifest document:</strong> not available</p>`,
  ].join('');
  return { subject, html };
}

export async function notifyManifestIssue(input: ManifestNotificationInput) {
  const { to, from, timeZone } = getManifestNotificationConfig();
  const occurredAt = input.occurredAt ?? new Date();
  const formattedTimestamp = formatManifestTimestamp(occurredAt, timeZone);
  const { subject, html } = buildManifestNotificationContent(input, formattedTimestamp);

  try {
    const id = await sendResendEmail({ subject, html, to: to || undefined, from: from || undefined });
    console.info('Manifest issue notification sent', {
      kind: input.kind,
      batchId: input.batchId,
      manifestId: input.manifestId,
      to: to || 'default',
      from: from || 'default',
      id: id ?? null,
    });
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'sent', id });
  } catch (e: any) {
    console.error('Manifest issue notification failed', {
      kind: input.kind,
      batchId: input.batchId,
      manifestId: input.manifestId,
      to: to || 'default',
      from: from || 'default',
      error: e?.message ?? 'unknown',
    });
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'error', errorMessage: e?.message });
  }
}

export async function notifyManifestDryRunSummary(input: ManifestDryRunSummaryInput) {
  const { to, from, timeZone } = getManifestNotificationConfig();
  const occurredAt = input.occurredAt ?? new Date();
  const formattedTimestamp = formatManifestTimestamp(occurredAt, timeZone);
  const subject = `Manifest dry run summary | ${formattedTimestamp} | ${input.operationalDate}`;
  const rows = input.batches.map((batch) => [
    `<tr>`,
    `<td>${batch.batchId}</td>`,
    `<td>${escapeHtml(batch.status ?? '')}</td>`,
    `<td>${escapeHtml(batch.crmId ?? '')}</td>`,
    `<td>${escapeHtml(batch.groupingKey ?? '')}</td>`,
    `<td>${batch.shipmentCountStored}</td>`,
    `<td>${batch.shipmentCountActual}</td>`,
    `<td>${batch.manifestedShipmentCount}</td>`,
    `<td>${batch.pendingShipmentCount}</td>`,
    `<td>${batch.eligibleToCloseNow ? 'yes' : 'no'}</td>`,
    `</tr>`,
  ].join('')).join('');

  const html = [
    `<p>Manifest trigger dry run summary generated from database state.</p>`,
    `<p><strong>Date/time:</strong> ${escapeHtml(formattedTimestamp)}</p>`,
    `<p><strong>Operational date:</strong> ${escapeHtml(input.operationalDate)}</p>`,
    `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>`,
    `<p><strong>Totals:</strong> batches=${input.totals.batchCount}, shipments=${input.totals.shipmentCount}, manifested shipments=${input.totals.manifestedShipmentCount}, pending shipments=${input.totals.pendingShipmentCount}, eligible batches=${input.totals.eligibleBatchCount}</p>`,
    `<table border="1" cellpadding="6" cellspacing="0">`,
    `<thead><tr><th>Batch</th><th>Status</th><th>CRM</th><th>Grouping</th><th>Stored</th><th>Actual</th><th>Manifested</th><th>Pending</th><th>Eligible now</th></tr></thead>`,
    `<tbody>${rows || '<tr><td colspan="9">No batches found</td></tr>'}</tbody>`,
    `</table>`,
  ].join('');

  try {
    const id = await sendResendEmail({ subject, html, to: to || undefined, from: from || undefined });
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'sent', id });
  } catch (e: any) {
    console.error('Manifest dry run summary notification failed', {
      operationalDate: input.operationalDate,
      to: to || 'default',
      from: from || 'default',
      error: e?.message ?? 'unknown',
    });
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'error', errorMessage: e?.message });
  }
}
