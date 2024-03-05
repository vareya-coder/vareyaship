import { NextRequest, NextResponse } from "next/server";
import { config } from "dotenv";
import xml2js from 'xml2js';
import soapRequest from 'easy-soap-request';



config()
export async function POST(req: NextRequest) {



  const body = await req.json();
  console.log(JSON.stringify(body));
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

  let reqHeaders = {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: ASENDIA_AUTH_SOAP_ACTION,
  };

  console.time();
  const defaultAuthXml = getAuthXml(); // Ensure this function returns a valid XML string
  console.log(defaultAuthXml);

  const url =  ASENDIA_AUTH_URL_PROD ;
  
  let response = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: defaultAuthXml,
  });
  console.timeEnd();
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
  console.log(textResponse)

  // Extract the AuthenticationTicket from the response
  authTokenInResp = await extractAuthenticationTicket(textResponse);


  console.log('Authentication Ticket:', authTokenInResp);

  console.time();
  let defaultShipmentXmlParser = new xml2js.Parser();
  var asendiaShipmentAPIRequestAsJsonObj: any;
  var defaultShipmentXml = getShipmentXml();
  defaultShipmentXmlParser.parseString(defaultShipmentXml, function (err, result) {
    asendiaShipmentAPIRequestAsJsonObj = result;
  });
  asendiaShipmentAPIRequestAsJsonObj['SOAP-ENV:Envelope']['SOAP-ENV:Header'][0]['ns3:AuthenticationTicket'][0] = authTokenInResp
  var shipmentObject = asendiaShipmentAPIRequestAsJsonObj['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['ns1:AddAndPrintShipmentRequest'][0]['ns1:Shipment'][0];
  var shipmentToAddressObject = shipmentObject['ns2:Addresses'][0]['ns2:Address'][0];
  shipmentToAddressObject['ns2:Address1'][0] = body.to_address.address_1;
  shipmentToAddressObject['ns2:City'][0] = body.to_address.city;


  if (body.to_address.company_name && body.to_address.company_name != '' && body.to_address.company_name.trim() != '') {
    shipmentToAddressObject['ns2:Contact'][0] = body.to_address.name;
    shipmentToAddressObject['ns2:Name'][0] = body.to_address.company_name;
  } else {
    shipmentToAddressObject['ns2:Name'][0] = body.to_address.name;
  }

  shipmentToAddressObject['ns2:Email'][0] = body.to_address.email;
  shipmentToAddressObject['ns2:ISOCountry'][0] = body.to_address.country;
  shipmentToAddressObject['ns2:Phone'][0] = body.to_address.phone;
  shipmentToAddressObject['ns2:ZipCode'][0] = body.to_address.zip;

  var shipmentAttributeObject = shipmentObject['ns2:Attributes'][0]['ns2:Attribute'];
  var currTime = new Date();
  const orderNumCleaned = body.order_number.replace(/#/g, '');
  shipmentObject['ns2:ShipDate'][0] = currTime.toISOString();
  shipmentObject['ns2:ShipmentIdentifier'][0] = `${orderNumCleaned}P${currTime.getTime()}`;
  shipmentObject['ns2:OrderNumber'][0] =`${orderNumCleaned}P${currTime.getTime()}`;
  shipmentObject['ns2:SenderCode'][0] = "NL21010001"

  var productCodeUsed = ASENDIA_PRODUCT_FULLY_TRACKED_GOODS;
  var packages = body.packages;
  if (Array.isArray(packages)) {
    if (packages[0].weight_in_oz) {
      shipmentObject['ns2:Weight'][0] = parseFloat(packages[0].weight_in_oz) * OZ_TO_KG_MULTIPLIER;
      shipmentObject['ns2:Weight'][0] = shipmentObject['ns2:Weight'][0].toFixed(3);

      // get attribute codes and populate




      shipmentAttributeObject[2]['ns2:Value'][0] = ASENDIA_PRODUCT_FULLY_TRACKED_GOODS;
      shipmentAttributeObject[3]['ns2:Value'][0] = ASENDIA_SERVICE;
      shipmentAttributeObject[5]['ns2:Value'][0] = ASENDIA_FORMAT_NON_BOXABLE;


    }

    var parcelObject = shipmentObject['ns2:Parcels'][0]['ns2:Parcel'][0];
    if (packages[0].height) {
      parcelObject['ns2:Height'][0] = (packages[0].height / 100).toFixed(3); // convert cm to m
    }
    if (packages[0].length) {
      parcelObject['ns2:Length'][0] = (packages[0].length / 100).toFixed(3); // convert cm to m
    }
    if (packages[0].width) {
      parcelObject['ns2:Width'][0] = (packages[0].width / 100).toFixed(3); // convert cm to m
    }
    parcelObject['ns2:ParcelIdentifier'][0] = shipmentObject['ns2:ShipmentIdentifier'][0];
    parcelObject['ns2:Weight'][0] = shipmentObject['ns2:Weight'][0];


    var lineItemObjects = parcelObject['ns2:OrderLines'][0]['ns2:OrderLine'];


    //packages[0].line_items.sort((a: any, b: any) => (a.ignore_on_customs === b.ignore_on_customs) ? 0 : (a.ignore_on_customs ? -1 : 1));


    var itemsToCopyArray = packages[0].line_items.filter((l: any) => !l.ignore_on_customs);
    var itemsToCopy = itemsToCopyArray.length;


    var tempWorkingIndex = 1; // because by default there is one item already present in xml

    while (itemsToCopy > 1) {
      //for(let i =0 ;i<body.)
      if (!(packages[0].line_items[packages[0].line_items.length - itemsToCopy].ignore_on_customs)) {

        lineItemObjects[tempWorkingIndex] = {};
        lineItemObjects[tempWorkingIndex]['ns2:CountryOfOrigin'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:CountryOfOrigin'][0] = lineItemObjects[0]['ns2:CountryOfOrigin'][0];
        lineItemObjects[tempWorkingIndex]['ns2:Currency'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:Currency'][0] = lineItemObjects[0]['ns2:Currency'][0];
        lineItemObjects[tempWorkingIndex]['ns2:Description1'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:Description1'][0] = lineItemObjects[0]['ns2:Description1'][0];
        lineItemObjects[tempWorkingIndex]['ns2:HarmonizationCode'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:HarmonizationCode'][0] = lineItemObjects[0]['ns2:HarmonizationCode'][0];
        lineItemObjects[tempWorkingIndex]['ns2:OrderLineNumber'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:OrderLineNumber'][0] = lineItemObjects[0]['ns2:OrderLineNumber'][0];
        lineItemObjects[tempWorkingIndex]['ns2:ProductNumber'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:ProductNumber'][0] = lineItemObjects[0]['ns2:ProductNumber'][0];
        lineItemObjects[tempWorkingIndex]['ns2:QuantityShipped'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:QuantityShipped'][0] = lineItemObjects[0]['ns2:QuantityShipped'][0];
        lineItemObjects[tempWorkingIndex]['ns2:UnitOfMeasure'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:UnitOfMeasure'][0] = lineItemObjects[0]['ns2:UnitOfMeasure'][0];
        lineItemObjects[tempWorkingIndex]['ns2:UnitPrice'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:UnitPrice'][0] = lineItemObjects[0]['ns2:UnitPrice'][0];
        lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'][0] = lineItemObjects[0]['ns2:UnitWeight'][0];
        lineItemObjects[tempWorkingIndex]['ns2:Weight'] = [];
        lineItemObjects[tempWorkingIndex]['ns2:Weight'][0] = lineItemObjects[0]['ns2:Weight'][0];
        tempWorkingIndex++;
        itemsToCopy--;
      }
    }

    tempWorkingIndex = 0;
    // for (let i = 0; i < packages.length; i++) {
    for (let i = 0; i < packages[0].line_items.length; i++) {
      if (!(packages[0].line_items[i].ignore_on_customs)) {

        lineItemObjects[tempWorkingIndex]['ns2:CountryOfOrigin'][0] = packages[0].line_items[i].country_of_manufacture;

        let orderCurrency = "EUR";
        

        // TODO temporary Norway check. Need to fix it properly later.
        if (body.to_address.country == 'NO' || body.to_address.country == 'CH') {
          orderCurrency = 'EUR';
        }

        lineItemObjects[tempWorkingIndex]['ns2:Currency'][0] = orderCurrency;
        lineItemObjects[tempWorkingIndex]['ns2:Description1'][0] = packages[0].line_items[i].customs_description;
        // send sequential/incremental number instead of line number received from ShipHero
        // asendiaShipmentAPIParamsAsJson.parcel.lineItem.orderLineNumber = packages[0].line_items[0].partner_line_item_id;
        lineItemObjects[tempWorkingIndex]['ns2:OrderLineNumber'][0] = `${i + 1}`;
        lineItemObjects[tempWorkingIndex]['ns2:QuantityShipped'][0] = packages[0].line_items[i].quantity;
        // lineItemObjects[tempWorkingIndex]['ns2:ProductNumber'][0] =i ;

        let priceAsFloat = 0.0;
        if (packages[0].line_items[i].price !== null
          && packages[0].line_items[i].price !== '') {
          priceAsFloat = parseFloat(packages[0].line_items[i].price);
        }

        if (body.order_number.indexOf('BBSPY') >= 0) {
          priceAsFloat = 25.0;
        } else {

          // TODO - temporary fix below to keep Asendia quiet. Need to remove this alteration when ShipHero fixes 0.0 price error
          if (priceAsFloat == 0.0) {
            priceAsFloat = 1.0;
          }

          // TODO temporary Norway check. Need to fix it properly later.
          if (body.to_address.country == 'NO' || body.to_address.country == 'CH') {
            priceAsFloat = 3.0;
          }

          if (body.to_address.country == 'IL'
            && (('' + body.account_id) == '59965') || (('' + body.account_id) == '63984') || (('' + body.account_id) == '63932')) {
            priceAsFloat = 5.0;
          }

          if (priceAsFloat > 5.0) {
            if (body.to_address.country == 'GB'
              && (('' + body.account_id) == '59965') || (('' + body.account_id) == '63984') || (('' + body.account_id) == '63932')) {
              priceAsFloat = 3.0;
            }
          }
        }

        lineItemObjects[tempWorkingIndex]['ns2:UnitPrice'][0] = priceAsFloat;

        const hsCodeWitoutDots = packages[0].line_items[i].tariff_code.replace(/\./g, '');
        lineItemObjects[tempWorkingIndex]['ns2:HarmonizationCode'][0] = hsCodeWitoutDots;

        if (packages[0].line_items[i].weight) {
          lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'][0] = parseFloat(packages[0].line_items[i].weight) * OZ_TO_KG_MULTIPLIER;
          lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'][0] = lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'][0].toFixed(3);
          lineItemObjects[tempWorkingIndex]['ns2:Weight'][0] = lineItemObjects[tempWorkingIndex]['ns2:UnitWeight'][0] * parseInt(lineItemObjects[tempWorkingIndex]['ns2:QuantityShipped'][0]);
          lineItemObjects[tempWorkingIndex]['ns2:Weight'][0] = lineItemObjects[tempWorkingIndex]['ns2:Weight'][0].toFixed(3);
        }
    
        tempWorkingIndex++;
      }
    }
    

    
  }
  let shipmentXmlWithValues = '';
  reqHeaders.SOAPAction = ASENDIA_SHIPMENT_SOAP_ACTION;

  var shipmentXmlBuilder = new xml2js.Builder();
  shipmentXmlWithValues = shipmentXmlBuilder.buildObject(asendiaShipmentAPIRequestAsJsonObj);
  console.log(shipmentXmlWithValues)

  var url2 = ASENDIA_SHIPMENT_URL_PROD;
  let responseLabel  : any= await fetch(url2, {
    method: 'POST',
    headers: reqHeaders,
    body: shipmentXmlWithValues,
  }).catch(error => console.log('Fetch error:', error));
  
  console.timeEnd();

  const textResponse2 = await responseLabel.text();
  console.log(textResponse2);

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


const getShipmentXml = function () {
  const xml = ' \
          <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://centiro.com/facade/tmsBasic/1/0/servicecontract" xmlns:ns2="http://schemas.datacontract.org/2004/07/Centiro.Facade.TMSBasic.Contract.c1.i1.TMSBasic.BaseTypes.DTO" xmlns:ns3="http://centiro.com/facade/shared/1/0/datacontract" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> \
            <SOAP-ENV:Header> \
              <ns3:AuthenticationTicket></ns3:AuthenticationTicket> \
            </SOAP-ENV:Header> \
            <SOAP-ENV:Body> \
              <ns1:AddAndPrintShipmentRequest> \
                <ns1:LabelType>PDF</ns1:LabelType> \
                <ns1:Shipment> \
                  <ns2:Addresses> \
                    <ns2:Address> \
                      <ns2:Address1></ns2:Address1> \
                      <ns2:AddressType>Receiver</ns2:AddressType> \
                      <ns2:CellPhone></ns2:CellPhone> \
                      <ns2:City></ns2:City> \
                      <ns2:Contact></ns2:Contact> \
                      <ns2:Email></ns2:Email> \
                      <ns2:ISOCountry></ns2:ISOCountry> \
                      <ns2:Name></ns2:Name> \
                      <ns2:Phone></ns2:Phone> \
                      <ns2:ZipCode></ns2:ZipCode> \
                    </ns2:Address> \
                  </ns2:Addresses> \
                  <ns2:Attributes> \
                    <ns2:Attribute> \
                      <ns2:Code>OriginSub</ns2:Code> \
                      <ns2:Value>NL</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>CRMID</ns2:Code> \
                      <ns2:Value>NL21010001</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>Product</ns2:Code> \
                      <ns2:Value>EPAQPLS</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>Service</ns2:Code> \
                      <ns2:Value>CUP</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>AdditionalService</ns2:Code> \
                      <ns2:Value>PD</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>Format</ns2:Code> \
                      <ns2:Value>N</ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>SenderTaxID</ns2:Code> \
                      <ns2:Value>GB339713089000</ns2:Value> \
                    </ns2:Attribute> \
                  </ns2:Attributes> \
                  <ns2:ModeOfTransport>ACSS</ns2:ModeOfTransport> \
                  <ns2:OrderNumber></ns2:OrderNumber> \
                  <ns2:Parcels> \
                    <ns2:Parcel> \
                      <ns2:Height></ns2:Height> \
                      <ns2:Length></ns2:Length> \
                      <ns2:OrderLines> \
                        <ns2:OrderLine> \
                          <ns2:CountryOfOrigin>NL</ns2:CountryOfOrigin> \
                          <ns2:Currency></ns2:Currency> \
                          <ns2:Description1></ns2:Description1> \
                          <ns2:HarmonizationCode></ns2:HarmonizationCode> \
                          <ns2:OrderLineNumber></ns2:OrderLineNumber> \
                          <ns2:ProductNumber></ns2:ProductNumber> \
                          <ns2:QuantityShipped></ns2:QuantityShipped> \
                          <ns2:UnitOfMeasure>EA</ns2:UnitOfMeasure> \
                          <ns2:UnitPrice></ns2:UnitPrice> \
                          <ns2:UnitWeight></ns2:UnitWeight> \
                          <ns2:Weight></ns2:Weight> \
                        </ns2:OrderLine> \
                      </ns2:OrderLines> \
                      <ns2:ParcelIdentifier></ns2:ParcelIdentifier> \
                      <ns2:TypeOfGoods>Goods</ns2:TypeOfGoods> \
                      <ns2:TypeOfPackage></ns2:TypeOfPackage> \
                      <ns2:Weight></ns2:Weight> \
                      <ns2:Width></ns2:Width> \
                    </ns2:Parcel> \
                  </ns2:Parcels> \
                  <ns2:SenderCode></ns2:SenderCode> \
                  <ns2:ShipDate></ns2:ShipDate> \
                  <ns2:ShipmentIdentifier></ns2:ShipmentIdentifier> \
                  <ns2:ShipmentType>OUTB</ns2:ShipmentType> \
                  <ns2:TermsOfDelivery>DDP</ns2:TermsOfDelivery> \
                  <ns2:Weight></ns2:Weight> \
                </ns1:Shipment> \
              </ns1:AddAndPrintShipmentRequest> \
            </SOAP-ENV:Body> \
          </SOAP-ENV:Envelope> \
          ';

  return xml;
}


// const getShipmentXml = function () {
//   const xml = `
//       <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://centiro.com/facade/tmsBasic/1/0/servicecontract" xmlns:ns2="http://schemas.datacontract.org/2004/07/Centiro.Facade.TMSBasic.Contract.c1.i1.TMSBasic.BaseTypes.DTO" xmlns:ns3="http://centiro.com/facade/shared/1/0/datacontract" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
//         <SOAP-ENV:Header>
//           <ns3:AuthenticationTicket>ERjX...blg%3d</ns3:AuthenticationTicket>
//         </SOAP-ENV:Header>
//         <SOAP-ENV:Body>
//           <ns1:AddAndPrintShipmentRequest>
//             <ns1:LabelType>PDF</ns1:LabelType>
//             <ns1:Shipment>
//               <ns2:Addresses>
//                 <ns2:Address>
//                   <ns2:Address1>73 Caledonian Rd</ns2:Address1>
//                   <ns2:AddressType>Receiver</ns2:AddressType>
//                   <ns2:CellPhone></ns2:CellPhone>
//                   <ns2:City>London</ns2:City>
//                   <ns2:Contact>Peter Bear</ns2:Contact>
//                   <ns2:Email>peterbear@gmail.co.uk</ns2:Email>
//                   <ns2:ISOCountry>GB</ns2:ISOCountry>
//                   <ns2:Name>London Bear Hotel</ns2:Name>
//                   <ns2:Phone>+442072780206</ns2:Phone>
//                   <ns2:ZipCode>N1 9BT</ns2:ZipCode>
//                 </ns2:Address>
//               </ns2:Addresses>
//               <ns2:Attributes>
//                 <ns2:Attribute>
//                   <ns2:Code>OriginSub</ns2:Code>
//                   <ns2:Value>AU</ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>CRMID</ns2:Code>
//                   <ns2:Value>AU19060001</ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>Product</ns2:Code>
//                   <ns2:Value>EPAQPLS</ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>Service</ns2:Code>
//                   <ns2:Value>CUP</ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>AdditionalService</ns2:Code>
//                   <ns2:Value></ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>Format</ns2:Code>
//                   <ns2:Value>B</ns2:Value>
//                 </ns2:Attribute>
//                 <ns2:Attribute>
//                   <ns2:Code>SenderTaxID</ns2:Code>
//                   <ns2:Value>GB1234567891</ns2:Value>
//                 </ns2:Attribute>
//               </ns2:Attributes>
//               <ns2:ModeOfTransport>ACSS</ns2:ModeOfTransport>
//               <ns2:OrderNumber>REF20210614001</ns2:OrderNumber>
//               <ns2:Parcels>
//                 <ns2:Parcel>
//                   <ns2:OrderLines>
//                     <ns2:OrderLine>
//                       <ns2:CountryOfOrigin>AU</ns2:CountryOfOrigin>
//                       <ns2:Currency>AUD</ns2:Currency>
//                       <ns2:Description1>Blue Watch</ns2:Description1>
//                       <ns2:HarmonizationCode>910310</ns2:HarmonizationCode>
//                       <ns2:OrderLineNumber>1</ns2:OrderLineNumber>
//                       <ns2:ProductNumber>WBLUE12345</ns2:ProductNumber>
//                       <ns2:QuantityShipped>2</ns2:QuantityShipped>
//                       <ns2:UnitOfMeasure>EA</ns2:UnitOfMeasure>
//                       <ns2:UnitPrice>10</ns2:UnitPrice>
//                       <ns2:UnitWeight></ns2:UnitWeight>
//                       <ns2:Weight>0.2</ns2:Weight>
//                     </ns2:OrderLine>
//                     <ns2:OrderLine>
//                       <ns2:CountryOfOrigin>AU</ns2:CountryOfOrigin>
//                       <ns2:Currency>AUD</ns2:Currency>
//                       <ns2:Description1>Red Watch</ns2:Description1>
//                       <ns2:HarmonizationCode>910310</ns2:HarmonizationCode>
//                       <ns2:OrderLineNumber>2</ns2:OrderLineNumber>
//                       <ns2:ProductNumber>WRED12345</ns2:ProductNumber>
//                       <ns2:QuantityShipped>3</ns2:QuantityShipped>
//                       <ns2:UnitOfMeasure>EA</ns2:UnitOfMeasure>
//                       <ns2:UnitPrice>30</ns2:UnitPrice>
//                       <ns2:UnitWeight></ns2:UnitWeight>
//                       <ns2:Weight>0.9</ns2:Weight>
//                     </ns2:OrderLine>
//                   </ns2:OrderLines>
//                   <ns2:ParcelIdentifier>ACME20210614001</ns2:ParcelIdentifier>
//                   <ns2:TypeOfGoods>Goods</ns2:TypeOfGoods>
//                   <ns2:Weight>1.2</ns2:Weight>
//                 </ns2:Parcel>
//               </ns2:Parcels>
//               <ns2:SenderCode>AU19060001</ns2:SenderCode>
//               <ns2:ShipDate>2021-06-14T18:12:47</ns2:ShipDate>
//               <ns2:ShipmentIdentifier>ACME20210614001</ns2:ShipmentIdentifier>
//               <ns2:ShipmentType>OUTB</ns2:ShipmentType>
//               <ns2:TermsOfDelivery>DDP</ns2:TermsOfDelivery>
//               <ns2:Weight>1.2</ns2:Weight>
//             </ns1:Shipment>
//           </ns1:AddAndPrintShipmentRequest>
//         </SOAP-ENV:Body>
//       </SOAP-ENV:Envelope>
//   `;
  
//   return xml;
// }

const getAuthXml = function () {
  const xml = ' \
          <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://centiro.com/facade/shared/1/0/datacontract" xmlns:ns2="http://centiro.com/facade/shared/1/0/servicecontract" xmlns:ns3="http://schemas.datacontract.org/2004/07/Centiro.Facade.Common.Operations.Authenticate"> \
            <SOAP-ENV:Header> \
              <ns1:MessageId>?</ns1:MessageId> \
            </SOAP-ENV:Header> \
            <SOAP-ENV:Body> \
              <ns2:AuthenticateRequest> \
                <ns3:Password>' + process.env.ASENDIA_PASSWORD + '</ns3:Password> \
                <ns3:UserName>' + process.env.ASENDIA_USERNAME + '</ns3:UserName> \
              </ns2:AuthenticateRequest> \
            </SOAP-ENV:Body> \
          </SOAP-ENV:Envelope> \
          ';

  return xml;
}