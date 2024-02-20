import { ShipHeroWebhook } from "../types";
import { Data } from "./postnltypes";
import { config } from 'dotenv';
import axios from "axios";

config();

export async function mapShipHeroToPostNL(shipHeroData: ShipHeroWebhook, Product_code: string) {
    const EU: any = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

    const firstPackage = shipHeroData.packages[0];
    //total weight from oz to grams
    const Weight = firstPackage.weight_in_oz * 28.3495;
    const customer_code: string = process.env.CUSTOMER_CODE as string;
    const customer_number: string = process.env.CUSTOMER_NUMBER as string;
    const barcode: string = await getBarcode(customer_code, customer_number);
    function convertOzToGrams(weightInOz : any) {
        const grams = weightInOz * 28.3495;
        return Math.round(grams);
    }

    if (shipHeroData.to_address.country == 'UK') {
        shipHeroData.to_address.country = 'GB'; 
       
    }

    
    const postNLData: Data = {
        Customer: {
            Address: {
                AddressType: "02",
                City: shipHeroData.from_address.city || ' ',
                Countrycode: shipHeroData.from_address.country || ' ',
                CompanyName: shipHeroData.from_address.company_name || ' ',
                HouseNr: ' ',
                Name: shipHeroData.from_address.name || ' ',
                Street: shipHeroData.from_address.address_1 || ' ',
                Zipcode: shipHeroData.from_address.zip || ' '
            },
            CollectionLocation: "123456",
            ContactPerson: "Janssen",
            CustomerCode: customer_code,
            CustomerNumber: customer_number,
            Email: "email@company.com",
            Name: "Janssen",
        },
        Message: {
            MessageID: "1",
            MessageTimeStamp: new Date().toISOString(),
            Printertype: "GraphicFile|PDF",
        },
        Shipments: [{
            Addresses: [{
                AddressType: "01",
                City: shipHeroData.to_address.city,
                Countrycode: shipHeroData.to_address.country,
                //FirstName: shipHeroData.to_address.name,
                HouseNr: "",
                //HouseNrExt: "a bis",
                Name:shipHeroData.to_address.name,
                Street: shipHeroData.to_address.address_1,
                Zipcode: shipHeroData.to_address.zip,
            }],
            
            Barcode: barcode,
            Contacts: [{
                ContactType: "01",
                Email: shipHeroData.to_address.email || ' ',
                TelNr: shipHeroData.to_address.phone || ' ',
                SMSNr: shipHeroData.to_address.phone,
            }],
            Dimension: {
                Weight: `${Weight}`,
            },
            ProductCodeDelivery: Product_code,
            Reference: "reference for Sender"
        }],
    };

    //Check if the destination country is not in the EU
    if (!EU.includes(shipHeroData.to_address.country)) {
        shipHeroData.packages.forEach((packageData: any) => {
            packageData.line_items.forEach((lineItem: any) => {
                if (!lineItem.ignore_on_customs) {
                    postNLData.Shipments[0].Customs = {
                        Content: [{
                            CountryOfOrigin: lineItem.country_of_manufacture || "NL",
                            Description: lineItem.customs_description || "description",
                            HSTariffNr: lineItem.tariff_code,
                            Quantity: lineItem.quantity || 1,
                            Value: parseFloat(lineItem.customs_value),
                            Weight: convertOzToGrams(lineItem.weight) 
                        }],
                        Currency: "EUR", // Assuming the currency is USD, you might need to adjust this based on your actual data
                        HandleAsNonDeliverable: false,
                        Invoice: true,
                        InvoiceNr: "22334455",
                        ShipmentType: "Commercial Goods"
                    };
                }
            });
        });
    }
    
    
    let found = shipHeroData.to_address.name.match(/[ ]+/g);
  if (found && found.length > 0 && found[0]) {
    postNLData.Shipments[0].Addresses[0].FirstName = 
        shipHeroData.to_address.name.substring(0, shipHeroData.to_address.name.indexOf(found[0])).trim();;
        postNLData.Shipments[0].Addresses[0].Name = 
        shipHeroData.to_address.name.substring(shipHeroData.to_address.name.indexOf(found[0])).trim();
  } 
  found = shipHeroData.to_address.address_1.match(/[0-9]+/g);
  
  if ((shipHeroData.to_address.country == 'BE' 
    || shipHeroData.to_address.country == 'NL' 
    || shipHeroData.to_address.country == 'LU') 
    && found && found.length > 0 && found[0]) {
        postNLData.Shipments[0].Addresses[0].HouseNr = found[0];
        postNLData.Shipments[0].Addresses[0].Street = 
        shipHeroData.to_address.address_1.replace(found[0], '').trim();
  }
  let orderNumCleaned = `${shipHeroData.order_number.replace(/[#]+[A-Z]+/gi, '')}`; 
  postNLData.Shipments[0].CustomerOrderNumber = orderNumCleaned;




    return postNLData;
}

export async function getBarcode(customer_code: string, customer_number: string) {
    const apiKey = process.env.POSTNL_API_KEY;

    try {
        const response = await axios.get(
            'https://api-sandbox.postnl.nl/shipment/v1_1/barcode',
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
        console.error('Error fetching barcode:', error);
        // Handle errors here
        throw error;
    }
}
