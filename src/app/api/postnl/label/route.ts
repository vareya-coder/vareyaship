import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { mapShipHeroToPostNL } from '@/app/utils/postnl/dataMaper';
import { ShipHeroWebhook } from '@/app/utils/types';

import { Data } from '@/app/utils/postnl/postnltypes';
import { logger } from '@/utils/logger';

config();

export async function POST(req: NextRequest) {
  try {
    if (req.method === 'POST') {
      const shipmentData: ShipHeroWebhook = await req.json();
      logger.info(JSON.stringify(shipmentData));
      const postNLProductCode = getProductCode(shipmentData.shipping_method);
      
      if (!postNLProductCode) {
        return new NextResponse('Invalid shipment method.', { status: 400 });
      }

      const postNLCustomerCode: string = process.env.CUSTOMER_CODE as string;
      const postNLCustomerNumber: string = process.env.CUSTOMER_NUMBER as string;    

      let barCode: string = '';
      if (postNLProductCode === '6942' || postNLProductCode === '6550') {
        barCode = await getBarcode(postNLCustomerCode, postNLCustomerNumber);
      }
      logger.info(barCode);

      const postNLApiKey = process.env.POSTNL_API_KEY as string;
      const postNLBody : Data = await mapShipHeroToPostNL(shipmentData, barCode, postNLProductCode, 
                                                          postNLCustomerCode, postNLCustomerNumber);
      logger.info(JSON.stringify(postNLBody))
      try {
        const postNLApiResponse = await callPostNLApi(postNLApiKey, JSON.stringify(postNLBody));
        
        logger.info(JSON.stringify(postNLApiResponse))
        return new NextResponse(JSON.stringify(postNLApiResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        
        return handlePostNLError(error);
      }
    } else {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }
  } catch (error) {
    logger.error('Error processing the shipment update:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

async function getBarcode(customer_code: string, customer_number: string) {
  const apiKey = process.env.POSTNL_API_KEY;

  try {
      const response = await axios.get(
          'https://api.postnl.nl/shipment/v1_1/barcode',
          {
              params: {
                  CustomerNumber: customer_number,
                  CustomerCode: customer_code,
                  Type: 'LA',
                  Range: "NL",
                  Serie: '00000000-99999999',
              },

              headers: {
                  'Content-Type': 'application/json',
                  'apikey': apiKey,
              },
          }
      );

      return response.data.Barcode;
  } catch (error) {
      logger.error('Error fetching barcode:', error);
      // Handle errors here
      throw error;
  }
}

async function callPostNLApi(apiKey: string, requestPayload: any ) {
 
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    };

    const response: AxiosResponse<any> = await axios.post('https://api.postnl.nl/shipment/v2_2/label', requestPayload, {
      headers,
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    
    throw error;
  }
}

function getProductCode(shippingMethod: string): string | undefined {
  switch (shippingMethod) {
    case 'postnl:row-intl-boxable-track-trace-contract-6942':
      return "6942";
    case 'postnl:row-intl-packet-track-trace-contract-6550':
      return "6550";
    case 'postnl:nl-mailbox-package-sorted-2929':
      return "2929";
    case 'postnl:nl-mailbox-package-unsorted-2928':
      return "2928";
    case 'postnl:nl-standard-3085':
      return "3085";
    case 'postnl:be-standard-4946':
      return "4946";
    default:
      return undefined;
  }
}

function handlePostNLError(error: any) {
  if (axios.isAxiosError(error)) {
    const errorResponse = error.response;
    if (errorResponse) {
      const statusCode = errorResponse.status;
      const errorData = errorResponse.data;
  
      if (statusCode === 400) {
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
        return new NextResponse('Invalid API key', { status: 401 });
      } else if (statusCode === 405) {
        return new NextResponse('Method not allowed', { status: 405 });
      } else if (statusCode === 429) {
        return new NextResponse('Too many requests', { status: 429 });
      } else {
        return new NextResponse('Internal server error', { status: 500 });
      }
    } else {
      return new NextResponse('Internal server error', { status: 500 });
    }
  } else {
    
    return new NextResponse('Internal server error', { status: 500 });
  }
}
