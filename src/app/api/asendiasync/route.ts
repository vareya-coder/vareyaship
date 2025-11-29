import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { mapShipHeroToAsendia } from '@/app/utils/asendia/asendiaSyncDataMapper';
import { ShipHeroWebhook, AsendiaAuthRequest, AsendiaAuthResponse, AsendiaParcelRequest, AsendiaParcelResponse } from '@/app/utils/types';

import { Data } from '@/app/utils/postnl/postnltypes';
import { logger } from '@/utils/logger';

config();

export async function POST(req: NextRequest) {
  try {
    if (req.method === 'POST') {
      const shipmentData: ShipHeroWebhook = await req.json();
      logger.info(JSON.stringify(shipmentData));

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

        console.log("Authenticating with Asendia...");
        const authRequest: AsendiaAuthRequest = { username, password };
        const authResponse = await asendiaApi.post<AsendiaAuthResponse>('/api/authenticate', authRequest);
        id_token = authResponse.data.id_token;
        console.log("Authentication successful.");
      } catch (error: any) {
        console.error("Error during Asendia authentication:", error.response?.data || error.message);
        throw new Error("Asendia authentication failed.");
      }
  
      // --- Step 2: Map data and create the parcel ---
      const asendiaRequestBody:AsendiaParcelRequest = mapShipHeroToAsendia(shipmentData);
  
      try {
        console.log("Creating Asendia parcel with request:", JSON.stringify(asendiaRequestBody, null, 2));
        const parcelResponse = await asendiaApi.post<AsendiaParcelResponse>('/api/parcels', asendiaRequestBody, {
            headers: {
                'Authorization': `Bearer ${id_token}`
            }
        });
  
        console.log("Successfully received response from Asendia:", parcelResponse.data);
        // return parcelResponse.data;

        return new NextResponse(JSON.stringify(
          {
            parcelId: parcelResponse.data.id,
            trackingNumber: parcelResponse.data.trackingNumber,
            labelLocation: parcelResponse.data.labelLocation,
            id_token: id_token
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
        // console.error("Error creating Asendia parcel:", JSON.stringify(errorData || error.message));
        logger.error(`Error creating Asendia parcel: ${JSON.stringify(errorData || error.message)}`);
        
        // Case A: External API returned 400 Bad Request (Validation Failure)
        if (upstreamStatus === 400) {
            
            // **HIGHLIGHTED CHANGE: Use the expanded error parser**
            let userFacingDetails = formatAsendiaErrors(errorData); 
            logger.error("Parsed Asendia 400 error details:", userFacingDetails);
            // console.log("Parsed Asendia 400 error details:", userFacingDetails);
            
            // Return 400 to the client, indicating bad input data
            return new NextResponse(JSON.stringify({
                message: "Client Request Data Validation Failed by Asendia Shipping Provider.",
                details: userFacingDetails,
                provider: "Asendia",
                errorCode: "INPUT_VALIDATION_ERROR"
            }), {
                status: 400, // <-- CRUCIAL: Returning 400 (Bad Request)
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
          logger.error(`Asendia API server error with status ${upstreamStatus}.`);  
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
    logger.error('Error processing the shipment update:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

/**
 * Helper function to parse Asendia's varied error payloads (400 Bad Request)
 * into a single readable string.
 */
const formatAsendiaErrors = (errorData: any): string => {
  const messages: string[] = [];

  // --- 1. Handle Structure 1: 'validationErrors' (Seen in Error 1 & 3) ---
  if (errorData.validationErrors) {
      const validationErrors = errorData.validationErrors;
      
      // A. Handle top-level 'fields' errors (like parcel weight or postalCode)
      if (validationErrors.fields) {
          for (const fieldName in validationErrors.fields) {
              const fieldError = validationErrors.fields[fieldName];
              if (fieldError.violations && fieldError.violations.length > 0) {
                  const violation = fieldError.violations[0];
                  // Extract required attribute (e.g., 'value' for weight, 'country' for postalCode)
                  const attributes = violation.attributes ? Object.values(violation.attributes).join(', ') : 'N/A';
                  
                  // Replace placeholder in message if possible
                  let message = violation.message;
                  if (violation.attributes?.value) {
                        message = message.replace('{{value}}', violation.attributes.value);
                  }
                  if (violation.attributes?.country) {
                        message = message.replace('{{country}}', violation.attributes.country);
                  }
                  
                  // Original format: messages.push(`${fieldName}: ${violation.message} (Required: ${attributes})`);
                  messages.push(`Field '${fieldName}': ${message}`);
              }
          }
      }

      // B. Handle 'orderLines' specific errors (Seen in Error 3)
      if (Array.isArray(validationErrors.orderLines)) {
          validationErrors.orderLines.forEach((lineError: any, index: number) => {
              for (const fieldName in lineError) {
                  const fieldError = lineError[fieldName];
                  if (fieldError.violations && fieldError.violations.length > 0) {
                      const violation = fieldError.violations[0];
                      const requiredValue = violation.attributes?.value || 'N/A';
                        let message = violation.message.replace('{{value}}', requiredValue);
                      messages.push(`Order Line ${index + 1} - Field '${fieldName}': ${message}`);
                  }
              }
          });
      }
  }
  
  // ---------------------------------------------------------------------

  // --- 2. Handle Structure 2: 'fieldErrors' (Seen in Error 2) ---
  if (Array.isArray(errorData.fieldErrors)) {
      errorData.fieldErrors.forEach((fieldError: any) => {
          // Note: fieldError.field might be 'addresses.receiver.address1'
          messages.push(`Field '${fieldError.field}': ${fieldError.message}`);
      });
  }
  // ---------------------------------------------------------------------


  if (messages.length === 0) {
      // Fallback for an unknown 400 format
      return errorData.message || "Input validation failed due to an unspecified constraint.";
  }

  return messages.join('; ');
};