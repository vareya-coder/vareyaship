import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { ShipHeroWebhook } from '@/app/utils/types';
import { CustomerDetailsType, ShipmentDetailsType, ShipmentItemsType, ShipmentStatusType } from '@/lib/db/schema';
import { insertCustomerDetails, insertShipmentDetails, insertShipmentItems, insertShipmentStatus, } from '@/lib/db/dboperations';
import { uploadPdf } from '@/app/utils/labelPdfUrlGenerator';
import { uploadPdfBuffer } from '@/app/utils/labelPdfUploader';
// import { withAxiom, AxiomRequest } from 'next-axiom';
import { logger } from '@/utils/logger';

const SHIPMENT_WEBHOOK_ROUTE = '/api/[...shipment_method]';
const LABEL_URL_READINESS_TIMEOUT_MS = 2000;
const LABEL_URL_READINESS_INTERVAL_MS = 250;
const LABEL_URL_READINESS_FLAG = 'UPLOADTHING_LABEL_URL_READINESS_ENABLED';

type LabelUrlMode = 'direct' | 'proxy';

export async function POST(req: NextRequest) {

  console.log('Received a POST request to /api/[...shipment_method]');

  let trackingNumber = '';
  let trackingUrl = ''
  let labelUrl = '';
  const postnlCallingapilocal = "http://localhost:3000/api/postnl/label"
  const postnlCallingapiProd = "https://vareyaship.vercel.app/api/postnl/label"
  
  const asendiaCallingapilocal = "http://localhost:3000/api/asendia"
  const asendiaCallingapiProd = "https://vareyaship.vercel.app/api/asendia"
  
  const asendiaSyncCallingapilocal = "http://localhost:3000/api/asendiasync"
  const asendiaSyncCallingapiProd = "https://vareyaship.vercel.app/api/asendiasync"

  const EU: any = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

  try {
    console.log('Processing shipment update...');
    const shipmentData: ShipHeroWebhook = await req.json();

    console.log('Received shipment data:', JSON.stringify(shipmentData, null, 2));

    const firstPackage = shipmentData.packages[0];

    const Weight = firstPackage.weight_in_oz * 28.3495;
    const { shipping_method, order_id, order_number, to_address, packages } = shipmentData;

    if (!shipping_method || !order_id || !order_number || !to_address || !packages) {
      return new NextResponse('One or more required fields are missing.', { status: 400 });
    }

    if (!Array.isArray(packages) || packages.length === 0 || !packages[0].weight_in_oz || !packages[0].width || !packages[0].length || !packages[0].height) {
      return new NextResponse('Package information is missing or invalid.', { status: 400 });
    }


      if (!shipping_method || !order_id || !order_number || !to_address || !packages) {
        return new NextResponse('One or more required fields are missing.', { status: 400 });
      }

      if (!Array.isArray(packages) || packages.length === 0 || !packages[0].weight_in_oz || !packages[0].width || !packages[0].length || !packages[0].height) {
        return new NextResponse('Package information is missing or invalid.', { status: 400 });
      }

      if (!to_address.name || !to_address.address_1 || !to_address.city || !to_address.country) {
        return new NextResponse('One or more destination address fields are missing.', { status: 400 });
      }

      if (!(to_address.country == 'SA' || to_address.country == 'IL' || to_address.country == 'QA' || to_address.country == 'AE')) {
        if (!to_address.zip) {
          return new NextResponse('One or more destination address fields are missing.', { status: 400 });
        }
      }
      
      let Carrier : string =''
      const postNL: string[] = [
        'postnl:row-intl-boxable-track-trace-contract-6942',
        'postnl:row-intl-packet-track-trace-contract-6550',
        'postnl:nl-mailbox-package-sorted-2929',
        'postnl:nl-mailbox-package-unsorted-2928',
        'postnl:nl-standard-3085',
        'postnl:be-standard-4946'
      ];
      const asendia: string[] = [
        'asendia:epaqpls',
        'asendia:epaqpls-personal-delivery',
        'asendia:epaqpls-mailbox-delivery',
        'asendia:epaqsct',
        'asendia:epaqsct-signature',
        'asendia:epaqpls-boxable',
        'asendia:epaqpls-personal-delivery-boxable',
        'asendia:epaqpls-mailbox-delivery-boxable'
      ];

    if(asendia.includes(shipmentData.shipping_method)){
      Carrier ="Asendia"
    } else if(postNL.includes(shipmentData.shipping_method)){
      Carrier="PostNL"
    }

    logger.info(Carrier);
    console.log( `Carrier: ${Carrier}`);
    let labelContent = undefined;
    var currentdate = new Date();

    var datetime = currentdate.getFullYear() + "-" + padLeftZero(currentdate.getMonth() + 1) + "-"
      + padLeftZero(currentdate.getDate()) + "-"
      + padLeftZero(currentdate.getHours()) +
      + padLeftZero(currentdate.getMinutes()) + padLeftZero(currentdate.getSeconds());
    const filename = `${shipmentData.order_id}-${shipmentData.shipping_method}-${datetime}`

    if (Carrier ==="PostNL") {
      const postNLApiResponse = await axios.post(postnlCallingapiProd, shipmentData);
  
      if (postNLApiResponse.data.ResponseShipments.length > 0 && postNLApiResponse.data.ResponseShipments[0].Labels.length > 0) {
        trackingNumber = postNLApiResponse.data.ResponseShipments[0].Barcode
        // trackingUrl = `https://jouw.postnl.nl/track-and-trace/${trackingNumber}-${shipmentData.to_address.country}-${shipmentData.to_address.zip.replace(/\s/g,'')}${shipmentData.to_address.country == 'NL' ? '?language=nl': ''}`
          
        //Check if the destination country is not in the EU
        if (shipmentData.shop_name === 'vacierjewelry.myshopify.com' && !EU.includes(shipmentData.to_address.country)) {
          trackingUrl = `https://parcelsapp.com/en/tracking/${trackingNumber}`;
        } else {
          trackingUrl = `https://jouw.postnl.nl/track-and-trace/${trackingNumber}-${shipmentData.to_address.country}-${shipmentData.to_address.zip.replace(/\s/g,'')}${shipmentData.to_address.country == 'NL' ? '?language=nl': ''}`;
        }
        labelContent = postNLApiResponse.data.ResponseShipments[0].Labels[0].Content;

        const uploadedLabelUrl = await uploadPdf(labelContent, filename);
        if (!uploadedLabelUrl) {
          throw new Error('PostNL label upload returned an empty URL.');
        }
        labelUrl = await finalizeLabelUrlForWebhook(uploadedLabelUrl, req, {
          carrier: Carrier,
          orderId: shipmentData.order_id,
        });
      }

    } else if (Carrier ==="Asendia") {
      let asendiaSyncEnabled = process.env.ASENDIA_SYNC_ENABLED 
                                && (process.env.ASENDIA_SYNC_ENABLED as string) === 'y' ? true : false;
      
      let asendiaResponse = undefined;
      if (asendiaSyncEnabled) {
        // If Asendia sync is enabled, we will call the Asendia Sync API to get the label and tracking number
        asendiaResponse = await axios.post(asendiaSyncCallingapiProd, shipmentData, {
          validateStatus: function (status) {
            return status < 500; // Resolve only if the status code is less than 500
          }
        });
        
        logger.info("Successfully received response from Local Asendia API Handler in main:");
        // console.log("Successfully received response from Local Asendia API Handler in main:", asendiaResponse.data);
        
        if (asendiaResponse && asendiaResponse.data && asendiaResponse.data.trackingNumber && asendiaResponse.data.labelLocation) {
          trackingNumber = asendiaResponse.data.trackingNumber
        
          // --- Step 3: Fetch the PDF label ---
          logger.info(`Fetching label from: ${asendiaResponse.data.labelLocation}`);
          // console.log(`Fetching label from: ${asendiaResponse.data.labelLocation}`);
          try {
            // NOTE: We do not need the full baseURL for this call, as labelLocation is a full URL.
            // We can call axios.get directly on the full URL.
            const labelApiResponse = await axios.get(asendiaResponse.data.labelLocation, {
                headers: { 'Authorization': `Bearer ${asendiaResponse.data.id_token}` },
                responseType: 'arraybuffer' // This is crucial to get binary data
            });

            const pdfBuffer = Buffer.from(labelApiResponse.data);
            logger.info(`Successfully fetched label PDF (${pdfBuffer.length} bytes).`);
            
            const uploadedLabelUrl = await uploadPdfBuffer(pdfBuffer, filename);
            if (!uploadedLabelUrl) {
              throw new Error('Asendia label upload returned an empty URL.');
            }
            labelUrl = await finalizeLabelUrlForWebhook(uploadedLabelUrl, req, {
              carrier: Carrier,
              orderId: shipmentData.order_id,
            });
            logger.info(`Label uploaded successfully. URL: ${labelUrl}`);

          } catch (uploadError: any) {
              logger.error("Failed to fetch or upload the Asendia label.", uploadError.message);
              // We don't re-throw here, so the process can continue even if the label fails.
              // The return object will simply be missing the `labelUrl`.
          }
        } else if (asendiaResponse && asendiaResponse.data && asendiaResponse.data.errorCode) {
          console.error("Asendia Sync API reported input validation error:", asendiaResponse.data);
          return new NextResponse(JSON.stringify(asendiaResponse.data), {
            status: asendiaResponse.status,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
        // } else {
        //   logger.warn('No trackingNumber and labelLocation provided in Asendia response. Skipping label fetch.');
        //   console.warn('No trackingNumber and labelLocation provided in Asendia response. Skipping label fetch.');
        // }
      } else {
        asendiaResponse = await axios.post(asendiaCallingapiProd, shipmentData)
        if (asendiaResponse && asendiaResponse.data) {
          trackingNumber = asendiaResponse.data.sequenceNumber
        }
        labelContent  = asendiaResponse.data.content;
        const uploadedLabelUrl = await uploadPdf(labelContent, filename);
        if (!uploadedLabelUrl) {
          throw new Error('Asendia label upload returned an empty URL.');
        }
        labelUrl = await finalizeLabelUrlForWebhook(uploadedLabelUrl, req, {
          carrier: Carrier,
          orderId: shipmentData.order_id,
        });
      }
      // trackingUrl = `https://a-track.asendia.com/customer-tracking/self?tracking_id=${trackingNumber}`
      // trackingUrl = `https://tracking.asendia.com/tracking/${trackingNumber}`
      // trackingUrl = `https://track.asendia.com/track/${trackingNumber}`;
      
      //Check if the destination country is not in the EU
      if (shipmentData.shop_name === 'vacierjewelry.myshopify.com' && !EU.includes(shipmentData.to_address.country)) {
        trackingUrl = `https://parcelsapp.com/en/tracking/${trackingNumber}`;
      } else {
        trackingUrl = `https://track.asendia.com/track/${trackingNumber}`;
      }
    } else {
      return new NextResponse('carrier not supported.', { status: 404 });
    }

    // console.log(`Tracking Number: ${trackingNumber}`);
    // console.log(`Tracking URL: ${trackingUrl}`);
    // console.log(`Label URL: ${labelUrl}`);

    logger.info(trackingNumber);
    logger.info(trackingUrl);
    logger.info(`Final uploaded label URL: ${labelUrl}`);

    // const shipmentDetailsData: ShipmentDetailsType = {
    //   order_id: shipmentData.order_id,
    //   barcode: trackingNumber,
    //   name: shipmentData.shop_name,
    //   cancel_deadline: new Date(),
    //   shipping_method: shipmentData.shipping_method,
    //   from_address: shipmentData.to_address.address_1 + "," + shipmentData.to_address.city + "," + shipmentData.to_address.country as string,
    //   label_url: labelUrl as string,
    //   request_body : JSON.stringify(shipmentData) 
    // };
    // let shipmentId : any = undefined
    // let insertedShipmentId : any = undefined
    // try{
    //   shipmentId  = await insertShipmentDetails(shipmentDetailsData);
    //   insertedShipmentId =shipmentId[0].insertedId

    // } catch(error){
    //   console.log(error)
    //   logger.error('Error occured while inserting data to database', { error: error });

    // }

    // const customerDetailsData: CustomerDetailsType = {
    //   customer_name: shipmentData.to_address.name,
    //   customer_email: shipmentData.to_address.email,
    //   to_address: shipmentData.to_address.address_1 + "," + shipmentData.to_address.city + "," + shipmentData.to_address.country,
    //   shipment_id: insertedShipmentId,
    // };

    // const shipmentStatusData: ShipmentStatusType = {
    //   shipment_id:insertedShipmentId,
    //   status_code: '1',
    //   status_description: '	Shipment pre-alerted',
    //   carrier_message: 'Carrier message goes here',
    // };
    // const shipmentItemsData: ShipmentItemsType[] = shipmentData.packages[0].line_items?.map((item: any) => {
    //   return {
    //       shipment_id: insertedShipmentId,
    //       item_description: item.customs_description,
    //       quantity: item.quantity,
    //       unit_price: item.price,
    //       shipment_weight: Weight
    //   };
    // }) || [];
    
    // try {
    //   // Insert into addresses table
    //   // await insertShipmentItems(shipmentItemsData)
    //   // await insertCustomerDetails(customerDetailsData)
    //   // await insertShipmentStatus(shipmentStatusData)
    //   console.log('No longer inserting data into database');

    // } catch (error) {
    //   logger.error('Error occured while inserting data to database', { error: error });
    // }

    let responseBodyJson = {
      code: 200,
      shipping_method: shipping_method,
      tracking_number: trackingNumber,
      cost: 0,
      label: labelUrl,
      customs_info: '',
      shipping_carrier: Carrier,
      tracking_url: trackingUrl
    };
    
    const responseBody = JSON.stringify(responseBodyJson);
    logger.info(responseBody);
    console.log(responseBody);

    logger.end();

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('Error processing the shipment update:', error);
    console.log('Error processing the shipment update:', error);

    let errorMessage: any = 'Internal Server Error';
    let status = 500;

    if (axios.isAxiosError(error)) {
      const errorResponse = error.response;
      const axiosError: AxiosError = error;
      if (axiosError.response) {
        const response: AxiosResponse = axiosError.response;
        status = response.status

        errorMessage = JSON.stringify(response.data.errors);
        // req.log.error('Error occured while calling Carrier Endpoint :', { error: errorMessage })
      }
    }

    logger.end();

    return new NextResponse(errorMessage, {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

function padLeftZero(n:number) {
  return ('0'+n).slice(-2)
}

function isUploadThingPdfProxyEnabled(): boolean {
  return isTruthyFlag(process.env.UPLOADTHING_PDF_PROXY_URL_ENABLED);
}

function isLabelUrlReadinessCheckEnabled(): boolean {
  const rawValue = process.env[LABEL_URL_READINESS_FLAG];
  if (rawValue === undefined || rawValue.trim() === '') {
    return true;
  }

  return isTruthyFlag(rawValue);
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes';
}

function extractUploadThingFileKey(uploadThingUrl: string): string | null {
  try {
    const parsedUrl = new URL(uploadThingUrl);
    const pathMatch = parsedUrl.pathname.match(/^\/f\/([^/]+)$/);
    return pathMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveWebhookLabelUrl(
  uploadThingUrl: string,
  req: NextRequest,
): { url: string; mode: LabelUrlMode } {
  if (!isUploadThingPdfProxyEnabled()) {
    return { url: uploadThingUrl, mode: 'direct' };
  }

  const fileKey = extractUploadThingFileKey(uploadThingUrl);
  if (!fileKey) {
    return { url: uploadThingUrl, mode: 'direct' };
  }

  return {
    url: `${req.nextUrl.origin}/api/uploadthing/file/${fileKey}.pdf`,
    mode: 'proxy',
  };
}

async function finalizeLabelUrlForWebhook(
  uploadThingUrl: string,
  req: NextRequest,
  context: { carrier: string; orderId: string | number },
): Promise<string> {
  const { url: finalUrl, mode } = resolveWebhookLabelUrl(uploadThingUrl, req);
  const readinessEnabled = isLabelUrlReadinessCheckEnabled();

  logger.log({
    level: 'info',
    message: 'label_url_mode_selected',
    event: 'label_url_mode_selected',
    route: SHIPMENT_WEBHOOK_ROUTE,
    carrier: context.carrier,
    orderId: String(context.orderId),
    mode,
    readinessEnabled,
    readinessTimeoutMs: LABEL_URL_READINESS_TIMEOUT_MS,
    readinessIntervalMs: LABEL_URL_READINESS_INTERVAL_MS,
  });
  // console.log(JSON.stringify({ event: 'label_url_mode_selected', route: SHIPMENT_WEBHOOK_ROUTE, carrier: context.carrier, orderId: String(context.orderId), mode }));

  if (!readinessEnabled) {
    logger.log({
      level: 'info',
      message: 'label_url_readiness_skipped',
      event: 'label_url_readiness_skipped',
      route: SHIPMENT_WEBHOOK_ROUTE,
      carrier: context.carrier,
      orderId: String(context.orderId),
      mode,
      reason: 'feature_flag_disabled',
    });
    // console.log(JSON.stringify({ event: 'label_url_readiness_skipped', route: SHIPMENT_WEBHOOK_ROUTE, carrier: context.carrier, orderId: String(context.orderId), mode, reason: 'feature_flag_disabled' }));
    return finalUrl;
  }

  try {
    const readiness = await waitForLabelUrlReadiness(finalUrl);
    if (readiness.ready) {
      logger.log({
        level: 'info',
        message: 'label_url_readiness_ready',
        event: 'label_url_readiness_ready',
        route: SHIPMENT_WEBHOOK_ROUTE,
        carrier: context.carrier,
        orderId: String(context.orderId),
        mode,
        attempts: readiness.attempts,
        elapsedMs: readiness.elapsedMs,
        status: readiness.status,
      });
      // console.log(JSON.stringify({ event: 'label_url_readiness_ready', route: SHIPMENT_WEBHOOK_ROUTE, attempts: readiness.attempts, elapsedMs: readiness.elapsedMs, status: readiness.status, mode }));
      return finalUrl;
    }

    logger.log({
      level: 'warn',
      message: 'label_url_readiness_timeout',
      event: 'label_url_readiness_timeout',
      route: SHIPMENT_WEBHOOK_ROUTE,
      carrier: context.carrier,
      orderId: String(context.orderId),
      returnedUrlMode: mode,
      attempts: readiness.attempts,
      elapsedMs: readiness.elapsedMs,
      lastStatus: readiness.status,
    });
    // console.warn(JSON.stringify({ event: 'label_url_readiness_timeout', route: SHIPMENT_WEBHOOK_ROUTE, attempts: readiness.attempts, elapsedMs: readiness.elapsedMs, lastStatus: readiness.status, returnedUrlMode: mode }));

    return finalUrl;
  } catch (error) {
    const typedError = error as Error;
    logger.log({
      level: 'error',
      message: 'label_url_readiness_error',
      event: 'label_url_readiness_error',
      route: SHIPMENT_WEBHOOK_ROUTE,
      carrier: context.carrier,
      orderId: String(context.orderId),
      returnedUrlMode: mode,
      errorName: typedError.name,
      errorMessage: typedError.message,
    });
    // console.error(JSON.stringify({ event: 'label_url_readiness_error', route: SHIPMENT_WEBHOOK_ROUTE, returnedUrlMode: mode, errorName: typedError.name, errorMessage: typedError.message }));

    return finalUrl;
  }
}

async function waitForLabelUrlReadiness(url: string): Promise<{
  ready: boolean;
  attempts: number;
  elapsedMs: number;
  status: number | null;
}> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastStatus: number | null = null;

  while (Date.now() - startedAt <= LABEL_URL_READINESS_TIMEOUT_MS) {
    attempts += 1;
    const probeResult = await probeLabelUrl(url);
    lastStatus = probeResult.status;

    if (probeResult.ready) {
      return {
        ready: true,
        attempts,
        elapsedMs: Date.now() - startedAt,
        status: probeResult.status,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= LABEL_URL_READINESS_TIMEOUT_MS) {
      break;
    }

    const sleepMs = Math.min(
      LABEL_URL_READINESS_INTERVAL_MS,
      LABEL_URL_READINESS_TIMEOUT_MS - elapsedMs,
    );
    await sleep(sleepMs);
  }

  return {
    ready: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    status: lastStatus,
  };
}

async function probeLabelUrl(url: string): Promise<{ ready: boolean; status: number | null }> {
  const headResult = await requestLabelUrl({
    url,
    method: 'HEAD',
  });

  if (isReadyStatus(headResult.status)) {
    return { ready: true, status: headResult.status };
  }

  if (headResult.status === null || headResult.status >= 400) {
    const getResult = await requestLabelUrl({
      url,
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });

    if (isReadyStatus(getResult.status)) {
      return { ready: true, status: getResult.status };
    }

    return { ready: false, status: getResult.status ?? headResult.status };
  }

  return { ready: false, status: headResult.status };
}

function isReadyStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 400;
}

async function requestLabelUrl(input: {
  url: string;
  method: 'HEAD' | 'GET';
  headers?: Record<string, string>;
}): Promise<{ status: number | null }> {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      redirect: 'follow',
      cache: 'no-store',
    });

    return { status: response.status };
  } catch {
    return { status: null };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
