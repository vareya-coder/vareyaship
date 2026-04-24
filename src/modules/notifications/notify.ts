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
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'sent', id });
  } catch (e: any) {
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'error', errorMessage: e?.message });
  }
}
