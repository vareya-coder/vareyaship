import { NextRequest, NextResponse } from "next/server";
import { config } from "dotenv";
import xml2js from 'xml2js';
import { asendiaMapper , getAuthXml} from "@/app/utils/asendia/asendiaDataMapper"; 

config()
export async function POST(req: NextRequest) {



  const body = await req.json();
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

  // const ASENDIA_PRODUCT_FULLY_TRACKED_GOODS = 'FTG';
  // const ASENDIA_PRODUCT_PREMIUM_GOODS = 'PRG';
  // const ASENDIA_SERVICE_MAIL_BOX_DELIVERY = 'MBD';
  // const ASENDIA_FORMAT_NON_BOXABLE = 'N';

  const ASENDIA_PRODUCT_FULLY_TRACKED_GOODS = 'EPAQPLS';
  const ASENDIA_PRODUCT_PREMIUM_GOODS = 'EPAQPLS';
  const ASENDIA_SERVICE = 'CUP';
  // const ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY = 'PD'
  const ASENDIA_FORMAT_NON_BOXABLE = 'N';

  const OZ_TO_KG_MULTIPLIER = 0.0283495231;

  const adminTableSuffix = '-527socgcarbs3d5eyfk5y75hxa-stg';

  const S3_KEY_PREFIX = 'asendia/shipment-label/';

  const SHIPHERO_LINE_ITEM_KIT_STATUS = 'broken_in_sets';

  const DEFAULT_SHIPMENT_TRACKING_STATUS_CODE = '-1';
  const SHIPMENT_TRACKING_CARRIER_NAME = 'Asendia';

  let headers = {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: ASENDIA_AUTH_SOAP_ACTION,
  };
  console.log("first")

  const defaultAuthXml = getAuthXml()
  console.log(defaultAuthXml)
  const url =  ASENDIA_AUTH_URL_PROD ;

  let response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: defaultAuthXml,
  });
  // var { response } = await soapRequest({ url: url, headers: headers, xml: defaultAuthXml, timeout: 10000 }); // Optional timeout parameter(milliseconds)
  console.log(response)
  if (!response.ok) {
   
    console.log("first")
    throw new Error(`SOAP request failed with status ${response.status}`);
  }
  console.log(response)
  const authRespHeaders = response.headers;

  const authRespBody = response.body;


  let authTokenInResp = '';


 
  const textResponse = await response.text();
  console.log(response)
  console.log(textResponse)

  // Extract the AuthenticationTicket from the response
  authTokenInResp = await extractAuthenticationTicket(textResponse);
  console.log(authTokenInResp)
  let shipmentXmlWithValues = '';
headers.SOAPAction = ASENDIA_SHIPMENT_SOAP_ACTION;


shipmentXmlWithValues = asendiaMapper(body ,authTokenInResp)
console.log(shipmentXmlWithValues)
var url2 = ASENDIA_SHIPMENT_URL_PROD;
  let responseLabel  : any= await fetch(url2, {
  method: 'POST',
  headers: headers,
  body: shipmentXmlWithValues,
}).catch(error => console.log('Fetch error:', error));


  const textResponse2 = await responseLabel.text();
  console.log(textResponse2)

  const  labelResponse = await extractSequenceNumberAndContent(textResponse2)
  console.log(labelResponse)

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
          console.log(sequenceNumber)
          const content = result.Envelope.Body.AddAndPrintShipmentResponse.ParcelDocuments.ParcelDocument.Content;
          resolve({ sequenceNumber, content });
        } catch (error) {
          reject('Sequence number or content not found');
        }
      }
    });
  });
};


