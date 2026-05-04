import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { mapShipHeroToAsendia } from '@/app/utils/asendia/asendiaSyncDataMapper';
import { ShipHeroWebhook, AsendiaAuthRequest, AsendiaAuthResponse, AsendiaParcelRequest, AsendiaParcelResponse } from '@/app/utils/types';
import { getRequiredAsendiaCustomerMapping } from '@/modules/asendia/customers/customer.service';

import { Data } from '@/app/utils/postnl/postnltypes';
import { logError, logInfo, logger } from '@/utils/logger';

config();

export async function POST(req: NextRequest) {
  try {
    if (req.method === 'POST') {
      const shipmentData: ShipHeroWebhook = await req.json();
      logger.info(JSON.stringify(shipmentData));
      let customerMapping;

      try {
        customerMapping = await getRequiredAsendiaCustomerMapping(shipmentData.account_id);
      } catch (error: any) {
        logger.error('Missing Asendia customer mapping', {
          account_id: shipmentData.account_id,
          error: error?.message,
        });

        return new NextResponse(JSON.stringify({
          message: error?.message ?? 'Missing Asendia customer mapping.',
          provider: 'Asendia',
          errorCode: 'CUSTOMER_MAPPING_MISSING',
          accountId: shipmentData.account_id,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

  ///////
      const username = process.env.ASENDIA_SYNC_USERNAME;
      const password = process.env.ASENDIA_SYNC_PASSWORD;
  
      if (!username || !password) {
          throw new Error("Asendia API credentials are not defined in environment variables.");
      }
  
      // Create a configured Axios instance for Asendia API
      const asendiaApi = axios.create({
          baseURL: process.env.ASENDIA_API_BASE_URL, // e.g., 'https://api.asendia.com'
          headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
          }
      });

      // --- Step 1: Authenticate and get Access Token ---
      let id_token: string;
      try {

        logInfo('Authenticating with Asendia...');
        const authRequest: AsendiaAuthRequest = { username, password };
        const authResponse = await asendiaApi.post<AsendiaAuthResponse>('/api/authenticate', authRequest);
        id_token = authResponse.data.id_token;
        logInfo('Authentication successful.');
      } catch (error: any) {
        logError('Error during Asendia authentication.', { error: error.response?.data || error.message });
        throw new Error("Asendia authentication failed.");
      }
  
      // --- Step 2: Map data and create the parcel ---
      const asendiaRequestBody:AsendiaParcelRequest = mapShipHeroToAsendia(shipmentData, customerMapping);
  
      try {
        logInfo('Creating Asendia parcel with request.', {
          request: JSON.stringify(asendiaRequestBody, null, 2),
        });
        const parcelResponse = await asendiaApi.post<AsendiaParcelResponse>('/api/parcels', asendiaRequestBody, {
            headers: {
                'Authorization': `Bearer ${id_token}`
            }
        });
  
        logInfo('Successfully received response from Asendia.', {
          response: parcelResponse.data,
        });
        // return parcelResponse.data;

        return new NextResponse(JSON.stringify(
          {
            parcelId: parcelResponse.data.id,
            trackingNumber: parcelResponse.data.trackingNumber,
            labelLocation: parcelResponse.data.labelLocation,
            id_token: id_token,
            crmId: customerMapping.crmId,
            senderTaxCode: customerMapping.senderTaxCode,
          }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }); 
      } catch (error: any) {
        const upstreamStatus = error.response?.status;
        const errorData = error.response?.data;
        
        // 1. Always log the full upstream error for debugging purposes
        logError('Error creating Asendia parcel.', {
          error: JSON.stringify(errorData || error.message),
        });
        
        // Case A: External API returned 400 Bad Request (Validation Failure)
        if (upstreamStatus === 400) {
            // Expanded error parsing for new Asendia formats
            const parsed = parseAsendiaErrorComponents(errorData);
            logger.error("Parsed Asendia 400 error details:", parsed.summary);
            logger.error("Asendia 400 error components:", parsed);

            // Return 400 to the client with meaningful details
            return new NextResponse(JSON.stringify({
                message: "Client Request Data Validation Failed by Asendia Shipping Provider.",
                details: parsed.summary,
                provider: "Asendia",
                errorCode: "INPUT_VALIDATION_ERROR",
                title: parsed.title,
                id: parsed.id,
                errors: parsed.errors?.length ? parsed.errors : undefined,
                fieldErrors: parsed.fieldErrors?.length ? parsed.fieldErrors : undefined,
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Case B: External API returned 401/403 (Authentication/Authorization)
        // This usually implies an expired/bad internal token setup, so treat it as a server issue.
        if (upstreamStatus === 401 || upstreamStatus === 403) {
            logger.error(`Asendia API Authorization failure. Check id_token setup.`);
            // Treat this as a server side configuration issue (500)
            return new NextResponse(JSON.stringify({
                message: "Internal configuration error with Asendia shipping provider authorization.",
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Case C: External API returned 5xx (Server Failure on their end)
        if (upstreamStatus >= 500) {
            logError(`Asendia API server error with status ${upstreamStatus}.`, { upstreamStatus });
            // Respond with 502 Bad Gateway, indicating the upstream service is failing
            return new NextResponse(JSON.stringify({
                message: "External shipping provider service error (Asendia).",
                details: "The upstream service reported a server failure. Please try again later.",
            }), {
                status: 502, // Bad Gateway
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Case D: Default Fallback (Unexpected/Unhandled Error)
        // For network issues, timeouts, or unknown exceptions.
        return new NextResponse(JSON.stringify({
            message: "An unexpected error occurred during Asendia parcel creation.",
            details: "Check internal logs for specific error details.",
        }), {
            status: 500, // Internal Server Error
            headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }
  } catch (error) {
    logError('Error processing the shipment update.', { error });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

/**
 * Helper function to parse Asendia's varied error payloads (400 Bad Request)
 * into a single readable string.
 */
const stripHtml = (s: string): string => (s || '').replace(/<[^>]*>/g, '');

const extractTrailingJsonArray = (s: string): any[] | null => {
  try {
    if (!s) return null;
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const slice = s.substring(start, end + 1);
      return JSON.parse(slice);
    }
  } catch {}
  return null;
};

const formatAsendiaErrors = (errorData: any): string => {
  const parsed = parseAsendiaErrorComponents(errorData);
  if (parsed.summary && parsed.summary.trim() !== '') return parsed.summary;
  return errorData?.message || 'Input validation failed due to an unspecified constraint.';
};

function parseAsendiaErrorComponents(errorData: any): {
  title?: string;
  id?: string;
  summary: string;
  errors?: string[];
  fieldErrors?: string[];
} {
  const messages: string[] = [];
  const fieldMsgs: string[] = [];

  const title = typeof errorData?.title === 'string' ? errorData.title : undefined;
  const id = typeof errorData?.id === 'string' ? errorData.id : undefined;

  // New format: errorMessages: [{ field, message }]
  if (Array.isArray(errorData?.errorMessages)) {
    for (const e of errorData.errorMessages) {
      const field = e?.field ?? 'unknown';
      const msg = stripHtml(String(e?.message ?? ''));
      fieldMsgs.push(`Field '${field}': ${msg}`);
      // Try JSON array inside message for harmonised codes
      const jsonArr = extractTrailingJsonArray(String(e?.message ?? ''));
      if (Array.isArray(jsonArr)) {
        for (const item of jsonArr) {
          const code = item?.HarmonisedErrorCode || item?.code;
          const ui = item?.HarmonisedErrorUIMessage || item?.message;
          if (code || ui) {
            fieldMsgs.push(`Hint ${code ? `[${code}]` : ''} ${ui ? `- ${ui}` : ''}`.trim());
          }
        }
      }
    }
  }

  // New format: errors: [string]
  if (Array.isArray(errorData?.errors)) {
    for (const e of errorData.errors) {
      const txt = stripHtml(String(e ?? ''));
      messages.push(txt);
      const jsonArr = extractTrailingJsonArray(String(e ?? ''));
      if (Array.isArray(jsonArr)) {
        for (const item of jsonArr) {
          const code = item?.HarmonisedErrorCode || item?.code;
          const ui = item?.HarmonisedErrorUIMessage || item?.message;
          if (code || ui) {
            messages.push(`Hint ${code ? `[${code}]` : ''} ${ui ? `- ${ui}` : ''}`.trim());
          }
        }
      }
    }
  }

  // Legacy: validationErrors.fields
  if (errorData?.validationErrors?.fields) {
    const fields = errorData.validationErrors.fields;
    for (const fieldName in fields) {
      const fieldError = fields[fieldName];
      if (Array.isArray(fieldError?.violations) && fieldError.violations.length > 0) {
        const violation = fieldError.violations[0];
        let msg = String(violation?.message ?? 'Invalid value');
        if (violation?.attributes?.value) msg = msg.replace('{{value}}', String(violation.attributes.value));
        if (violation?.attributes?.country) msg = msg.replace('{{country}}', String(violation.attributes.country));
        fieldMsgs.push(`Field '${fieldName}': ${msg}`);
      }
    }
  }

  // Legacy: validationErrors.orderLines
  if (Array.isArray(errorData?.validationErrors?.orderLines)) {
    errorData.validationErrors.orderLines.forEach((lineError: any, index: number) => {
      for (const fieldName in lineError) {
        const fieldError = lineError[fieldName];
        if (Array.isArray(fieldError?.violations) && fieldError.violations.length > 0) {
          const violation = fieldError.violations[0];
          const requiredValue = violation?.attributes?.value || 'N/A';
          const message = String(violation?.message ?? '').replace('{{value}}', String(requiredValue));
          fieldMsgs.push(`Order Line ${index + 1} - Field '${fieldName}': ${message}`);
        }
      }
    });
  }

  // Legacy: fieldErrors [{ field, message }]
  if (Array.isArray(errorData?.fieldErrors)) {
    errorData.fieldErrors.forEach((fe: any) => {
      fieldMsgs.push(`Field '${fe?.field}': ${fe?.message}`);
    });
  }

  const combined: string[] = [];
  if (title) combined.push(title);
  if (messages.length) combined.push(...messages);
  if (fieldMsgs.length) combined.push(...fieldMsgs);
  const summary = combined.length ? combined.join('; ') : (errorData?.message || 'Bad Request');

  return { title, id, summary, errors: messages, fieldErrors: fieldMsgs };
}
