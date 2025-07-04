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
          // console.error(`Error creating Asendia parcel:
          // id: ${JSON.stringify(error.response?.data.id)}
          // status: ${JSON.stringify(error.response?.data.status)}
          // errors: ${JSON.stringify(error.response?.data.errors)}
          // errorMessages: ${JSON.stringify(error.response?.data.errorMessages)}`);
          console.error("Error creating Asendia parcel:", error.response?.data || error.message);

          logger.error(`Error creating Asendia parcel: ${error.response?.data || error.message}`);
          // logger.error(`Error creating Asendia parcel:
          // id: ${JSON.stringify(error.response?.data.id)}
          // status: ${JSON.stringify(error.response?.data.status)}
          // errors: ${JSON.stringify(error.response?.data.errors)}
          // errorMessages: ${JSON.stringify(error.response?.data.errorMessages)}`);
          
          // Re-throw a more informative error
          const errorData = error.response?.data;
          if (errorData && errorData.errorMessages) {
               throw new Error(`Asendia API Error: ${JSON.stringify(errorData.errorMessages)}`);
          }
          throw new Error("Failed to create Asendia parcel.");
      }
    } else {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }
  } catch (error) {
    logger.error('Error processing the shipment update:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
