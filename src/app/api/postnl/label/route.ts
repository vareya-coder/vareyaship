import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { mapShipHeroToPostNL } from '@/app/utils/postnl/dataMaper';
import { ShipHeroWebhook } from '@/app/utils/types';

import { Data } from '@/app/utils/postnl/postnltypes';

config();

export async function POST(req: NextRequest) {
  try {
    if (req.method === 'POST') {
      const shipmentData: ShipHeroWebhook = await req.json();
      const Product_code = getProductCode(shipmentData.shipping_method);
      
      if (!Product_code) {
        return new NextResponse('Invalid shipment method.', { status: 400 });
      }

      const postNLApiKey = process.env.POSTNL_API_KEY as string;
      const postnlbody : Data = await mapShipHeroToPostNL(shipmentData, Product_code);
      console.log(postnlbody)
      try {
        const postNLApiResponse = await callPostNLApi(postNLApiKey, JSON.stringify(postnlbody));
        
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
    console.error('Error processing the shipment update:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

async function callPostNLApi(apiKey: string, requestPayload: any ) {
 
  try {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    };

    const response: AxiosResponse<any> = await axios.post('https://api-sandbox.postnl.nl/shipment/v2_2/label', requestPayload, {
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
    case 'ROW Boxable Track n Trace 6942':
      return "6942";
    case 'ROW Packet Track n Trace 6550':
      return "6550";
    case 'NL Mailbox Package Sorted 2929':
      return "2929";
    case 'NL Mailbox Package UnSorted 2928':
      return "2928";
    case 'NL Standard 3085':
      return "3085";
    case 'BE Standard 4946':
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
