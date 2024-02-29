import { ShipHeroWebhook } from "../types";
import { Data } from "./postnltypes";
import { config } from 'dotenv';
import axios from "axios";

config();

export async function mapShipHeroToPostNL(shipHeroData: ShipHeroWebhook, Product_code: string) {
    console.log(JSON.stringify(shipHeroData));
    const EU: any = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

    const customer_code: string = process.env.CUSTOMER_CODE as string;
    const customer_number: string = process.env.CUSTOMER_NUMBER as string;
    const barcode: string = await getBarcode(customer_code, customer_number);
    function convertOzToGrams(weightInOz: any) {
        const grams = weightInOz * 28.3495;
        return Math.round(grams);
    }

    if (shipHeroData.to_address.country == 'UK') {
        shipHeroData.to_address.country = 'GB';

    }
    function getTotalWeight() {
        let totalWeight = 0;

        shipHeroData.packages.forEach(packageItem => {
            if (packageItem.line_items && Array.isArray(packageItem.line_items)) {
                packageItem.line_items.forEach(lineItem => {
                    totalWeight += lineItem.weight || 0;
                });
            }
        });
        const weightinGrams = convertOzToGrams(totalWeight)

        return weightinGrams;
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
                Zipcode: shipHeroData.from_address.zip
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
                Name: shipHeroData.to_address.name,
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
                Weight: `${getTotalWeight()}`,
            },
            ProductCodeDelivery: Product_code,
            Reference: "reference for Sender"
        }],
    };

    //Check if the destination country is not in the EU
    if (!EU.includes(shipHeroData.to_address?.country)) {
        if (!postNLData.Shipments) {
            postNLData.Shipments = [{}];
        }

        postNLData.Shipments[0].Customs = {
            Content: [],
            Currency: "EUR",
            HandleAsNonDeliverable: false,
            Invoice: true,
            InvoiceNr: "22334455",
            ShipmentType: "Commercial Goods",

        };
        if (shipHeroData.tax_type == 'VAT' && shipHeroData.to_address.country == 'NO') {
            postNLData.Shipments[0].Customs.TrustedShipperID = shipHeroData.tax_id as string
        }

        // if(shipHeroData.tax_type == 'VOEC' || shipHeroData.to_address.country == 'NO'){
        //     postNLData.Shipments[0].Customs.TrustedShipperID =`VOEC${shipHeroData.tax_id}`

        // }
        // if(shipHeroData.tax_type=='VAT' || shipHeroData.tax_type == 'EORI'){
        //     if(shipHeroData.to_address.country =='GR'){
        //         postNLData.Shipments[0].TrustedShipperID =`EL${shipHeroData.tax_id}` 
        //     }else{
        //         postNLData.Shipments[0].TrustedShipperID =`${shipHeroData.to_address.country}${shipHeroData.tax_id}`
        //     }
        // }



        shipHeroData.packages.forEach((packageData: any) => {
            packageData.line_items.forEach((lineItem: any) => {
                if (!lineItem.ignore_on_customs) {
                    let priceAsFloat = 0.0;
                    if (lineItem.price !== null
                        && lineItem.price !== '') {
                        priceAsFloat = parseFloat(lineItem.price);
                    }

                    if (shipHeroData.order_number.indexOf('BBSPY') >= 0) {
                        priceAsFloat = 25.0;
                    } else {
                        // TODO - temporary fix below to keep PostNL quiet. Need to remove this alteration when ShipHero fixes 0.0 price error
                        if (priceAsFloat == 0.0) {
                            priceAsFloat = 1.0;
                        }

                        // TODO temporary Norway check. Need to fix it properly later.
                        if (shipHeroData.to_address.country == 'NO' || shipHeroData.to_address.country == 'CH') {
                            priceAsFloat = 3.0;
                        }

                        if ((shipHeroData.to_address.country == 'SA' || shipHeroData.to_address.country == 'IL' || shipHeroData.to_address.country == 'IS' || shipHeroData.to_address.country == 'AE')
                            && (('' + shipHeroData.account_id) == '59965') || (('' + shipHeroData.account_id) == '63984') || (('' + shipHeroData.account_id) == '63932')) {
                            priceAsFloat = 5.0;
                        }

                        if (shipHeroData.to_address.country == 'GB') {
                            priceAsFloat = 1.0;
                        }
                    }
                    let Value: any = priceAsFloat * lineItem.quantity



                    if (postNLData.Shipments[0].Customs && postNLData.Shipments[0].Customs.Content) {
                        postNLData.Shipments[0].Customs.Content.push({
                            CountryOfOrigin: lineItem.country_of_manufacture || "NL",
                            Description: lineItem.customs_description || "description",
                            HSTariffNr: lineItem.tariff_code,
                            Quantity: lineItem.quantity,
                            Value: parseFloat(Value),
                            Weight: convertOzToGrams(lineItem.weight)

                        });
                    }
                }
            });
        });
    }




    let found = shipHeroData.to_address.name.match(/[ ]+/g);
    if (found && found.length > 0 && found[0] && postNLData.Shipments[0].Addresses) {
        postNLData.Shipments[0].Addresses[0].FirstName = shipHeroData.to_address.name.substring(0, shipHeroData.to_address.name.indexOf(found[0])).trim();;
        postNLData.Shipments[0].Addresses[0].Name = shipHeroData.to_address.name.substring(shipHeroData.to_address.name.indexOf(found[0])).trim();
    }
    found = shipHeroData.to_address.address_1.match(/[0-9]+/g);

    if ((shipHeroData.to_address.country == 'BE'
        || shipHeroData.to_address.country == 'NL'
        || shipHeroData.to_address.country == 'LU')
        && found && found.length > 0 && found[0] && postNLData.Shipments[0].Addresses) {
        postNLData.Shipments[0].Addresses[0].HouseNr = found[0];
        postNLData.Shipments[0].Addresses[0].Street =
            shipHeroData.to_address.address_1.replace(found[0], '').trim();
    }
    let orderNumCleaned = `${shipHeroData.order_number.replace(/[#]+[A-Z]+/gi, '')}`;
    postNLData.Shipments[0].CustomerOrderNumber = orderNumCleaned;



    // console.log(JSON.stringify(postNLData))
    return postNLData;
}

export async function getBarcode(customer_code: string, customer_number: string) {
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
        console.error('Error fetching barcode:', error);
        // Handle errors here
        throw error;
    }
}
