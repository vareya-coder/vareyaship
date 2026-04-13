import { logEvent } from '@/modules/logging/events';
import { sendResendEmail } from './resendEmail';

export async function notify(subject: string, body: string) {
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM;

  try {
    const id = await sendResendEmail({ subject, html: body, to: to || undefined, from: from || undefined });
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'sent', id });
  } catch (e: any) {
    logEvent({ event: 'notification_enqueued', subject, to: to || 'default', from: from || 'default', status: 'error', errorMessage: e?.message });
  }
}
