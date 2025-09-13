import { ShipHeroWebhook, AsendiaParcelRequest,  } from "../types"; // Assuming this path is correct
import { config } from 'dotenv';
import { logger } from '@/utils/logger'
import { Decimal } from 'decimal.js'; 

// Constants
const ASENDIA_PRODUCT_EPAQPLS = 'EPAQPLS';
const ASENDIA_PRODUCT_EPAQSCT = 'EPAQSCT';
const ASENDIA_SERVICE = 'CUP';
const ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY = 'PD'
const ASENDIA_ADDL_SERVICE_MAIL_DELIVERY = 'MD'
const ASENDIA_ADDL_SERVICE_SIG = 'SIG'
const ASENDIA_FORMAT_NON_BOXABLE = 'N';
const ASENDIA_FORMAT_BOXABLE = 'B';
// Conversion factor from Ounces to Kilograms
// 1 ounce = 0.0283495231 kilograms
const OZ_TO_KG_MULTIPLIER = 0.0283495231;

config(); // Load environment variables from .env file

// 1. Type Definitions for Asendia API
// It's good practice to define the data structures we'll be working with. Let's create a file named asendiatypes.ts.

// src/asendiatypes.ts

// 2. New Asendia Shipping Handler
// Following contains the mapping logic and the functions to call the Asendia REST APIs using axios. It mirrors the structure and intent of your original PostNL file.

// src/asendia-handler.ts


/**
 * Maps ShipHero webhook data to the Asendia parcel creation request format.
 * This is a helper function that prepares the request body.
 * 
 * @param shipHeroData - The incoming webhook data from ShipHero.
 * @param customerId - The Asendia Customer ID.
 * @returns The request body object for the Asendia /api/parcels endpoint.
 */
export function mapShipHeroToAsendia(shipHeroData: ShipHeroWebhook): AsendiaParcelRequest {
    
    // Helper to convert weight from Ounces (oz) to Kilograms (kg)
    function convertOzToKg(weightInOz: number): number {
        const grams = new Decimal(weightInOz).times(new Decimal(28.3495)).dividedBy(1000).toDecimalPlaces(3).toNumber();
        return grams; // Asendia API requires weight in KG
    }

    // Helper to calculate the total weight of all items in the shipment
    function getTotalWeightKg(): number {
        let totalWeightKg = new Decimal(0);
        // let totalWeightO = 0;
        shipHeroData.packages.forEach(packageItem => {
            if (packageItem.line_items && Array.isArray(packageItem.line_items)) {
                packageItem.line_items.forEach(lineItem => {
                  let itemWeightInTotalCalc = new Decimal(lineItem.weight || 0).toDecimalPlaces(3);
                  // console.log(`Item weight in Total Calc oz: ${itemWeightInTotalCalc}`);
                  let itemWeightInTotalCalcInKg = convertOzToKg(itemWeightInTotalCalc.toDecimalPlaces(3).toNumber());
                  // console.log(`Item weight in Total Calc kg: ${itemWeightInTotalCalcInKg}`);
                  totalWeightKg = totalWeightKg.plus(itemWeightInTotalCalcInKg);
                });
            }
        });
        // console.log(`Total weight in kg: ${totalWeightKg.toDecimalPlaces(3).toNumber()}`);
        return totalWeightKg.toDecimalPlaces(4).toNumber();
    }
    
    // Normalize country code for Great Britain
    if (shipHeroData.to_address.country === 'UK') {
        shipHeroData.to_address.country = 'GB';
    }

    let shipmentToAddress1 = shipHeroData.to_address.address_1;
    let shipmentToAddress2 = '';
    if (shipHeroData.to_address.address_2) {
      let found = shipHeroData.to_address.address_2.match(/^[0-9]+/g);
      if (found && !shipHeroData.to_address.address_1.match(/^[0-9]+/g)) {
        shipmentToAddress1 = shipHeroData.to_address.address_1 + ' ' + shipHeroData.to_address.address_2
      } else {
        shipmentToAddress2 = shipHeroData.to_address.address_2;
      }
    }
    
    let shipmentToAddressName = shipHeroData.to_address.name;
    let shipmentToAddressCompanyName = shipHeroData.to_address.company_name;
    if (!(shipHeroData.to_address.name 
      && shipHeroData.to_address.name != '' 
      && shipHeroData.to_address.name.trim() != '')) {
      
        shipmentToAddressName = shipHeroData.to_address.company_name;
    }

    // Clean the order number for use as a reference
    const orderNumCleaned = shipHeroData.order_number.replace(/[#A-Z-]+/gi, '');
    var currTime = new Date();
    const referenceNumber = `${orderNumCleaned}P${currTime.getTime()}`;
    const sequenceNumber = `${currTime.getTime()}`;
    logger.info(orderNumCleaned);
    logger.info(referenceNumber);
    logger.info(sequenceNumber);

    // get attribute codes and populate
    let shipmentAsendiaProduct = '';
    let shipmentAsendiaService = '';
    let shipmentAsendiaAddlService: string[] = [];
    if (shipHeroData.shipping_method.includes('epaqpls')) {
      shipmentAsendiaProduct = ASENDIA_PRODUCT_EPAQPLS;
    } else if (shipHeroData.shipping_method.includes('epaqsct')) {
      shipmentAsendiaProduct = ASENDIA_PRODUCT_EPAQSCT;
    }

    shipmentAsendiaService = ASENDIA_SERVICE;

    // Determine additional services based on shipping method
    // This logic assumes that the shipping_method string contains specific keywords.
    // Adjust the conditions based on your actual shipping method naming conventions.

    if (shipHeroData.shipping_method.includes('personal-delivery')) {
      shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY];
    } else if (shipHeroData.shipping_method.includes('mailbox-delivery')) {
      shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_MAIL_DELIVERY];
    } else if (shipHeroData.shipping_method.includes('signature')) {
      shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_SIG];
    }
    
    let shipmentAsendiaFormat:"N" | "B" = ASENDIA_FORMAT_NON_BOXABLE;
    if (shipHeroData.shipping_method.includes('boxable')) {
      shipmentAsendiaFormat = ASENDIA_FORMAT_BOXABLE;
    } else {
      shipmentAsendiaFormat = ASENDIA_FORMAT_NON_BOXABLE;
    }

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
      return rec.accountId == shipHeroData.account_id.toString()
    });
  
    logger.info(JSON.stringify(filteredIDs));
  
    let shipmentCustomer = '';
    let shipmentCustomerCrmId = '';
    let shipmentCustomerSenderTaxCode = ''
    if (filteredIDs && Array.isArray(filteredIDs) && filteredIDs.length > 0) {
      shipmentCustomer = filteredIDs[0].customer;
      shipmentCustomerCrmId = filteredIDs[0].crmId;
      logger.info('-' + filteredIDs[0].senderTaxCode + '-');
      if (filteredIDs[0].senderTaxCode) {
        logger.info(filteredIDs[0].senderTaxCode + ' added');
        shipmentCustomerSenderTaxCode = filteredIDs[0].senderTaxCode;
      }
    }

    // Construct the main request body for Asendia
    const asendiaRequestData: AsendiaParcelRequest = {
        customerId: shipmentCustomerCrmId,
        labelType: "PDF",
        referencenumber: referenceNumber,
        sequencenumber: sequenceNumber,
        senderTaxId: shipmentCustomerSenderTaxCode,
        weight: getTotalWeightKg(),
        
        // This is a default service configuration. This might need to be dynamic
        // based on destination, weight, or other business rules.
        asendiaService: {
            format: shipmentAsendiaFormat, // B=Box, P=Packet
            product: shipmentAsendiaProduct,
            service: shipmentAsendiaService,
            options: shipmentAsendiaAddlService,
            insurance: "",
            returnLabelOption: {
              enabled: false,
              type: "",
              payment: ""
            }
        },

        addresses: {
            sender: {
                name: shipmentCustomer,
                company: shipmentCustomer,
                address1: "Bagven Park 6",
                address2: "",
                address3: "",
                postalCode: "4838EH",
                city: "Breda",
                // province: "Noord-Brabant", // Full province name with longer name length restricted by Asendia API
                province: "Brabant",
                country: "NL",
                email: "info@vareya.nl",
                phone: "0763030540"
            },
            receiver: {
                name: shipmentToAddressName,
                company: shipmentToAddressCompanyName,
                address1: shipmentToAddress1,
                address2: shipmentToAddress2,
                postalCode: shipHeroData.to_address.zip,
                city: shipHeroData.to_address.city,
                country: shipHeroData.to_address.country,
                email: shipHeroData.to_address.email,
                phone: shipHeroData.to_address.phone
            },
            // Assuming the receiver is also the importer.
            // This might need to be adjusted based on business logic.
            importer: {
                name: shipmentToAddressName,
                company: shipmentToAddressCompanyName,
                address1: shipmentToAddress1,
                address2: shipmentToAddress2,
                postalCode: shipHeroData.to_address.zip,
                city: shipHeroData.to_address.city,
                country: shipHeroData.to_address.country,
                email: shipHeroData.to_address.email,
                phone: shipHeroData.to_address.phone
            }
        },
    };

    // Add customs information for international shipments.
    // NOTE: This logic assumes all non-NL shipments are international and require customs.
    // Adjust the condition if your sender is not in the EU or if you ship within the EU.
    // if (shipHeroData.from_address.country !== shipHeroData.to_address.country) {

      let orderCurrency = "EUR";
      
      // TODO temporary Norway check. Need to fix it properly later.
      if (shipHeroData.to_address.country == 'NO' || shipHeroData.to_address.country == 'CH') {
        orderCurrency = 'EUR';
      }

      asendiaRequestData.customsInfo = {
          currency: orderCurrency,
          items: []
      };

        shipHeroData.packages.forEach((packageData) => {
          packageData.line_items!.forEach((lineItem) => {
            if (!lineItem.ignore_on_customs) {
              let priceAsFloat = 0.0;
              if (lineItem.price !== null) { // && lineItem.price !== '') {
                priceAsFloat = lineItem.price; // parseFloat(lineItem.price);
              }
              // Asendia API might reject 0.0 value items.
              if (priceAsFloat <= 0.0) {
                priceAsFloat = 0.01; // Set a minimum nominal value
              }

              if (shipHeroData.order_number.indexOf('BBSPY') >= 0) {
                priceAsFloat = 25.0;
              } else {
      
                // TODO - temporary fix below to keep Asendia quiet. Need to remove this alteration when ShipHero fixes 0.0 price error
                if (priceAsFloat == 0.0) {
                  priceAsFloat = 1.0;
                }
      
                // TODO temporary Norway, Switzerland. Need to fix it properly later.
                if (shipHeroData.to_address.country == 'NO' || shipHeroData.to_address.country == 'CH') {
                  priceAsFloat = 3.0;
                }
      
                // TODO temporary Turkey check. Need to fix it properly later.
                if (shipHeroData.to_address.country == 'TR') {
                  priceAsFloat = [0.75, 0.8, 0.85, 0.9].at(Math.floor(Math.random() * 4)) as number;
                }

                if (shipHeroData.to_address.country == 'IL'
                  && (('' + shipHeroData.account_id) == '59965') || (('' + shipHeroData.account_id) == '63984') || (('' + shipHeroData.account_id) == '63932')) {
                  priceAsFloat = 5.0;
                }
      
                if (priceAsFloat > 5.0) {
                  if (shipHeroData.to_address.country == 'GB'
                    && (('' + shipHeroData.account_id) == '59965') || (('' + shipHeroData.account_id) == '63984') || (('' + shipHeroData.account_id) == '63932')) {
                    priceAsFloat = 3.0;
                  }
                }
              }

              let unitWeightKg = convertOzToKg(lineItem.weight);

              // console.log('Adding item to customs:', {
              //   articleDescription: lineItem.customs_description || lineItem.name});
              // console.log('Adding item to customs:', {
              //   harmonizationCode: lineItem.tariff_code.replace(/\./g, '')});
              // console.log('Adding item to customs:', {
              //   originCountry: lineItem.country_of_manufacture || "NL"}); // Default origin country
              // console.log('Adding item to customs:', {
              //   unitValue: priceAsFloat,
              //   currency: orderCurrency,
              //   unitWeight: unitWeightKg,
              //   quantity: lineItem.quantity
              // });

              asendiaRequestData.customsInfo!.items.push({
                articleDescription: lineItem.customs_description || lineItem.name,
                unitValue: priceAsFloat,
                currency: orderCurrency,
                harmonizationCode: lineItem.tariff_code.replace(/\./g, ''),
                originCountry: lineItem.country_of_manufacture || "NL", // Default origin country
                unitWeight: unitWeightKg,
                quantity: lineItem.quantity
              });
            }
          });
        });
    // }

    return asendiaRequestData;
}