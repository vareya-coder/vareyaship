import { NextRequest, NextResponse } from "next/server";
import { config } from "dotenv";
import xml2js from 'xml2js';

import { asendiaMapper , getAuthXml} from "@/app/utils/asendia/asendiaDataMapper"; 

import { logger } from '@/utils/logger'



config()
export async function POST(req: NextRequest) {



  const body = await req.json();
  logger.info(JSON.stringify(body));
  const WSDL_ASENDIA_AUTH_OPS_URL = 'https://uat.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/Authenticate.svc?wsdl';
  const WSDL_ASENDIA_SHIPMENT_OPS_URL = 'https://uat.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/TMSBasic.svc?wsdl';

  const API_POSTNLTRACKINGAPPAPI_GRAPHQLAPIENDPOINTOUTPUT = "https://hfrnnmopwneabpj64aw7aim44i.appsync-api.eu-central-1.amazonaws.com/graphql";
  const API_POSTNLTRACKINGAPPAPI_GRAPHQLAPIKEYOUTPUT = "da2-nxbnblyr4zglrff3f65wvml3dm";

  const ASENDIA_AUTH_SOAP_ACTION = 'http://centiro.com/facade/shared/1/0/servicecontract/ISharedOperations/Authenticate';
  const ASENDIA_AUTH_URL_UAT = 'https://uat.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/Authenticate.svc/xml';
  const ASENDIA_AUTH_URL_PROD = 'https://cloud.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/Authenticate.svc/xml';

  const ASENDIA_SHIPMENT_SOAP_ACTION = 'http://centiro.com/facade/tmsBasic/1/0/servicecontract/ITMSBasic/AddAndPrintShipment';
  const ASENDIA_SHIPMENT_URL_UAT = 'https://uat.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/TMSBasic.svc/xml';
  const ASENDIA_SHIPMENT_URL_PROD = 'https://cloud.centiro.com/Universe.Services/TMSBasic/Wcf/c1/i1/TMSBasic/TMSBasic.svc/xml';

  let reqHeaders = {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: ASENDIA_AUTH_SOAP_ACTION,
  };
  
  const defaultAuthXml = getAuthXml(); // Ensure this function returns a valid XML string

  logger.info(defaultAuthXml);
  const url =  ASENDIA_AUTH_URL_PROD ;
  let response = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: defaultAuthXml,
  });
  // let { response } = await soapRequest({ url: url, headers: reqHeaders, xml: defaultAuthXml, timeout: 10000 }); // Optional timeout parameter(milliseconds)
  // const { headers, body, statusCode } = response;
  // console.log(response.headers);
  // console.log(response.body);
  // console.log(response.statusCode);
  // if (!response.ok) {
  //   throw new Error(`SOAP request failed with status ${response.status}`);
  // }

  const authRespHeaders = response.headers;

  const authRespBody = response.body;

  let authTokenInResp = '';

  const textResponse = await response.text();
  logger.info(textResponse)

  // Extract the AuthenticationTicket from the response
  authTokenInResp = await extractAuthenticationTicket(textResponse);


  logger.info('Authentication Ticket:', authTokenInResp);
  let shipmentXmlWithValues = asendiaMapper(body ,authTokenInResp)
  logger.info(shipmentXmlWithValues)

  let url2 = ASENDIA_SHIPMENT_URL_PROD;
  reqHeaders.SOAPAction = ASENDIA_SHIPMENT_SOAP_ACTION;
  
  let responseLabel  : any= await fetch(url2, {
    method: 'POST',
    headers: reqHeaders,
    body: shipmentXmlWithValues,
  }).catch(error => logger.info('Fetch error:', error));
  
  const textResponse2 = await responseLabel.text();

  logger.info(textResponse2);


  const  labelResponse = await extractSequenceNumberAndContent(textResponse2)
  logger.info(labelResponse)

  return new Response(JSON.stringify(labelResponse) , { status: 200, headers: { 'Content-Type': 'text/plain' } });

}

const extractAuthenticationTicket = async (xml: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: true,
      tagNameProcessors: [xml2js.processors.stripPrefix] // Removes namespace prefixes
    });

    parser.parseString(xml, (err, result) => {
      if (err) {
        reject(err);
      } else {
        try {
          const authenticationTicket = result.Envelope.Body.AuthenticateResponse.AuthenticationTicket;
          resolve(authenticationTicket);
        } catch (error) {
          reject('AuthenticationTicket not found');
        }
      }
    });
  });
};

const extractSequenceNumberAndContent = async (xml: string): Promise<{ sequenceNumber: string; content: string }> => {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false, // Change to false to include attributes
      tagNameProcessors: [xml2js.processors.stripPrefix] // Removes namespace prefixes
    });

    parser.parseString(xml, (err, result) => {
      if (err) {
        reject(err);
      } else {
        try {
          const sequenceNumber = result.Envelope.Body.AddAndPrintShipmentResponse.Shipments.SequenceNumber;
          logger.info(sequenceNumber)
          const content = result.Envelope.Body.AddAndPrintShipmentResponse.ParcelDocuments.ParcelDocument.Content;
          resolve({ sequenceNumber, content });
        } catch (error) {
          reject('Sequence number or content not found');
        }
      }
    });
  });
};