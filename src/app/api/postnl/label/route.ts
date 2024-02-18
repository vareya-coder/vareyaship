import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosResponse, AxiosError } from 'axios';
//import { uploadPdf } from '@/app/utils/labelUrl'
import { mapShipHeroToPostNL } from '@/app/utils/postnl/dataMaper';
import { ShipHeroWebhook } from '@/app/utils/types';

import { Data } from '@/app/utils/postnl/postnltypes';

config();

export async function POST(req: NextRequest) {

  const Boxable_Track: string = "6942";
  const Packet_Track: string = "6550";
  const Mailbox_package_sorted: string = "2929";
  const Mailbox_pakage_unsorted: string = "2928"
  const standard = "3085"
  const BE_standard_del = "4946"
  let Product_code = undefined;
  try {
        if (req.method === 'POST') {
          const shipmentData: ShipHeroWebhook = await req.json();
         
            if (shipmentData.shipping_method === 'postnl/row-intl-boxable-track-trace-contract-6942') {
              Product_code = Boxable_Track;
              
            }
            else if (shipmentData.shipping_method === 'postnl/row-intl-packet-track-trace-contract-6550') {
              Product_code = Packet_Track;
              
            } else if (shipmentData.shipping_method=== 'postnl/nl-mailbox-package-sorted-2929') {
              Product_code = Mailbox_package_sorted;
            } else if (shipmentData.shipping_method === 'postnl/nl-mailbox-package-unsorted-2928') {
              Product_code = Mailbox_pakage_unsorted;
            } else if (shipmentData.shipping_method === 'postnl/nl-standard-3085') {
              Product_code = standard;
              
            } else if (shipmentData.shipping_method === 'postnl/be-standard-4946') {
              Product_code = BE_standard_del;
            }
            if (Product_code === undefined) {
              return new NextResponse('Invalid shipment method.', { status: 400 });
            }
            const postNLApiKey = process.env.POSTNL_API_KEY as string;
            const postnlbody : Data = await mapShipHeroToPostNL(shipmentData,Product_code)
            //const postnlbodyjson = JSON.stringify( postnlbody)
            const postNLApiResponse = await callPostNLApi(postNLApiKey, JSON.stringify( postnlbody));
        


        return new NextResponse(JSON.stringify(postNLApiResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
    } else {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }
  } catch (error) {
    console.error('Error processing the shipment update:', error);

    let errorMessage = 'Internal Server Error';
    let status = 500;

    if (axios.isAxiosError(error)) {
      const errorResponse = (error as AxiosError).response;
      if (errorResponse) {
        const statusCode: any = errorResponse.status;
        const errorData: any = errorResponse.data;

        if (statusCode === 400) {
          // Bad request error
          const errors = errorData.Errors.map((error: any) => ({
            code: error.Code,
            description: error.Description,
          }));
          return new NextResponse(JSON.stringify({ statusCode, errors }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } else if (statusCode === 401) {
          // Invalid API key error
          return new NextResponse('Invalid API key', { status: 401 });
        } else if (statusCode === 405) {
          // Method not allowed error
          return new NextResponse('Method not allowed', { status: 405 });
        } else if (statusCode === 429) {
          // Too many requests error
          return new NextResponse('Too many requests', { status: 429 });
        } else {
          // Other error status codes
          return new NextResponse('Internal server error', { status: 500 });
        }
      }
    }

    return new NextResponse(errorMessage, {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

async function callPostNLApi(apiKey: string, requestPayload: any ) {
  console.log(requestPayload)
  
  console.log(requestPayload)
  try {
    // Set up the headers with the API key
    const headers = {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    };

    // Make the request to the PostNL API
    const response: AxiosResponse<any> = await axios.post('https://api-sandbox.postnl.nl/shipment/v2_2/label', requestPayload, {
      headers,
      timeout: 10000,
  })
      // Return the response data if the request was successful
      return response.data;
    } catch (error: any) {
      console.log("first")
      if (axios.isAxiosError(error)) {
        const errorResponse = error.response;
        if (errorResponse) {
          const statusCode = errorResponse.status;
          const errorData = errorResponse.data;
          // Handle different error status codes
          if (statusCode === 400) {
            // Bad request error
            const errors = errorData.Errors.map((error: any) => ({
              code: error.Code,
              description: error.Description,
            }));
            return { statusCode, errors };
          } else if (statusCode === 401) {
            // Invalid API key error
            return { statusCode, message: 'Invalid API key' };
          } else if (statusCode === 405) {
            // Method not allowed error
            return { statusCode, message: 'Method not allowed' };
          } else if (statusCode === 429) {
            // Too many requests error
            return { statusCode, message: 'Too many requests' };
          } else {
            // Other error status codes
            return { statusCode, message: 'Internal server error' };
          }
        } else {
          // If no response is received, throw the error
          throw error;
        }
      } else {
        // If the error is not an Axios error, throw it
        throw error;
      }
    }
  }
