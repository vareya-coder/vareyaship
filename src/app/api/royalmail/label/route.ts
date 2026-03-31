import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ShipHeroWebhook } from '@/app/utils/types';
import {
  getRoyalMailMethodConfig,
  mapShipHeroToRoyalMailCreateOrdersRequest,
} from '@/app/utils/royalmail/royalmailDataMapper';
import {
  RoyalMailCreateOrdersResponse,
  RoyalMailNormalizedLabelResponse,
  RoyalMailOrderError,
} from '@/app/utils/royalmail/types';
import { logger } from '@/utils/logger';

config();

const DEFAULT_ROYALMAIL_BASE_URL = 'https://api.parcel.royalmail.com';
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

type HttpErrorWithPayload = Error & {
  status?: number;
  payload?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    if (req.method !== 'POST') {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }

    const shipmentData: ShipHeroWebhook = await req.json();
    logger.info(JSON.stringify({ event: 'royalmail_received_request', orderId: shipmentData.order_id }));

    const methodConfig = getRoyalMailMethodConfig(shipmentData.shipping_method);
    if (!methodConfig) {
      return new NextResponse('Invalid Royal Mail shipment method.', { status: 400 });
    }

    if (!methodConfig.serviceCode) {
      return NextResponse.json(
        {
          message: 'Royal Mail service code is not configured for this shipping method.',
          shippingMethod: methodConfig.canonicalMethod,
        },
        { status: 500 },
      );
    }

    const baseUrl = process.env.ROYALMAIL_API_BASE_URL?.trim() || DEFAULT_ROYALMAIL_BASE_URL;
    const apiToken = process.env.ROYALMAIL_API_TOKEN?.trim();
    const authScheme = (process.env.ROYALMAIL_AUTH_SCHEME || 'bearer').trim().toLowerCase();

    if (!apiToken) {
      throw createHttpError(500, 'Royal Mail API token is not configured.');
    }

    const authorizationHeader = authScheme === 'raw' ? apiToken : `Bearer ${apiToken}`;
    const royalMailApi = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    const createOrdersRequest = mapShipHeroToRoyalMailCreateOrdersRequest({
      shipmentData,
      methodConfig,
    });

    const createOrdersResponse = await requestWithRetry<RoyalMailCreateOrdersResponse>(() =>
      royalMailApi.post('/api/v1/orders', createOrdersRequest),
    );

    const normalizedResponse = await normalizeCreateOrderResponse(
      createOrdersResponse.data,
      royalMailApi,
    );

    return NextResponse.json(normalizedResponse, { status: 200 });
  } catch (error: unknown) {
    return handleRoyalMailError(error);
  }
}

async function normalizeCreateOrderResponse(
  createOrdersResponse: RoyalMailCreateOrdersResponse,
  royalMailApi: ReturnType<typeof axios.create>,
): Promise<RoyalMailNormalizedLabelResponse> {
  const createdOrder = createOrdersResponse.createdOrders?.[0];
  const failedOrders = createOrdersResponse.failedOrders || [];

  if (!createdOrder) {
    if (failedOrders.length > 0) {
      throw createHttpError(400, 'Royal Mail rejected the order payload.', {
        message: 'Client Request Data Validation Failed by Royal Mail shipping provider.',
        provider: 'RoyalMail',
        errorCode: 'INPUT_VALIDATION_ERROR',
        details: failedOrders.map((failedOrder) => formatRoyalMailOrderErrors(failedOrder.errors)).join('; '),
      });
    }

    throw createHttpError(502, 'Royal Mail did not create any order.');
  }

  const orderIdentifier = createdOrder.orderIdentifier;
  if (!orderIdentifier) {
    throw createHttpError(502, 'Royal Mail response is missing order identifier.');
  }

  const trackingNumber = createdOrder.trackingNumber || createdOrder.packages?.[0]?.trackingNumber || '';
  let labelBase64 = (createdOrder.label || '').trim();

  if (!labelBase64) {
    const labelPdfBuffer = await fetchRoyalMailLabelPdf(royalMailApi, orderIdentifier);
    labelBase64 = labelPdfBuffer.toString('base64');
  }

  if (!labelBase64) {
    throw createHttpError(502, 'Royal Mail did not return a label for the created order.', {
      orderIdentifier,
      trackingNumber,
    });
  }

  return {
    orderIdentifier,
    trackingNumber,
    labelBase64,
  };
}

async function fetchRoyalMailLabelPdf(
  royalMailApi: ReturnType<typeof axios.create>,
  orderIdentifier: number,
): Promise<Buffer> {
  const labelResponse = await requestWithRetry<ArrayBuffer>(() =>
    royalMailApi.get(`/api/v1/orders/${encodeURIComponent(String(orderIdentifier))}/label`, {
      responseType: 'arraybuffer',
      params: {
        documentType: 'postageLabel',
        includeReturnsLabel: false,
        includeCN: false,
      },
      headers: {
        Accept: 'application/pdf, application/json',
      },
    }),
  );

  const contentType = String(labelResponse.headers['content-type'] || '').toLowerCase();
  const labelBuffer = Buffer.from(labelResponse.data);

  if (contentType.includes('application/json')) {
    throw createHttpError(502, 'Royal Mail label endpoint returned JSON instead of PDF.', {
      orderIdentifier,
      responseBody: labelBuffer.toString('utf8'),
    });
  }

  if (!labelBuffer.length) {
    throw createHttpError(502, 'Royal Mail label endpoint returned an empty PDF response.');
  }

  return labelBuffer;
}

async function requestWithRetry<T>(
  requestFactory: () => Promise<AxiosResponse<T>>,
  maxAttempts = RETRY_ATTEMPTS,
  baseDelayMs = RETRY_BASE_DELAY_MS,
): Promise<AxiosResponse<T>> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    try {
      return await requestFactory();
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const shouldRetry =
        !axiosError.response ||
        status === 429 ||
        (typeof status === 'number' && status >= 500);

      if (!shouldRetry || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw createHttpError(500, 'Retry logic exhausted unexpectedly.');
}

function formatRoyalMailOrderErrors(errors: RoyalMailOrderError[] | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Unknown validation error';
  }

  return errors
    .map((error) => {
      const code = error.code || error.errorCode || 'UNKNOWN';
      const message = error.message || error.errorMessage || error.details || 'Validation error';
      const fieldHint =
        error.fields && error.fields.length > 0
          ? ` (${error.fields
              .map((field) => `${field.fieldName || 'field'}=${field.value || ''}`)
              .join(', ')})`
          : '';
      return `${code}: ${message}${fieldHint}`;
    })
    .join('; ');
}

function formatValidationErrorPayload(errorData: unknown): string {
  if (!errorData) {
    return 'No details provided by Royal Mail.';
  }

  if (Array.isArray(errorData)) {
    const details = errorData.map((entry: any) => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      const code = entry.code || entry.errorCode || 'UNKNOWN';
      const message = entry.message || entry.errorMessage || entry.details || JSON.stringify(entry);
      return `${code}: ${message}`;
    });
    return details.filter(Boolean).join('; ');
  }

  if (typeof errorData === 'object') {
    const asAny = errorData as any;
    if (Array.isArray(asAny.failedOrders)) {
      return asAny.failedOrders
        .map((failedOrder: any) => formatRoyalMailOrderErrors(failedOrder?.errors || []))
        .join('; ');
    }

    if (Array.isArray(asAny.errors)) {
      return asAny.errors.map((entry: any) => entry?.message || entry?.errorMessage || JSON.stringify(entry)).join('; ');
    }

    if (asAny.message || asAny.details) {
      return `${asAny.message || 'Validation error'}${asAny.details ? `: ${asAny.details}` : ''}`;
    }
  }

  return String(errorData);
}

function handleRoyalMailError(error: unknown): NextResponse {
  const typedError = error as HttpErrorWithPayload;
  if (typedError.status) {
    if (typedError.payload) {
      return NextResponse.json(typedError.payload, { status: typedError.status });
    }
    return NextResponse.json({ message: typedError.message }, { status: typedError.status });
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;

    if (statusCode === 400) {
      return NextResponse.json(
        {
          message: 'Client Request Data Validation Failed by Royal Mail shipping provider.',
          provider: 'RoyalMail',
          errorCode: 'INPUT_VALIDATION_ERROR',
          details: formatValidationErrorPayload(errorData),
        },
        { status: 400 },
      );
    }

    if (statusCode === 401 || statusCode === 403) {
      return NextResponse.json(
        {
          message: 'Internal configuration error with Royal Mail shipping provider authorization.',
        },
        { status: 500 },
      );
    }

    if (statusCode === 429) {
      return NextResponse.json(
        {
          message: 'Royal Mail API rate limit exceeded.',
          provider: 'RoyalMail',
        },
        { status: 429 },
      );
    }

    if (statusCode && statusCode >= 500) {
      return NextResponse.json(
        {
          message: 'External shipping provider service error (Royal Mail).',
          details: 'The upstream service reported a server failure. Please try again later.',
        },
        { status: 502 },
      );
    }
  }

  const fallbackError = error as Error;
  logger.error('Error processing Royal Mail label request:', fallbackError.message);
  return NextResponse.json(
    {
      message: 'An unexpected error occurred during Royal Mail label generation.',
      details: fallbackError.message || 'Unknown error',
    },
    { status: 500 },
  );
}

function createHttpError(status: number, message: string, payload?: unknown): HttpErrorWithPayload {
  const error = new Error(message) as HttpErrorWithPayload;
  error.status = status;
  error.payload = payload;
  return error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
