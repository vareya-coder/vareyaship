import { ShipHeroWebhook, AsendiaParcelRequest } from "../types";
import { config } from 'dotenv';
import { logger } from '@/utils/logger';
import { Decimal } from 'decimal.js';
import type { ResolvedAsendiaCustomerMapping } from '@/modules/asendia/customers/customer.service';
import {
  requiresAsendiaReceiverTaxId,
} from '@/modules/vacierLatamCustoms/latamConfig';
import {
  resolveVacierLatamLabelOverride,
  validateVacierLatamShipmentOverrides,
  type VacierLatamLabelOverrideMap,
} from '@/modules/vacierLatamCustoms/labelOverrides.service';
import {
  isVacierTurkeyShipment,
  resolveVacierTurkeyCustomsOverride,
  type VacierTurkeyCustomsOverrideMap,
} from '@/modules/vacierTurkeyCustoms/customs.service';

const ASENDIA_PRODUCT_EPAQPLS = 'EPAQPLS';
const ASENDIA_PRODUCT_EPAQSCT = 'EPAQSCT';
const ASENDIA_SERVICE = 'CUP';
const ASENDIA_SERVICE_US = 'CPPR';
const ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY = 'PD';
const ASENDIA_ADDL_SERVICE_MAIL_DELIVERY = 'MD';
const ASENDIA_ADDL_SERVICE_SIG = 'SIG';
const ASENDIA_FORMAT_NON_BOXABLE = 'N';
const ASENDIA_FORMAT_BOXABLE = 'B';
const OZ_TO_KG_MULTIPLIER = 0.0283495231;

config();

export type MapShipHeroToAsendiaOptions = {
  vacierLatamCustomsBySku?: VacierLatamLabelOverrideMap | null;
  vacierTurkeyCustomsBySku?: VacierTurkeyCustomsOverrideMap | null;
};

export function mapShipHeroToAsendia(
  shipHeroData: ShipHeroWebhook,
  customerMapping: ResolvedAsendiaCustomerMapping,
  options: MapShipHeroToAsendiaOptions = {},
): AsendiaParcelRequest {
  function convertOzToKg(weightInOz: number): number {
    return new Decimal(weightInOz)
      .times(OZ_TO_KG_MULTIPLIER)
      .toDecimalPlaces(3)
      .toNumber();
  }

  function getLineItemUnitWeightKg(weightInOz: number): Decimal {
    return new Decimal(convertOzToKg(weightInOz || 0));
  }

  function getTotalWeightKg(): number {
    let totalWeightKg = new Decimal(0);
    shipHeroData.packages.forEach((packageItem) => {
      if (packageItem.line_items && Array.isArray(packageItem.line_items)) {
        packageItem.line_items.forEach((lineItem) => {
          const quantity = new Decimal(lineItem.quantity ?? 1);
          const unitWeightKg = getLineItemUnitWeightKg(lineItem.weight);
          totalWeightKg = totalWeightKg.plus(unitWeightKg.times(quantity));
        });
      }
    });
    return totalWeightKg.toDecimalPlaces(4).toNumber();
  }

  function getLineItemProductDescription(lineItem: any): string {
    const productDescription = String(lineItem.product_name ?? lineItem.name ?? lineItem.sku ?? '').trim();
    return productDescription || 'description';
  }

  if (shipHeroData.to_address.country === 'UK') {
    shipHeroData.to_address.country = 'GB';
  }

  const isVacierLatamDestination = !!options.vacierLatamCustomsBySku;
  const isVacierTurkeyDestination = isVacierTurkeyShipment(shipHeroData)
    && !!options.vacierTurkeyCustomsBySku;
  const receiverTaxIdRequired = isVacierLatamDestination
    && requiresAsendiaReceiverTaxId(shipHeroData.to_address.country);
  if (receiverTaxIdRequired && !String(shipHeroData.tax_id ?? '').trim()) {
    throw new Error(`Missing required receiverTaxId/tax_id for Asendia LATAM destination ${shipHeroData.to_address.country}`);
  }
  const latamValidation = options.vacierLatamCustomsBySku
    ? validateVacierLatamShipmentOverrides(shipHeroData, options.vacierLatamCustomsBySku)
    : null;

  let shipmentToAddress1 = shipHeroData.to_address.address_1;
  let shipmentToAddress2 = '';
  if (shipHeroData.to_address.address_2) {
    const found = shipHeroData.to_address.address_2.match(/^[0-9]+/g);
    if (found && !shipHeroData.to_address.address_1.match(/^[0-9]+/g)) {
      shipmentToAddress1 = `${shipHeroData.to_address.address_1} ${shipHeroData.to_address.address_2}`;
    } else {
      shipmentToAddress2 = shipHeroData.to_address.address_2;
    }
  }

  let shipmentToAddressName = shipHeroData.to_address.name;
  const shipmentToAddressCompanyName = shipHeroData.to_address.company_name;
  if (!(shipHeroData.to_address.name && shipHeroData.to_address.name.trim() !== '')) {
    shipmentToAddressName = shipHeroData.to_address.company_name;
  }

  const orderNumCleaned = shipHeroData.order_number.replace(/[#A-Z-]+/gi, '');
  const referenceNumber = `${orderNumCleaned}P${Date.now()}`;
  logger.info(orderNumCleaned);
  logger.info(referenceNumber);

  let shipmentAsendiaProduct = '';
  if (shipHeroData.shipping_method.includes('epaqpls')) {
    shipmentAsendiaProduct = ASENDIA_PRODUCT_EPAQPLS;
  } else if (shipHeroData.shipping_method.includes('epaqsct')) {
    shipmentAsendiaProduct = ASENDIA_PRODUCT_EPAQSCT;
  }

  let shipmentAsendiaAddlService: string[] = [];
  if (shipHeroData.shipping_method.includes('personal-delivery')) {
    shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_PERSONAL_DELIVERY];
  } else if (shipHeroData.shipping_method.includes('mailbox-delivery')) {
    shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_MAIL_DELIVERY];
  } else if (shipHeroData.shipping_method.includes('signature')) {
    shipmentAsendiaAddlService = [ASENDIA_ADDL_SERVICE_SIG];
  }

  const shipmentAsendiaFormat: "N" | "B" = shipHeroData.shipping_method.includes('boxable')
    ? ASENDIA_FORMAT_BOXABLE
    : ASENDIA_FORMAT_NON_BOXABLE;

  logger.info(JSON.stringify({
    accountId: customerMapping.accountId,
    customerName: customerMapping.customerName,
    crmId: customerMapping.crmId,
    senderTaxCode: customerMapping.senderTaxCode,
  }));

  const shipmentCustomer = customerMapping.customerName;
  const shipmentCustomerCrmId = customerMapping.crmId;
  const shipmentCustomerSenderTaxCode = customerMapping.senderTaxCode ?? '';

  const asendiaRequestData: AsendiaParcelRequest = {
    customerId: shipmentCustomerCrmId,
    labelType: "PDF",
    referencenumber: referenceNumber,
    senderTaxId: shipmentCustomerSenderTaxCode,
    ...(receiverTaxIdRequired ? { receiverTaxId: String(shipHeroData.tax_id).trim() } : {}),
    weight: getTotalWeightKg(),
    asendiaService: {
      format: shipmentAsendiaFormat,
      product: shipmentAsendiaProduct,
      service: shipHeroData.to_address.country === 'US'? ASENDIA_SERVICE_US : ASENDIA_SERVICE,
      options: shipmentAsendiaAddlService,
      insurance: "",
      returnLabelOption: {
        enabled: false,
        type: "",
        payment: "",
      },
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
        province: "Brabant",
        country: "NL",
        email: "info@vareya.nl",
        phone: "0763030540",
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
        phone: shipHeroData.to_address.phone,
      },
      importer: {
        name: shipmentToAddressName,
        company: shipmentToAddressCompanyName,
        address1: shipmentToAddress1,
        address2: shipmentToAddress2,
        postalCode: shipHeroData.to_address.zip,
        city: shipHeroData.to_address.city,
        country: shipHeroData.to_address.country,
        email: shipHeroData.to_address.email,
        phone: shipHeroData.to_address.phone,
      },
    },
  };

  const orderCurrency = latamValidation?.currency ?? 'EUR';
  asendiaRequestData.customsInfo = {
    currency: orderCurrency,
    items: [],
  };

  shipHeroData.packages.forEach((packageData) => {
    packageData.line_items!.forEach((lineItem) => {
      if (lineItem.ignore_on_customs) return;

      const vacierTurkeyOverride = isVacierTurkeyDestination
        ? resolveVacierTurkeyCustomsOverride(lineItem.sku, options.vacierTurkeyCustomsBySku)
        : null;
      const vacierLatamOverride = isVacierLatamDestination
        ? resolveVacierLatamLabelOverride(
            lineItem.sku,
            shipHeroData.to_address.country,
            options.vacierLatamCustomsBySku,
          )
        : null;
      let priceAsFloat = 0.0;
      if (isVacierTurkeyDestination) {
        priceAsFloat = vacierTurkeyOverride?.customsValue ?? 0;
      } else if (vacierLatamOverride) {
        priceAsFloat = vacierLatamOverride.customsValue;
      } else if (lineItem.price !== null) {
        priceAsFloat = lineItem.price;
      }

      if (!isVacierTurkeyDestination && !isVacierLatamDestination && priceAsFloat <= 0.0) {
        priceAsFloat = 0.01;
      }

      if (!isVacierTurkeyDestination && !isVacierLatamDestination && shipHeroData.order_number.indexOf('BBSPY') >= 0) {
        priceAsFloat = 25.0;
      } else if (!isVacierTurkeyDestination && !isVacierLatamDestination) {
        if (priceAsFloat == 0.0) {
          priceAsFloat = 1.0;
        }

        if (shipHeroData.to_address.country == 'NO' || shipHeroData.to_address.country == 'CH') {
          priceAsFloat = 3.0;
        }

        if (shipHeroData.to_address.country == 'TR') {
          priceAsFloat = [0.75, 0.8, 0.85, 0.9].at(Math.floor(Math.random() * 4)) as number;
        }

        if ((shipHeroData.to_address.country == 'IL'
          && (`${shipHeroData.account_id}`) == '59965') || (`${shipHeroData.account_id}`) == '63984' || (`${shipHeroData.account_id}`) == '63932') {
          priceAsFloat = 5.0;
        }

        if (priceAsFloat > 5.0) {
          if ((shipHeroData.to_address.country == 'GB'
            && (`${shipHeroData.account_id}`) == '59965') || (`${shipHeroData.account_id}`) == '63984' || (`${shipHeroData.account_id}`) == '63932') {
            priceAsFloat = 3.0;
          }
        }
      }

      if (isVacierTurkeyDestination && !vacierTurkeyOverride) {
        logger.warn('vacier_turkey_customs_sku_missing', {
          sku: lineItem.sku,
          order_id: shipHeroData.order_id,
          order_number: shipHeroData.order_number,
        } as any);
      }

      const articleDescription = isVacierTurkeyDestination
        ? vacierTurkeyOverride?.customsDescription ?? getLineItemProductDescription(lineItem)
        : getLineItemProductDescription(lineItem);
      const harmonizationCode = String(
        isVacierTurkeyDestination && vacierTurkeyOverride?.tariffCode
          ? vacierTurkeyOverride.tariffCode
          : lineItem.tariff_code ?? '',
      ).replace(/\./g, '');

      if (vacierLatamOverride) {
        logger.info('vacier_latam_customs_override_applied', {
          carrier: 'Asendia',
          order_id: shipHeroData.order_id,
          order_number: shipHeroData.order_number,
          destination_country: shipHeroData.to_address.country,
          sku: lineItem.sku,
          quantity: lineItem.quantity,
          unit_value: vacierLatamOverride.customsValueFormatted,
          currency: vacierLatamOverride.currency,
          description: articleDescription,
          source: vacierLatamOverride.source,
        } as any);
      }

      asendiaRequestData.customsInfo!.items.push({
        articleDescription,
        unitValue: priceAsFloat,
        currency: vacierLatamOverride?.currency ?? orderCurrency,
        harmonizationCode,
        originCountry: lineItem.country_of_manufacture || "NL",
        unitWeight: getLineItemUnitWeightKg(lineItem.weight).toNumber(),
        quantity: lineItem.quantity,
      });
    });
  });

  return asendiaRequestData;
}
