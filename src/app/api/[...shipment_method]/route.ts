import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { db } from '@/lib/db';
import { ShipHeroWebhook } from '@/app/utils/types';
import { Data } from '@/app/utils/postnl/postnltypes';
import { PostNLLabelResponse } from '@/app/utils/postnl/typeLabel';
import {  CustomerDetailsType, ShipmentDetailsType, ShipmentItemsType, ShipmentStatusType } from '@/lib/db/schema';
import { insertCustomerDetails, insertShipmentDetails, insertShipmentItems, insertShipmentStatus ,  } from '@/lib/db/dboperations';
import { uploadPdf } from '@/app/utils/labelPdfUrlGenerator';
import { Label } from '@radix-ui/react-dropdown-menu';
import { withAxiom, AxiomRequest } from 'next-axiom';

export const POST  = withAxiom(async(req: AxiomRequest) => {
  req.log.info(' function called');
  

  let barcode = undefined;
  let labelUrl = undefined;
  const postnlCallingapilocal ="http://localhost:3000/api/postnl/label"
  const postnlCallingapiProd ="https://vareyaship.vercel.app/api/postnl/label"
  
  try {
    if (req.method === 'POST') {
      const shipmentData: ShipHeroWebhook = await req.json();

      const fromAddress : string = shipmentData.from_address.address_1+","+shipmentData.from_address.city+","+shipmentData.from_address.country
      const firstPackage = shipmentData.packages[0];
    
      const Weight = firstPackage.weight_in_oz * 28.3495;
      const { shipping_method, order_id, order_number, to_address, packages } = shipmentData;

      if (!shipping_method || !order_id || !order_number || !to_address || !packages) {
        return new NextResponse('One or more required fields are missing.', { status: 400 });
      }

      if (!Array.isArray(packages) || packages.length === 0 || !packages[0].weight_in_oz || !packages[0].width || !packages[0].length || !packages[0].height) {
        return new NextResponse('Package information is missing or invalid.', { status: 400 });
      }

      if (!to_address.name || !to_address.address_1 || !to_address.city || !to_address.zip || !to_address.country) {
        return new NextResponse('One or more destination address fields are missing.', { status: 400 });
      }

      let  labelContent = undefined ;
      if (req.nextUrl.pathname === '/api/shipment/shiphero') {
            const postNLApiResponse = await axios.post(postnlCallingapilocal,shipmentData);
            if (postNLApiResponse.data.ResponseShipments.length > 0 && postNLApiResponse.data.ResponseShipments[0].Labels.length > 0) {
                barcode = postNLApiResponse.data.ResponseShipments[0].Barcode;
               labelContent = postNLApiResponse.data.ResponseShipments[0].Labels[0].Content;
               
              }
              var currentdate = new Date();
              var datetime = currentdate.getFullYear() + "-" + currentdate.getMonth()+"-" 
               + currentdate.getDay() + "-" 
              + currentdate.getHours() + 
              + currentdate.getMinutes()  + currentdate.getSeconds();
              const filename = `${shipmentData.order_id}-${shipmentData.shipping_method}- ${datetime}`
              labelUrl = await uploadPdf(labelContent , filename)
              const shipping_method = shipmentData.shipping_method ;
              if(labelUrl== undefined){

              }
              
            
            const shipmentDetailsData : ShipmentDetailsType = {
                barcode: barcode,
                name : shipmentData.shop_name,
                order_id: shipmentData.order_id,
                label_announced_at: new Date(),
                cancel_deadline: new Date(),
                shipping_method:shipmentData.shipping_method,
  
                from_address: fromAddress ,
                label_url : labelUrl
            };
            
            const customerDetailsData : CustomerDetailsType = {
                customer_name: shipmentData.to_address.name,
                customer_email: shipmentData.to_address.email,
                to_address: shipmentData.to_address.address_1+","+shipmentData.to_address.city+","+shipmentData.to_address.country,
                order_id: shipmentData.order_id,
            };
            
            const shipmentStatusData : ShipmentStatusType = {
                order_id: shipmentData.order_id, 
                status_code: '1',
                status_description: '	Shipment pre-alerted',
                timestamp: new Date(),
                carrier_message: 'Carrier message goes here',
            };
            
            const shipmentItemsData : ShipmentItemsType = {
                order_id: shipmentData.order_id, 
                item_description: 'Example Item',
                quantity: 1,
                unit_price: "10.99",
                shipment_weight: Weight,
            };
            
            
          
                try {
                    // Insert into addresses table
                    
                    await insertShipmentDetails(shipmentDetailsData);
                    //await insertShipmentItems(shipmentItemsData)
                    await insertCustomerDetails(customerDetailsData)
                    await insertShipmentStatus(shipmentStatusData)
    
                }catch (error) {
                  console.error('Error inserting data:', error);
    
              }
       
       
        let responseBodyJson = {
          code: postNLApiResponse.status,
          shipping_method:shipping_method,
          tracking_number: postNLApiResponse.data.ResponseShipments[0].Barcode,
          cost: 0,
          label: labelUrl,
          customs_info: '',
          shipping_carrier: 'PostNL',
          tracking_url : `https://postnl.post/#/tracking/items/${postNLApiResponse.data.ResponseShipments[0].Barcode}`
        };
        const responseBody =  JSON.stringify(responseBodyJson);
        return new NextResponse(responseBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });     
          
          
      } else {
        return new NextResponse('not found .', { status: 404 });
      }
    } else {
      return new NextResponse('Method Not Allowed', { status: 405 });
    }
  } catch (error) {
    console.error('Error processing the shipment update:', error);
  
    let errorMessage :any = 'Internal Server Error';
    let status = 500;
    

    if (axios.isAxiosError(error)) {
      const errorResponse = error.response;
      const axiosError: AxiosError = error;
      if (axiosError.response) {
        const response: AxiosResponse = axiosError.response;
        status = response.status
        
        errorMessage = JSON.stringify(response.data.errors);
        req.log.error(errorMessage)
      }
    }

    return new NextResponse(errorMessage, {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
})


   