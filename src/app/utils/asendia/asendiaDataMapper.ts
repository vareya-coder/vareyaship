import { config } from "dotenv";
import xml2js from 'xml2js';
import { logger } from '@/utils/logger'

config()

export function asendiaMapper(body : any ,authTokenInResp : any ){
    

  


    const ASENDIA_PRODUCT_EPAQPLS = 'EPAQPLS';
    const ASENDIA_PRODUCT_EPAQSCT = 'EPAQSCT';
    const ASENDIA_SERVICE = 'CUP';
    const ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY = 'PD'
    const ASENDIA_ADDL_SERVICE_MAIL_DELIVERY = 'MD'
    const ASENDIA_ADDL_SERVICE_SIG = 'SIG'
    const ASENDIA_FORMAT_NON_BOXABLE = 'N';
    const ASENDIA_FORMAT_BOXABLE = 'B';
    

  
    const OZ_TO_KG_MULTIPLIER = 0.0283495231;



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
    if (body.to_address.address_2) {
      let found = body.to_address.address_2.match(/^[0-9]+/g);
      if (found) {
        shipmentToAddressObject['ns2:Address1'][0] = body.to_address.address_1 + ' ' + body.to_address.address_2
      } else {
        shipmentToAddressObject['ns2:Address2'][0] = body.to_address.address_2;
      }
    }
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
    logger.info(orderNumCleaned);
    shipmentObject['ns2:ShipDate'][0] = currTime.toISOString();
    shipmentObject['ns2:ShipmentIdentifier'][0] = `${orderNumCleaned}P${currTime.getTime()}`;
    shipmentObject['ns2:OrderNumber'][0] =`${orderNumCleaned}P${currTime.getTime()}`;
  
    var packages = body.packages;
    if (Array.isArray(packages)) {
      if (packages[0].weight_in_oz) {
        shipmentObject['ns2:Weight'][0] = parseFloat(packages[0].weight_in_oz) * OZ_TO_KG_MULTIPLIER;
        shipmentObject['ns2:Weight'][0] = shipmentObject['ns2:Weight'][0].toFixed(3);
      }
      // get attribute codes and populate
      if (body.shipping_method.includes('epaqpls')) {
        shipmentAttributeObject[2]['ns2:Value'][0] = ASENDIA_PRODUCT_EPAQPLS;
      } else if (body.shipping_method.includes('epaqsct')) {
        shipmentAttributeObject[2]['ns2:Value'][0] = ASENDIA_PRODUCT_EPAQSCT;
      }
  
      shipmentAttributeObject[3]['ns2:Value'][0] = ASENDIA_SERVICE;
  
      if (body.shipping_method.includes('personal-delivery')) {
        shipmentAttributeObject[4]['ns2:Value'][0] = ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY;
      } else if (body.shipping_method.includes('mailbox-delivery')) {
        shipmentAttributeObject[4]['ns2:Value'][0] = ASENDIA_ADDL_SERVICE_MAIL_DELIVERY;
      } else if (body.shipping_method.includes('signature')) {
        shipmentAttributeObject[4]['ns2:Value'][0] = ASENDIA_ADDL_SERVICE_SIG;
      } else {
        delete shipmentAttributeObject[4];
      }
      
      if (body.shipping_method.includes('boxable')) {
        shipmentAttributeObject[5]['ns2:Value'][0] = ASENDIA_FORMAT_BOXABLE;
      } else {
        shipmentAttributeObject[5]['ns2:Value'][0] = ASENDIA_FORMAT_NON_BOXABLE;
      }
  
      //<option value="72262">712Brands</option>
      //<option value="70626">Bateel International</option>
  
      
      const asendiaIDs = [
        // { customer: 'Menskin', accountId: '59965', crmId: 'NL21010001', senderTaxCode: 'GB374774750'},
        { customer: 'Menskin', accountId: '59965', crmId: 'NL21010001', senderTaxCode: 'GB339713089000'},
        { customer: 'Vacier', accountId: '73982', crmId: 'NL21080010', senderTaxCode: 'GB289337944'},
        { customer: 'VUE', accountId: '74928', crmId: 'NL24010007', senderTaxCode: 'GB289337944'},
        { customer: 'SanaDIGEST', accountId: '63819', crmId: 'NL21110007', senderTaxCode: 'FR48884514688'},
        { customer: 'PRIMAL FX', accountId: '71893', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Fan Of Fan', accountId: '70098', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'PSBC Limited', accountId: '69949', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Dino Lifestyle', accountId: '73490', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Bryght Labs', accountId: '68917', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Tipaw', accountId: '81021', crmId: 'NL24120003', senderTaxCode: ''},
        // Vareya BV - OTC Group
        { customer: 'Ship2me', accountId: '85552', crmId: 'NL25040001', senderTaxCode: 'GB289337944'},
        // Vareya BV - Norwegian Lab
        { customer: 'NorwegianLab', accountId: '85165', crmId: 'NL25040002', senderTaxCode: 'GB289337944'},

        { customer: 'Elevitae', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},        
        { customer: 'Milan Shah', accountId: '', crmId: 'NL21080009', senderTaxCode: 'GB289337944'},        
        // { customer: 'Meridian', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},      
        { customer: 'Meridian', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB339713089000'},
        { customer: 'Zitsticka', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Caterpy', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        // { customer: 'Lumin Skin', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Lumin Skin', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB339713089000'},
        { customer: 'Mfoodproduct', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Moneclat', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Youth Earth', accountId: '', crmId: 'Youth Earth', senderTaxCode: 'GB289337944'},
        { customer: 'Keith Teh', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Arabeaute', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Coolado', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Saga Fitness', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Glamnetic', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Arena', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Crosshkt', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'Sanalyslab', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'},
        { customer: 'I Am Authentic BV', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944'}
      ];

// Vareya BV - Milan Shah NL21080009
// Vareya BV - Meridian  NL20070003
// Vareya BV - Zitsticka  NL21090005
// Vareya BV - Caterpy  NL20110003 
// Vareya BV - Lumin Skin  NL21010001
// Vareya BV - Mfoodproduct  NL20110006
// Vareya BV - Moneclat  NL21080012
// Vareya BV - Youth Earth (inactive)  NL21010003
// Vareya BV - Keith Teh  NL21080011
// Vareya BV - Arabeaute  NL20110005
// Vareya BV - Coolado  NL20110007
// Vareya BV - Saga Fitness  NL21010004
// Vareya BV - Glamnetic  NL21090006
// Vareya BV - Arena  NL21030017
// Vareya BV - Crosshkt  NL20110004
// Vareya BV - Sanalyslab  NL21110007
// Vareya BV - Vacier  NL21080010
// Vareya BV - Youth Earth  NL21080013
// Vareya BV - I Am Authentic BV  NL20100008
// Vareya BV  NL19090016

      let filteredIDs = asendiaIDs.filter((rec) => {
        return rec.accountId == body.account_id.toString()
      });
  
      logger.info(JSON.stringify(filteredIDs));
  
      if (filteredIDs && Array.isArray(filteredIDs) && filteredIDs.length > 0) {
        shipmentAttributeObject[1]['ns2:Value'][0] = filteredIDs[0].crmId;
        logger.info('-' + filteredIDs[0].senderTaxCode + '-');
        if (filteredIDs[0].senderTaxCode) {
          logger.info(filteredIDs[0].senderTaxCode + ' added');
          shipmentAttributeObject[6]['ns2:Value'][0] = filteredIDs[0].senderTaxCode;
        }
        
      }

      shipmentObject['ns2:SenderCode'][0] = filteredIDs[0].crmId; // "NL21010001"
  
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
      var itemsToCopyArray = packages[0].line_items.filter((l: any) => !l.ignore_on_customs);
      var itemsToCopy = itemsToCopyArray.length;
      var tempWorkingIndex = 1; // because by default there is one item already present in xml
  
      while (itemsToCopy > 1) {
       
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
  
            // TODO temporary Norway, Switzerland. Need to fix it properly later.
            if (body.to_address.country == 'NO' || body.to_address.country == 'CH') {
              priceAsFloat = 3.0;
            }
  
            // TODO temporary Turkey check. Need to fix it properly later.
            if (body.to_address.country == 'TR') {
              priceAsFloat = [0.75, 0.8, 0.85, 0.9].at(Math.floor(Math.random() * 4)) as number;
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
    var shipmentXmlBuilder = new xml2js.Builder();
    shipmentXmlWithValues = shipmentXmlBuilder.buildObject(asendiaShipmentAPIRequestAsJsonObj);
    logger.info(shipmentXmlWithValues)
    return shipmentXmlWithValues
}


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
                      <ns2:Address2></ns2:Address2> \
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
                      <ns2:Value></ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>Service</ns2:Code> \
                      <ns2:Value></ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>AdditionalService</ns2:Code> \
                      <ns2:Value></ns2:Value> \
                    </ns2:Attribute> \
                    <ns2:Attribute> \
                      <ns2:Code>Format</ns2:Code> \
                      <ns2:Value></ns2:Value> \
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
  
  
  
 export  const  getAuthXml = function () {
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