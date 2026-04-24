type ResendSendResponse = {
  id?: string;
};

type ResendApiResponse = {
  data?: ResendSendResponse;
  error?: { message?: string };
  id?: string;
};

export async function sendResendEmail(input: {
  subject: string;
  html: string;
  to?: string | string[];
  from?: string;
}): Promise<string | undefined> {
  const apiKey = process.env.RESEND_API_KEY;
  const endpoint = process.env.RESEND_API_ENDPOINT || 'https://api.resend.com/emails';

  if (!apiKey) throw new Error('Missing RESEND_API_KEY');

  const to = Array.isArray(input.to)
    ? input.to
    : (input.to ? [input.to] : ['operations@vareya.nl']);
  const from = input.from || 'Vareya Operations <operations@vareya.nl>';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject: input.subject, html: input.html }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendApiResponse;
  if (!response.ok) {
    const message = payload.error?.message || JSON.stringify(payload);
    throw new Error(`Resend request failed (${response.status}): ${message}`);
  }

  return payload.data?.id ?? payload.id;
}
